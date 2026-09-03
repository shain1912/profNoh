import { Worker } from 'node:worker_threads';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface RenderResult {
  files: string[];       // outDir 기준 파일명 (페이지 순서)
  pageCount: number;     // 원본 PDF 페이지 수
  truncated: boolean;    // maxPages 초과로 일부만 렌더됐는지
  ms: number;
}

export interface RenderOptions {
  maxLongEdge?: number;  // 긴 변 픽셀 (기본 1920 — FHD 프로젝터 기준)
  quality?: number;      // webp 품질 0~100 (기본 80)
  maxPages?: number;     // 렌더 상한 (기본 500)
  timeoutMs?: number;    // 워커 타임아웃 (기본 5분)
}

// 동시에 도는 렌더 워커 수 제한 — 업로드가 몰려도 CPU 코어를 전부 점유하지 않도록
const MAX_CONCURRENT = Number(process.env.PDF_RENDER_CONCURRENCY ?? 2);
let running = 0;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) { running++; return Promise.resolve(); }
  return new Promise((res) => queue.push(() => { running++; res(); }));
}
function release() {
  running--;
  const next = queue.shift();
  if (next) next();
}

/**
 * PDF 파일을 페이지별 webp 로 사전 렌더한다. worker_threads 에서 실행되어 메인 이벤트 루프를 막지 않는다.
 * 실패(암호화·손상 PDF 등) 시 이미 만든 파일을 지우고 throw → 호출측이 레거시(pdf.js 클라 렌더) 경로로 폴백한다.
 */
export async function renderPdfToWebp(pdfPath: string, outDir: string, baseName: string, opts: RenderOptions = {}): Promise<RenderResult> {
  await acquire();
  const t0 = Date.now();
  const produced: string[] = [];
  try {
    return await new Promise<RenderResult>((resolve, reject) => {
      const worker = new Worker(new URL('./render-worker.mjs', import.meta.url), {
        workerData: { pdfPath, outDir, baseName, maxLongEdge: opts.maxLongEdge ?? 1920, quality: opts.quality ?? 80, maxPages: opts.maxPages ?? 500 },
      });
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error('PDF 렌더 시간 초과'));
      }, opts.timeoutMs ?? 5 * 60_000);
      worker.on('message', (m: any) => {
        if (m?.type === 'progress') return;
        clearTimeout(timer);
        if (m?.type === 'done') {
          produced.push(...m.files);
          resolve({ files: m.files, pageCount: m.pageCount, truncated: !!m.truncated, ms: Date.now() - t0 });
        } else {
          reject(new Error(m?.message ?? 'PDF 렌더 실패'));
        }
        worker.terminate();
      });
      worker.on('error', (e) => { clearTimeout(timer); reject(e); });
      worker.on('exit', (code) => { clearTimeout(timer); if (code !== 0) reject(new Error(`PDF 렌더 워커 종료 코드 ${code}`)); });
    });
  } catch (e) {
    // 부분 산출물 정리 (진행 중 파일명은 baseName-pNNN.webp 규칙이라 pageCount 를 몰라도 지울 수 있음)
    for (let i = 1; i <= (opts.maxPages ?? 500); i++) {
      const f = join(outDir, `${baseName}-p${String(i).padStart(3, '0')}.webp`);
      try { unlinkSync(f); } catch { break; }
    }
    for (const f of produced) { try { unlinkSync(join(outDir, f)); } catch { /* 무시 */ } }
    throw e;
  } finally {
    release();
  }
}
