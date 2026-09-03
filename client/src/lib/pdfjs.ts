// pdf.js 자체 번들 — cdnjs 등 외부 CDN 을 쓰지 않는다 (기업 사내망은 외부 CDN 이 차단되는 경우가 많음).
// 본체·워커 모두 Vite 가 해시 파일명으로 빌드해 같은 출처(/assets/…)에서 서빙된다.
// 레거시 PDF 덱(서버 사전 렌더 이전 업로드)과 편집기의 PDF 텍스트 추출에서만 쓰이므로
// 호출측은 `import('../lib/pdfjs')` 로 지연 로드해 초기 번들을 키우지 않는다.
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

// 같은 URL 은 문서 프록시를 재사용 — 페이지 이동마다 getDocument 를 다시 부르지 않도록
const docCache = new Map<string, Promise<PdfDocument>>();

export function loadPdf(url: string): Promise<PdfDocument> {
  let p = docCache.get(url);
  if (!p) {
    p = pdfjsLib.getDocument({ url, isEvalSupported: false }).promise;
    p.catch(() => docCache.delete(url));
    docCache.set(url, p);
  }
  return p;
}

export { pdfjsLib };
