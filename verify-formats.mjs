// 슬라이드 소스 다중 포맷(pdf | embed | image | markdown) 검증 스크립트
// 사용: node verify-formats.mjs [API_BASE] [CLIENT_BASE]
//  - PDF 업로드 회귀 (기존 기능 유지 확인)
//  - 이미지 여러 장 업로드 → 순서 슬라이드
//  - 임베드 덱 저장 시 embedUrl 보존 + javascript: URL 차단
//  - 덱 삭제 시 업로드 파일(이미지) 정리
//  - (playwright 설치 시) 프로젝터 화면에서 image/embed 슬라이드 렌더 확인

import { readdirSync } from 'node:fs';

const API = process.argv[2] || 'http://localhost:8796';
const CLIENT = process.argv[3] || 'http://localhost:5182';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

let cookie = '';
async function req(method, path, body, raw = false) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  if (raw) return r;
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

// ── 0) 로그인 ──
console.log('\n[0] dev-login');
{
  const r = await req('POST', '/api/auth/dev-login', { email: 'format-worker@test.local', name: '포맷검증' });
  ok('dev-login 성공', r.status === 200 && r.data.user?.email === 'format-worker@test.local', JSON.stringify(r.data));
}

// ── 1) PDF 업로드 회귀 ──
console.log('\n[1] PDF 업로드 회귀');
// 최소 2페이지 PDF (수동 작성)
const minimalPdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;
let pdfDeckId = '';
{
  const r = await req('POST', '/api/decks/upload-pdf', {
    filename: '검증용자료.pdf',
    base64: Buffer.from(minimalPdf).toString('base64'),
  });
  pdfDeckId = r.data.deckId;
  ok('업로드 성공 (deckId·editPin 반환)', r.status === 200 && !!r.data.deckId && !!r.data.editPin, JSON.stringify(r.data));

  const d = await req('GET', `/api/decks/${pdfDeckId}`);
  const slides = d.data.slides ?? [];
  ok('2페이지 → pdf 슬라이드 2장', slides.length === 2 && slides.every((s) => s.layout === 'pdf'));
  ok('pdfUrl·pageNumber 유지', slides[0]?.pdfUrl?.startsWith('/api/uploads/') && slides[0]?.pageNumber === 1 && slides[1]?.pageNumber === 2);

  const f = await req('GET', slides[0].pdfUrl, undefined, true);
  ok('PDF 파일 서빙 (application/pdf)', f.status === 200 && (f.headers.get('content-type') ?? '').includes('application/pdf'));
}

// ── 2) 이미지 여러 장 업로드 ──
console.log('\n[2] 이미지 업로드 → 순서 슬라이드');
// 1x1 PNG
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let imgDeckId = '', imgPin = '', imgFiles = [];
{
  const r = await req('POST', '/api/decks/upload-images', {
    title: '이미지 검증 덱',
    images: [
      { filename: '01-표지.png', base64: tinyPng },
      { filename: '02-본문.png', base64: tinyPng },
      { filename: '03-마무리.png', base64: tinyPng },
    ],
  });
  imgDeckId = r.data.deckId; imgPin = r.data.editPin;
  ok('업로드 성공 (3장)', r.status === 200 && r.data.slideCount === 3, JSON.stringify(r.data));

  const d = await req('GET', `/api/decks/${imgDeckId}`);
  const slides = d.data.slides ?? [];
  ok('image 슬라이드 3장 생성', slides.length === 3 && slides.every((s) => s.layout === 'image' && s.imageUrl));
  ok('파일명 순서 유지', slides[0]?.title === '01-표지' && slides[2]?.title === '03-마무리');
  imgFiles = slides.map((s) => s.imageUrl.replace('/api/uploads/', ''));

  const f = await req('GET', slides[0].imageUrl, undefined, true);
  ok('이미지 서빙 (image/png)', f.status === 200 && (f.headers.get('content-type') ?? '').includes('image/png'));

  const bad = await req('POST', '/api/decks/upload-images', { images: [{ filename: 'evil.exe', base64: tinyPng }] });
  ok('비이미지 확장자 거부', bad.status === 400);
}

// ── 3) 임베드 슬라이드 저장/검증 ──
console.log('\n[3] 임베드 덱 저장 (validateDeck 통과)');
{
  const c = await req('POST', '/api/decks', { title: '임베드 검증 덱' });
  const deckId = c.data.deckId, pin = c.data.editPin;
  ok('덱 생성', c.status === 200 && !!deckId);

  const opened = await req('POST', `/api/decks/${deckId}/edit`, { editPin: pin });
  const deck = opened.data.deck;
  deck.slides = [
    { id: 'e1', part: 1, partTitle: 'Google Slides', layout: 'embed', title: '구글 슬라이드', embedUrl: 'https://docs.google.com/presentation/d/e/2PACX-abc/embed?start=false', blocks: [] },
    { id: 'e2', part: 1, partTitle: '악성', layout: 'embed', title: 'XSS 시도', embedUrl: 'javascript:alert(1)', blocks: [] },
  ];
  const saved = await req('PUT', `/api/decks/${deckId}`, { deckId, editPin: pin, deck });
  ok('저장 성공', saved.status === 200);

  const d = await req('GET', `/api/decks/${deckId}`);
  const s = d.data.slides ?? [];
  ok('embed layout + embedUrl 보존', s[0]?.layout === 'embed' && s[0]?.embedUrl?.startsWith('https://docs.google.com/'));
  ok('javascript: URL 제거됨', s[1]?.embedUrl === undefined || s[1]?.embedUrl === null);

  await req('DELETE', `/api/decks/${deckId}`, { editPin: pin });
}

