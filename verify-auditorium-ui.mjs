// 강당 활동 4종 UI 스모크 (Playwright) — 강사 콘솔 ⚡OX 즉석 출제 → 학생 O/X 버튼 → 프로젝터 뷰,
// scale/survey 학생·프로젝터 화면, Q&A 패널·프로젝터 카드 뷰 렌더 확인 + 스크린샷.
// 사용법: 서버(8791)+Vite(5177) 기동 후  node verify-auditorium-ui.mjs [http://localhost:5177] [shotsDir]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync } from 'node:fs';

const WEB = process.argv[2] || 'http://localhost:5177';
const API = process.env.API || 'http://localhost:8791';
const SHOTS = process.argv[3] || './shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = '';
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return data;
}

// 덱: survey(프리셋) + scale + 슬라이드
await api('POST', '/api/auth/dev-login', { email: 'auditorium-ui@test.local', name: '강당UI' });
const { deckId, editPin } = await api('POST', '/api/decks', { title: '강당 UI 덱' });
const deck = {
  id: deckId, title: '강당 UI 덱',
  slides: [
    { id: 's0', part: 1, partTitle: '강당', layout: 'title', title: '강당 UI 검증', blocks: [], notes: '' },
    { id: 's1', part: 1, partTitle: '강당', layout: 'content', title: '척도', blocks: [], notes: '', activityId: 'a_scale' },
    { id: 's2', part: 1, partTitle: '강당', layout: 'content', title: '설문', blocks: [], notes: '', activityId: 'a_survey' },
  ],
  activities: {
    a_scale: { type: 'scale', id: 'a_scale', title: '적용 가능성', prompt: '오늘 배운 내용을 바로 적용할 수 있다고 느끼는 정도는?', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' },
    a_survey: { type: 'survey', id: 'a_survey', title: '강연 만족도 설문', intro: '1분이면 끝나요', questions: [] },
  },
};
await api('PUT', `/api/decks/${deckId}`, { deckId, editPin, deck });
const creds = await api('POST', '/api/classrooms', { deckId });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// 강사 브라우저에 dev-login 쿠키 주입 (AuthGate 통과)
const [name, value] = cookie.split('=');
await ctx.addCookies([{ name, value, url: WEB }]);
const errors = [];
const track = (p, tag) => p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));

// 강사 콘솔 (router state 로 creds 전달 — /teach 는 새로고침 시 선택 화면이라 addInitScript 로 history.state 주입)
const ins = await ctx.newPage(); track(ins, 'instructor');
await ins.goto(`${WEB}/teach`);
await ins.evaluate((c) => { history.replaceState({ usr: { creds: c }, key: 'x', idx: 0 }, '', '/teach'); }, creds);
await ins.reload();
// 선택 화면이면 첫 강의(우리 덱) 클릭 폴백
if (await ins.getByText('어떤 강의로 시작할까요').isVisible().catch(() => false)) {
  // 새 강의실이 열리므로 토큰을 다시 읽는다
  await ins.getByText('강당 UI 덱').first().click();
}
await ins.waitForSelector('[data-testid="next-step"]', { timeout: 15000 });
const token = (await ins.locator('header button.tracking-widest').first().textContent())?.trim() || creds.token;
check('강사 콘솔 진입', !!token, token);

// 학생 + 프로젝터
const stu = await ctx.newPage(); track(stu, 'student');
await stu.setViewportSize({ width: 390, height: 800 });
await stu.goto(`${WEB}/join?token=${token}`);
await stu.getByPlaceholder('내 이름/별명').fill('강당참가자');
await stu.getByRole('button', { name: /입장|시작|참여/ }).first().click().catch(() => {});
await stu.waitForURL(/\/play/, { timeout: 10000 }).catch(() => {});
const proj = await ctx.newPage(); track(proj, 'projector');
await proj.goto(`${WEB}/screen/${token}`);
await sleep(1500);
check('학생 입장 + 프로젝터 연결', stu.url().includes('/play') && (await proj.getByText('연결 중').count()) === 0);

// ── ⚡ OX 즉석 출제 ──
await ins.getByTestId('quick-ox').click();
await ins.getByTestId('quick-ox-question').fill('생성형 AI는 다음 단어를 확률로 예측한다.');
await ins.getByTestId('quick-ox-answer-O').click();
await ins.getByTestId('quick-ox-open').click();
await ins.waitForSelector('text=문제 시작', { timeout: 5000 });
await ins.getByTestId('next-step').click(); // 🎬 문제 시작
await stu.waitForSelector('button[aria-label="맞다 (O)"]', { timeout: 5000 });
await stu.screenshot({ path: `${SHOTS}/auditorium-ox-student.png` });
await proj.screenshot({ path: `${SHOTS}/auditorium-ox-projector.png` });
check('OX 즉석: 학생 O/X 대형 버튼 + 프로젝터 문항', (await proj.getByText('생성형 AI는 다음 단어를').count()) > 0);
await stu.locator('button[aria-label="맞다 (O)"]').click();
await ins.waitForSelector('text=1명 응답', { timeout: 5000 });
await ins.getByTestId('next-step').click(); // ✅ 정답 공개
await stu.waitForSelector('text=정답!', { timeout: 5000 });
await proj.screenshot({ path: `${SHOTS}/auditorium-ox-reveal-projector.png` });
check('OX 즉석: 정답 공개 → 학생 "정답!" + 리더보드', (await proj.getByText('순위').count()) > 0);
await ins.getByTestId('next-step').click(); // 🏁 퀴즈 끝 · 닫기

