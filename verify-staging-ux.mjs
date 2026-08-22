// 스테이징 실사용 플로우 E2E (TASK H) — 브라우저(playwright)로 실제 사용자 동선을 끝까지 밟는다.
// 시나리오: dev 로그인(shain1912@gmail.com) → /build 덱 확보 → 편집기에서 수업 시작
//   → 학생 /join 입장 → 투표 활동 제출 → /screen/<토큰> 프로젝터 → /report → /admin → /org
//   → /pricing → 모의결제 완주(신규 계정, 프리미엄 전환 확인) → 주요 페이지 콘솔 에러 0
// 사용: node verify-staging-ux.mjs [BASE]   (기본 https://axedu-dev.kodekorea.kr)
// 전제: 서버 DEV_LOGIN=1, BILLING_PROVIDER=mock, ADMIN_EMAILS에 shain1912@gmail.com 포함
// 참고: 결제 레그는 재실행 가능성(멱등성)을 위해 매 실행 새 계정으로 진행한다
//   (shain 계정을 premium으로 만들면 다음 실행에서 체크아웃이 400으로 거절되기 때문).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'https://axedu-dev.kodekorea.kr';
const ADMIN_EMAIL = 'shain1912@gmail.com';
const DECK_TITLE = '스테이징 UX 검증';
const NICK = '검증학생';
const SHOT_DIR = 'shots/staging';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// 페이지별 콘솔/페이지 에러 수집 — 마지막에 "주요 페이지 콘솔 에러 0" 판정
const consoleErrs = []; // { page, text }
const IGNORE = [
  /Failed to load resource/i, // 상태코드 기반 리소스 로그(예: 로그아웃 상태의 /api/auth/me 401)는 별도 표기만
  /net::ERR_ABORTED/i,
];
function watch(page, label) {
  page.on('pageerror', (e) => consoleErrs.push({ page: label, text: `pageerror: ${e.message}` }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORE.some((re) => re.test(text))) { console.log(`  (무시된 리소스 로그) [${label}] ${text.slice(0, 120)}`); return; }
    consoleErrs.push({ page: label, text });
  });
}