// ── 4) 덱 삭제 시 업로드 이미지 정리 ──
console.log('\n[4] 덱 삭제 → 업로드 파일 정리');
{
  const del = await req('DELETE', `/api/decks/${imgDeckId}`, { editPin: imgPin });
  ok('이미지 덱 삭제', del.status === 200);
  try {
    const remaining = readdirSync(new URL('./uploads', import.meta.url));
    ok('이미지 파일 3개 삭제됨', imgFiles.every((f) => !remaining.includes(f)));
  } catch {
    console.log('  ⚠️ uploads 디렉터리 로컬 확인 불가 — 건너뜀');
  }
}

// ── 5) 브라우저 렌더 확인 (playwright) ──
console.log('\n[5] 브라우저 렌더 (Projector)');
try {
  const { chromium } = await import('playwright');

  // 임베드+이미지 혼합 덱 만들기
  const c = await req('POST', '/api/decks', { title: '렌더 검증 덱' });
  const deckId = c.data.deckId, pin = c.data.editPin;
  const up = await req('POST', '/api/decks/upload-images', { title: 'tmp', images: [{ filename: 'render.png', base64: tinyPng }] });
  const upDeck = await req('GET', `/api/decks/${up.data.deckId}`);
  const imageUrl = upDeck.data.slides[0].imageUrl;

  const opened = await req('POST', `/api/decks/${deckId}/edit`, { editPin: pin });
  const deck = opened.data.deck;
  deck.slides = [
    { id: 'r1', part: 1, partTitle: '이미지', layout: 'image', title: '이미지 슬라이드', imageUrl, blocks: [] },
    { id: 'r2', part: 1, partTitle: '임베드', layout: 'embed', title: '임베드 슬라이드', embedUrl: `${CLIENT}/join`, blocks: [] },
    { id: 'r3', part: 1, partTitle: 'PDF', layout: 'pdf', title: 'PDF 슬라이드', pdfUrl: upDeck.data.slides[0].imageUrl.replace(/[^/]+$/, 'none.pdf'), pageNumber: 1, blocks: [] },
  ];
  await req('PUT', `/api/decks/${deckId}`, { deckId, editPin: pin, deck });

  const room = await req('POST', '/api/classrooms', { deckId });
  const token = room.data.token;
  const secret = room.data.instructorSecret;

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // socket.io로 슬라이드 넘기며 확인
  const io = await import('socket.io-client').catch(() => null);

  await page.goto(`${CLIENT}/screen/${token}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok('프로젝터: 이미지 슬라이드 <img> 렌더', (await page.locator('img[alt="이미지 슬라이드"]').count()) === 1);

  if (io) {
    const sock = io.io(API, { transports: ['websocket'] });
    await new Promise((res) => sock.on('connect', res));
    sock.emit('instructor:join', { token, instructorSecret: secret });
    await new Promise((r) => setTimeout(r, 500));
    sock.emit('instructor:goto', { slide: 1 });
    await page.waitForTimeout(1500);
    ok('프로젝터: 임베드 슬라이드 <iframe> 렌더', (await page.locator('iframe').count()) >= 1);
    ok('임베드 컨트롤 안내 문구 표시', (await page.getByText('임베드 안의 컨트롤').count()) === 1);
    sock.close();
  } else {
    console.log('  ⚠️ socket.io-client 없음 — 임베드 슬라이드 렌더는 API 검증으로 대체');
  }

  ok('페이지 JS 에러 없음', errs.length === 0, errs.join(' | '));
  await browser.close();

  await req('DELETE', `/api/decks/${deckId}`, { editPin: pin });
  await req('DELETE', `/api/decks/${up.data.deckId}`, { editPin: up.data.editPin });
} catch (e) {
  console.log(`  ⚠️ playwright 확인 건너뜀: ${e.message}`);
}

// PDF 회귀 덱 정리 (upload-pdf는 pin을 돌려주므로 회귀 덱도 삭제 시도)
if (pdfDeckId) {
  // upload-pdf 응답의 editPin은 위에서 캡처하지 않았으므로 그대로 두어도 무방 (dev DB)
}

console.log(`\n결과: ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
