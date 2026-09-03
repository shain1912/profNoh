// PDF → 페이지별 webp 렌더 워커 (worker_threads).
// 순수 JS(.mjs)로 둔 이유: tsx 는 메인 스레드만 트랜스파일하므로 Worker 엔트리는 TS 로 둘 수 없다.
// 메인 이벤트 루프(400 소켓 직렬화)를 렌더 CPU 작업이 막지 않도록 별도 스레드에서 돌린다.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const { pdfPath, outDir, baseName, maxLongEdge = 1920, quality = 80, maxPages = 500 } = workerData;

// pdf.js 동봉 표준 14폰트·CMap 경로 (임베드되지 않은 폰트·CJK 인코딩 PDF 렌더에 필요).
// 워크스페이스 호이스팅 위치가 달라도 require.resolve 로 실제 설치 경로를 찾는다.
const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const asDirUrl = (p) => pathToFileURL(p + '/').href;

async function run() {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({
    data,
    isEvalSupported: false,   // PDF 내 JS 실행 금지
    useSystemFonts: true,     // 임베드 안 된 폰트는 시스템 폰트로 대체 (Docker 는 fonts-noto-cjk 설치)
    standardFontDataUrl: asDirUrl(join(pdfjsRoot, 'standard_fonts')),
    cMapUrl: asDirUrl(join(pdfjsRoot, 'cmaps')),
    cMapPacked: true,
    disableFontFace: false,
    verbosity: 0,
  }).promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const files = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = maxLongEdge / Math.max(unscaled.width, unscaled.height);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
    const ctx = canvas.getContext('2d');
    // PDF 배경은 투명일 수 있어 흰 바탕을 먼저 칠한다 (webp 알파 → 검은 화면 방지)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const webp = await canvas.encode('webp', quality);
    const filename = `${baseName}-p${String(i).padStart(3, '0')}.webp`;
    writeFileSync(join(outDir, filename), webp);
    files.push(filename);
    page.cleanup();
    parentPort.postMessage({ type: 'progress', page: i, pageCount });
  }
  await doc.destroy();
  parentPort.postMessage({ type: 'done', files, pageCount: doc.numPages, truncated: doc.numPages > pageCount });
}

run().catch((e) => {
  parentPort.postMessage({ type: 'error', message: e?.message ?? String(e) });
});