// ── scale ──
await ins.getByRole('button', { name: '다음 ▶' }).click().catch(() => {});
await ins.getByTestId('next-step').click(); // 🚀 척도 시작
await stu.waitForSelector('text=적용할 수 있다고', { timeout: 5000 });
await stu.screenshot({ path: `${SHOTS}/auditorium-scale-student.png` });
await stu.getByRole('button', { name: '4', exact: true }).click();
await proj.waitForSelector('text=응답 1명', { timeout: 5000 });
await proj.screenshot({ path: `${SHOTS}/auditorium-scale-projector.png` });
check('scale: 학생 5버튼 → 프로젝터 분포+평균', (await proj.getByText('4.00').count()) > 0);
await ins.getByTestId('next-step').click(); // 다음으로 ▶ (닫고 다음 슬라이드)

// ── survey ──
await ins.getByTestId('next-step').click(); // 🚀 설문 시작
await stu.waitForSelector('text=제출하기', { timeout: 5000 });
await stu.screenshot({ path: `${SHOTS}/auditorium-survey-student.png`, fullPage: true });
const cards = stu.locator('.rounded-xl.bg-surface-2');
for (let i = 0; i < 4; i++) await cards.nth(i).getByRole('button', { name: '5', exact: true }).click();
await cards.nth(4).getByRole('button', { name: '9', exact: true }).click();
await cards.nth(5).locator('textarea').fill('사례가 좋았어요');
await stu.getByRole('button', { name: /제출하기/ }).click();
await stu.waitForSelector('text=제출 완료', { timeout: 5000 });
await proj.waitForSelector('text=응답', { timeout: 5000 });
await proj.screenshot({ path: `${SHOTS}/auditorium-survey-open-projector.png` });
await ins.waitForSelector('text=1명 응답', { timeout: 5000 });
await ins.getByTestId('next-step').click(); // 📊 설문 마감
await proj.waitForSelector('text=NPS', { timeout: 5000 });
await proj.screenshot({ path: `${SHOTS}/auditorium-survey-closed-projector.png` });
await stu.screenshot({ path: `${SHOTS}/auditorium-survey-closed-student.png`, fullPage: true });
check('survey: 제출 → 마감 → 프로젝터 문항별 평균·NPS·주관식', (await proj.getByText('사례가 좋았어요').count()) > 0);

await ins.getByTestId('next-step').click(); // 설문 닫고 마치기 (활동이 열려 있으면 프로젝터는 활동 뷰 우선)
await proj.waitForSelector('text=강당 UI 검증', { timeout: 5000 }).catch(() => {});

// ── Q&A 2.0 ──
await stu.getByTestId('qa-fab').click();
await stu.getByPlaceholder(/아까 말씀하신/).fill('우리 팀에 적용하려면 무엇부터?');
await stu.getByRole('button', { name: '보내기' }).click();
await stu.waitForSelector('text=내 질문', { timeout: 5000 });
await stu.locator('button[aria-label="공감"]').first().click();
await stu.screenshot({ path: `${SHOTS}/auditorium-qa-student.png` });
await ins.getByTestId('qa-open').click();
await ins.getByTestId('qa-onscreen').click();
await proj.waitForSelector('text=👍를 눌러주세요', { timeout: 5000 });
await proj.screenshot({ path: `${SHOTS}/auditorium-qa-projector.png` });
await ins.getByRole('button', { name: '✅ 답변완료' }).first().click();
await stu.waitForSelector('text=답변됨', { timeout: 5000 });
await ins.getByTestId('qa-moderation').click();
await ins.screenshot({ path: `${SHOTS}/auditorium-qa-instructor.png` });
check('Q&A: 질문·👍·내 질문 → 프로젝터 카드 → 답변완료 → 모더레이션 토글', (await proj.getByText('우리 팀에 적용하려면').count()) > 0 && (await ins.getByText('승인 후 공개').count()) > 0);

check('브라우저 런타임 오류 0건', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
await api('DELETE', `/api/decks/${deckId}`, { editPin });

const fail = results.filter((r) => !r.ok);
console.log(`\n===== UI 결과: ${results.length - fail.length}/${results.length} 통과 · 스크린샷 ${SHOTS} =====`);
if (fail.length) { console.log('실패:', fail.map((f) => f.name).join(' | ')); process.exit(1); }
process.exit(0);