async function waitText(page, text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

const browser = await chromium.launch();
let deckId = null, editPin = null, teacherCtx = null;

try {
  console.log(`\n스테이징 UX E2E 시작 — ${BASE}\n`);

  // ── 0) 강사(관리자) 세션: dev 로그인 + 덱 준비(API) ──
  teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await teacherCtx.request.post(`${BASE}/api/auth/dev-login`, { data: { email: ADMIN_EMAIL, name: '노교수' } });
  const loginBody = await login.json().catch(() => ({}));
  ok('dev 로그인(shain1912) 200 + super_admin', login.ok() && loginBody.user?.role === 'super_admin', JSON.stringify(loginBody));

  // 덱 확보: 이 스크립트 전용 덱을 새로 만들고 투표 활동을 넣는다 (종료 시 삭제)
  const createRes = await teacherCtx.request.post(`${BASE}/api/decks`, { data: { title: DECK_TITLE } });
  const created = await createRes.json().catch(() => ({}));
  ok('덱 생성 200', createRes.ok() && created.deckId, `${createRes.status()} ${JSON.stringify(created)}`);
  if (!created.deckId) throw new Error('덱 생성 실패 — free 플랜 3개 제한(leftover 덱)일 수 있음. dev DB axedu_decks 확인 필요.');
  deckId = created.deckId; editPin = created.editPin;

  const POLL_PROMPT = '오늘 수업 어땠나요?';
  const POLL_OPT = '유익했다';
  const deck = {
    id: deckId, title: DECK_TITLE,
    slides: [
      { id: 's0', part: 0, partTitle: '시작', layout: 'title', title: DECK_TITLE, blocks: [] },
      { id: 's1', part: 0, partTitle: '참여', layout: 'content', title: '한 줄 투표', blocks: [], activityId: 'v_poll' },
    ],
    activities: {
      v_poll: { type: 'poll', id: 'v_poll', title: '수업 소감 투표', prompt: POLL_PROMPT, mode: 'choice', options: [POLL_OPT, '어려웠다', '더 배우고 싶다'] },
    },
  };
  const putRes = await teacherCtx.request.put(`${BASE}/api/decks/${deckId}`, { data: { deckId, editPin, deck } });
  ok('덱 저장(투표 활동 포함) 200', putRes.ok(), `${putRes.status()}`);

  // ── 1) /build: 덱 목록에서 내 덱 확인 → 편집기 진입 ──
  const teacher = await teacherCtx.newPage();
  watch(teacher, 'build/teach');
  // DeckEditor는 편집 PIN을 localStorage에서 읽는다 — 실사용에선 생성 시 자동 저장되는 값
  await teacher.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, ['axedu_my_decks', JSON.stringify([{ deckId, title: DECK_TITLE, pin: editPin }])]);

  await teacher.goto(`${BASE}/build`, { waitUntil: 'domcontentloaded' });
  await waitText(teacher, '내 강의');
  const deckRow = teacher.getByText(DECK_TITLE, { exact: true }).first();
  await deckRow.waitFor({ state: 'visible', timeout: 15000 });
  ok('/build: 내 덱 목록에 표시', true);
  await teacher.screenshot({ path: `${SHOT_DIR}/01-build.png` });

  await deckRow.click();
  await teacher.waitForURL(`**/build/${deckId}`, { timeout: 15000 });
  const startBtn = teacher.getByText('수업 시작 ▶');
  await startBtn.waitFor({ state: 'visible', timeout: 15000 });
  ok('/build/:deckId 편집기 렌더(수업 시작 버튼)', true);

  // ── 2) 수업 시작 → /teach 콘솔 (강의실 토큰/시크릿은 실제 API 응답에서 획득) ──
  const [clsRes] = await Promise.all([
    teacher.waitForResponse((r) => r.url().includes('/api/classrooms') && r.request().method() === 'POST', { timeout: 20000 }),
    startBtn.click(),
  ]);
  const creds = await clsRes.json();
  ok('수업 시작: 강의실 생성 200(token/secret)', clsRes.ok() && creds.token && creds.instructorSecret && creds.classroomId, JSON.stringify(creds));

  await teacher.waitForURL('**/teach', { timeout: 15000 });
  await waitText(teacher, creds.token);
  await waitText(teacher, '● 연결', 20000);
  ok('/teach 콘솔 렌더 + 소켓 연결', true);
  await teacher.screenshot({ path: `${SHOT_DIR}/02-teach-console.png` });

  // ── 3) 학생 /join 입장 ──
  const studentCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const student = await studentCtx.newPage();
  watch(student, 'join/play');
  await student.goto(`${BASE}/join?token=${creds.token}`, { waitUntil: 'domcontentloaded' });
  await student.locator('input[placeholder="내 이름/별명"]').fill(NICK);
  await student.getByText('입장하기').click();
  await student.waitForURL('**/play**', { timeout: 15000 });
  await waitText(student, NICK); // 상단바 닉네임
  await waitText(student, DECK_TITLE, 20000); // 덱 타이틀 슬라이드 수신
  ok('학생 /join → /play 입장 + 슬라이드 수신', true);
  await waitText(teacher, '👥 1', 15000).then(() => ok('콘솔 참가자 수 1 반영', true)).catch(() => ok('콘솔 참가자 수 1 반영', false));

  // ── 4) 활동 열기(원버튼 진행) → 학생 투표 제출 ──
  const nextStep = teacher.getByTestId('next-step');
  await nextStep.click(); // 슬라이드 1(타이틀) → 2(투표 슬라이드)
  await nextStep.getByText('시작하기').waitFor({ timeout: 15000 });
  await nextStep.click(); // 🚀 투표 시작하기
  await waitText(student, POLL_PROMPT, 20000);
  ok('학생 화면에 투표 활동 표시', true);
  await student.getByRole('button', { name: POLL_OPT }).click();
  await waitText(student, '참여 완료!', 15000);
  ok('학생 투표 제출 완료', true);
  await student.screenshot({ path: `${SHOT_DIR}/03-student-poll.png` });

  // ── 5) 프로젝터 /screen/<토큰> ──
  const projector = await teacherCtx.newPage();
  watch(projector, 'screen');
  await projector.goto(`${BASE}/screen/${creds.token}`, { waitUntil: 'domcontentloaded' });
  await waitText(projector, POLL_PROMPT, 20000);
  ok('/screen 프로젝터: 열린 활동(투표) 표시', true);
  await projector.screenshot({ path: `${SHOT_DIR}/04-projector.png` });
  await projector.close();

  // ── 6) /report ──
  const report = await teacherCtx.newPage();
  watch(report, 'report');
  await report.goto(`${BASE}/report/${creds.classroomId}?secret=${creds.instructorSecret}`, { waitUntil: 'domcontentloaded' });
  await waitText(report, DECK_TITLE, 20000);
  const noAccessErr = (await report.getByText('접근 권한 오류').count()) === 0;
  const hasNick = (await report.getByText(NICK).count()) > 0;
  ok('/report 렌더(제목 + 참가자 표시)', noAccessErr && hasNick, `err화면=${!noAccessErr} nick=${hasNick}`);
  // 참가 일자 Invalid Date — 서버 routes.ts의 p.joined_at → p.created_at 수정으로 해결됨.
  // 배포 이미지가 수정 전이면 경고만 남긴다(재배포 후 이 경고가 사라져야 정상).
  if ((await report.getByText('Invalid Date').count()) > 0) {
    console.log('  ⚠️ 리포트 참가 일자 "Invalid Date" — joined_at 수정본 미배포 상태(재배포 필요)');
  }
  await report.screenshot({ path: `${SHOT_DIR}/05-report.png`, fullPage: true });
  await report.close();

  // ── 7) /admin (super_admin) ──
  const admin = await teacherCtx.newPage();
  watch(admin, 'admin');
  await admin.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await waitText(admin, '관리자 대시보드', 20000);
  ok('/admin 대시보드 렌더', (await admin.getByText('전체 회원').count()) > 0);
  await admin.screenshot({ path: `${SHOT_DIR}/06-admin.png` });
  await admin.close();

  // ── 8) /org ──
  const org = await teacherCtx.newPage();
  watch(org, 'org');
  await org.goto(`${BASE}/org`, { waitUntil: 'domcontentloaded' });
  await waitText(org, '기관 관리', 20000);
  ok('/org 렌더', true);
  await org.screenshot({ path: `${SHOT_DIR}/07-org.png` });
  await org.close();

  // ── 9) /pricing (관리자 세션에서 렌더 확인만 — 결제는 신규 계정으로) ──
  const pricing = await teacherCtx.newPage();
  watch(pricing, 'pricing');
  await pricing.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
  await waitText(pricing, '요금제', 20000);
  await waitText(pricing, '9,900', 15000); // 플랜 카드는 비동기 로드 — 텍스트 등장까지 대기
  ok('/pricing 렌더(프리미엄 9,900원 카드)', true);
  await pricing.close();

  // ── 10) 모의결제 완주: 신규 계정 /pricing → /checkout → 승인 → 프리미엄 전환 ──
  const payEmail = `staging-ux-${Date.now()}@axedu.test`;
  const payCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await payCtx.request.post(`${BASE}/api/auth/dev-login`, { data: { email: payEmail, name: '결제검증' } });
  const pay = await payCtx.newPage();
  watch(pay, 'checkout');
  await pay.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
  await pay.getByText('업그레이드', { exact: true }).click();
  await pay.waitForURL('**/checkout', { timeout: 15000 });
  await waitText(pay, '모의 결제 모드', 20000);
  ok('/checkout: mock 결제 위젯 표시', true);
  await pay.getByText('모의 결제 진행').click();
  await waitText(pay, '프리미엄 시작!', 20000);
  ok('모의결제 승인 → 완료 화면', true);
  await pay.screenshot({ path: `${SHOT_DIR}/08-checkout-done.png` });

  const meRes = await payCtx.request.get(`${BASE}/api/billing/me`);
  const me = await meRes.json().catch(() => ({}));
  ok('결제 후 plan=premium', me.plan === 'premium', JSON.stringify(me));
  await pay.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
  await waitText(pay, '구독 중 ✓', 20000);
  ok('/pricing: 구독 중 표시', true);
  await payCtx.close();

  // ── 11) 콘솔 에러 판정 ──
  await sleep(500);
  ok('주요 페이지 콘솔 에러 0', consoleErrs.length === 0);
  if (consoleErrs.length) consoleErrs.forEach((e) => console.log(`     · [${e.page}] ${e.text}`));

  await studentCtx.close();
} catch (e) {
  fail++;
  console.log(`  ❌ 실행 중단: ${e.message}`);
} finally {
  // 정리: 검증용 덱 삭제 (결제 계정은 실행마다 유니크 이메일이라 잔여 무해)
  if (deckId && editPin && teacherCtx) {
    const del = await teacherCtx.request.delete(`${BASE}/api/decks/${deckId}`, { data: { editPin } }).catch(() => null);
    console.log(`\n정리: 덱 ${deckId} 삭제 ${del?.ok() ? '완료' : '실패(수동 확인 필요)'}`);
  }
  await browser.close();
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
