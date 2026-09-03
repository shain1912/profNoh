// 강당 모드(무마찰 입장 + 프로젝터 강당 모드) 검증
//   node verify-auditorium.mjs [BASE=http://localhost:5179] [API=http://localhost:8793]
// 검사 항목
//   1) settings.mode — POST /api/classrooms {mode} → 기본 classroom, auditorium 선택, 잘못된 값은 classroom
//   2) 프로젝터 대기 화면: QR 높이 ≥ 40vh, 코드·URL·"접속 n명"; 활동 중 하단 입장 바(높이 ≥12vh, QR ≥10vh)
//      접속 수는 현재 연결 기준 — 참가자 브라우저 종료 시 감소
//   3) /join?token= 진입 시 닉네임 자동 생성("형용사 동물 숫자") + 1탭 입장
//   4) 강당 타이포: 루트 폰트 150%, 선택지 색+도형, 막대 "62% · 3명" 동시 표기(투표·퀴즈 공개)
//   5) 참가자 대기 화면: 슬라이드 미러링 없음(canvas/PART 텍스트 없음)
//   6) 교실 모드는 기존 그대로: 입장 바·대기 화면 없음, 닉네임 미리 채움 없음, 폰에 슬라이드
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5179';
const API = process.argv[3] || 'http://localhost:8793';
const DIR = 'shots';
mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = { width: 1920, height: 1080 };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const errors = [];
const watch = (p, who) => {
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${who}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
};
async function waitFor(fn, { timeout = 8000, every = 150 } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await fn(); if (last) return last; } catch { /* retry */ }
    await sleep(every);
  }
  return last;
}
const postJson = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
};
const AUTO_NICK = /^\S{1,5} \S{1,4} \d{1,2}$/;

// ── 1) settings.mode ──
// 결과 공개 정책 기본값은 "마감 후 공개"(익명 시스템) — 프로젝터 실시간 막대(색·도형·퍼센트) 검증은 live 정책으로
const aud = await postJson('/api/classrooms', { mode: 'auditorium', settings: { resultsReveal: 'live' } });
const cls = await postJson('/api/classrooms', {});
const bad = await postJson('/api/classrooms', { mode: 'xyz' });
check('POST /api/classrooms {mode:auditorium} → auditorium', aud.mode === 'auditorium', aud.token);
check('POST /api/classrooms {} → classroom(기본)', cls.mode === 'classroom', cls.token);
check('POST /api/classrooms {mode:xyz} → classroom(방어)', bad.mode === 'classroom');
const info = await (await fetch(`${API}/api/classrooms/${aud.token}`)).json();
check('GET /api/classrooms/:token 에 mode 포함', info.exists && info.mode === 'auditorium');

const browser = await chromium.launch();

// ── 2) 강당 프로젝터 대기 화면 ──
const proj = await (await browser.newContext({ viewport: VIEW })).newPage();
watch(proj, 'projector');
await proj.goto(`${BASE}/screen/${aud.token}`, { waitUntil: 'networkidle' });
await proj.waitForSelector('[data-testid=entry-hero]', { timeout: 15000 });
const heroQr = await proj.locator('[data-testid=entry-hero-qr]').boundingBox();
check('대기 화면 QR 높이 ≥ 40vh', heroQr && heroQr.height >= VIEW.height * 0.4, `${Math.round(heroQr?.height ?? 0)}px / ${VIEW.height}`);
check('대기 화면 QR 이미지 생성됨', (await proj.locator('[data-testid=entry-hero-qr] img').count()) === 1);
check('대기 화면 코드 표시', (await proj.locator('[data-testid=entry-hero-code]').innerText()).trim() === aud.token);
check('대기 화면 URL 표시', (await proj.locator('[data-testid=entry-hero]').innerText()).includes('/join'));
check('대기 화면 접속 0명', (await proj.locator('[data-testid=entry-hero-count]').innerText()).includes('접속 0명'));
const rootFs = await proj.evaluate(() => getComputedStyle(document.documentElement).fontSize);
check('강당 프로젝터 루트 폰트 ×1.5 (24px)', rootFs === '24px', rootFs);
check('프로젝터 data-mode=auditorium', (await proj.locator('[data-testid=projector]').getAttribute('data-mode')) === 'auditorium');
await proj.screenshot({ path: `${DIR}/aud-projector-waiting.png` });

// ── 3) /join 닉네임 자동 생성 + 1탭 입장 ──
async function joinAuditorium(who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage();
  watch(p, who);
  await p.goto(`${BASE}/join?token=${aud.token}`, { waitUntil: 'networkidle' });
  const nick = await waitFor(async () => {
    const v = await p.locator('[data-testid=join-nick]').inputValue();
    return v.trim() ? v : null;
  });
  return { ctx, p, nick: nick ?? '' };
}
const s1 = await joinAuditorium('student1');
check('/join?token= 닉네임 자동 채움 (형용사 동물 숫자)', AUTO_NICK.test(s1.nick), JSON.stringify(s1.nick));
check('자동 닉네임 ≤ 12자', s1.nick.length <= 12, String(s1.nick.length));
check('/join 강당 카피(강연 입장)', (await s1.p.locator('h1').innerText()).includes('강연 입장'));
await s1.p.screenshot({ path: `${DIR}/aud-join.png` });
// 🎲 재생성 → 다른 값
await s1.p.locator('[data-testid=join-dice]').click();
const nick2 = await s1.p.locator('[data-testid=join-nick]').inputValue();
check('🎲 재생성 시 자동 닉네임 형식 유지', AUTO_NICK.test(nick2), nick2);
// 1탭 입장 — 입력 없이 바로 클릭
await s1.p.locator('[data-testid=join-submit]').click();
await s1.p.waitForURL('**/play**', { timeout: 8000 });
check('1탭 입장 → /play', s1.p.url().includes('/play'));

// ── 5) 참가자 대기 화면 ──
await s1.p.waitForSelector('[data-testid=waiting-screen]', { timeout: 10000 });
const s1Text = await s1.p.locator('#root').innerText();
check('참가자 대기 화면 표시("앞 화면을 봐 주세요")', s1Text.includes('앞 화면을 봐 주세요'));
check('참가자 대기 화면에 슬라이드 미러링 없음', !s1Text.includes('PART ') && (await s1.p.locator('canvas').count()) === 0);
check('참가자 대기 화면 개인정보 미수집 안내', s1Text.includes('개인정보를 수집하지 않습니다'));
await s1.p.screenshot({ path: `${DIR}/aud-student-waiting.png` });

// 접속 카운터: 1명 → 2명 → (퇴장) 1명
const count1 = await waitFor(async () => ((await proj.locator('[data-testid=entry-hero-count]').innerText()).includes('접속 1명') ? '1' : null));
check('프로젝터 접속 1명 반영', count1 === '1');
const s2 = await joinAuditorium('student2');
await s2.p.locator('[data-testid=join-submit]').click();
await s2.p.waitForURL('**/play**', { timeout: 8000 });
const count2 = await waitFor(async () => ((await proj.locator('[data-testid=entry-hero-count]').innerText()).includes('접속 2명') ? '2' : null));
check('프로젝터 접속 2명 반영', count2 === '2');
await s2.ctx.close();
const countBack = await waitFor(async () => ((await proj.locator('[data-testid=entry-hero-count]').innerText()).includes('접속 1명') ? '1' : null), { timeout: 10000 });
check('참가자 퇴장 시 접속 수 감소 (2→1)', countBack === '1');

// ── 강사 소켓 (활동 열기) ──
const inst = io(API, { transports: ['websocket'] });
await new Promise((res) => inst.on('connect', res));
inst.emit('instructor:join', { token: aud.token, instructorSecret: aud.instructorSecret });
await new Promise((res) => inst.once('state', res));

// ── 4) 투표: 하단 입장 바 + 색·도형 + 퍼센트·명수 ──
inst.emit('instructor:openActivity', { activityId: 'poll-image' });
await proj.waitForSelector('[data-testid=poll-choice]', { timeout: 8000 });
await proj.waitForSelector('[data-testid=entry-bar]', { timeout: 8000 });
const bar = await proj.locator('[data-testid=entry-bar]').boundingBox();
const barQr = await proj.locator('[data-testid=entry-bar-qr]').boundingBox();
check('활동 중 하단 입장 바 높이 ≥ 12vh', bar && bar.height >= VIEW.height * 0.12, `${Math.round(bar?.height ?? 0)}px`);
check('입장 바 QR ≥ 10vh', barQr && barQr.height >= VIEW.height * 0.10, `${Math.round(barQr?.height ?? 0)}px`);
check('입장 바 코드', (await proj.locator('[data-testid=entry-bar-code]').innerText()).trim() === aud.token);
check('입장 바 접속 카운터', (await proj.locator('[data-testid=entry-bar-count]').innerText()).includes('접속 1명'));
const pollFirst = await proj.locator('[data-testid=poll-choice]').innerText();
check('프로젝터 투표 선택지에 도형 병기(▲◆●■)', ['▲', '◆', '●', '■'].every((s) => pollFirst.includes(s)));
check('프로젝터 투표 막대 "0% · 0명" 동시 표기', /0% · 0명/.test(pollFirst));
// 학생 폰: 같은 색·도형 버튼
await s1.p.waitForSelector('[data-testid=poll-choice-buttons]', { timeout: 8000 });
const btnText = await s1.p.locator('[data-testid=poll-choice-buttons]').innerText();
check('참가자 투표 버튼 도형 병기', ['▲', '◆', '●', '■'].every((s) => btnText.includes(s)));
const btnClass = await s1.p.locator('[data-testid=poll-choice-buttons] button').first().getAttribute('class');
check('참가자 첫 버튼 색 = 프로젝터 첫 선택지 색(bg-red-500)', (btnClass ?? '').includes('bg-red-500'));
await s1.p.screenshot({ path: `${DIR}/aud-student-poll.png` });
await s1.p.locator('[data-testid=poll-choice-buttons] button').first().click();
const stat = await waitFor(async () => {
  const t = await proj.locator('[data-testid=poll-stat]').first().innerText();
  return t.includes('100% · 1명') ? t : null;
});
check('투표 후 프로젝터 막대 "100% · 1명"', stat === '100% · 1명', stat ?? '');
await proj.screenshot({ path: `${DIR}/aud-projector-poll.png` });

// 퀴즈 공개 화면 퍼센트+명수
inst.emit('instructor:openActivity', { activityId: 'quiz-warmup' });
await sleep(400);
inst.emit('instructor:quizStart');
await s1.p.waitForSelector('text=문제 1 /', { timeout: 8000 });
await s1.p.locator('button:has-text("▲")').first().click();
await sleep(400);
inst.emit('instructor:quizReveal');
const qstat = await waitFor(async () => {
  const items = await proj.locator('[data-testid=quiz-reveal-stat]').allInnerTexts();
  return items.length ? items : null;
});
check('퀴즈 공개 선택지에 "n% · n명" 동시 표기', Array.isArray(qstat) && qstat.some((t) => /100% · 1명/.test(t)), JSON.stringify(qstat));
await proj.screenshot({ path: `${DIR}/aud-projector-quiz-reveal.png` });

// 활동 닫기 → 대기 화면 복귀, S 키로 슬라이드 보기(입장 바 유지)
inst.emit('instructor:closeActivity');
await proj.waitForSelector('[data-testid=entry-hero]', { timeout: 8000 });
check('활동 닫으면 대기 화면 복귀', true);
await proj.keyboard.press('KeyS');
await sleep(300);
const slideShown = (await proj.locator('[data-testid=entry-hero]').count()) === 0 && (await proj.locator('[data-testid=entry-bar]').count()) === 1;
check('S 키: 슬라이드 보기 + 하단 입장 바 유지', slideShown);
await proj.screenshot({ path: `${DIR}/aud-projector-slide-bar.png` });
await proj.keyboard.press('KeyS');
await sleep(300);
check('S 키 재입력: 대기 화면 복귀', (await proj.locator('[data-testid=entry-hero]').count()) === 1);
check('참가자는 활동 닫힌 뒤에도 대기 화면(슬라이드 없음)', (await s1.p.locator('[data-testid=waiting-screen]').count()) === 1);
inst.close();

// ── 6) 교실 모드 = 기존 그대로 ──
const proj2 = await (await browser.newContext({ viewport: VIEW })).newPage();
watch(proj2, 'projector-classroom');
await proj2.goto(`${BASE}/screen/${cls.token}`, { waitUntil: 'networkidle' });
await proj2.waitForSelector('[data-testid=projector]', { timeout: 15000 });
await sleep(500);
check('교실 프로젝터: 입장 바·대기 화면 없음', (await proj2.locator('[data-testid=entry-bar], [data-testid=entry-hero]').count()) === 0);
check('교실 프로젝터: 슬라이드 표시', (await proj2.locator('#root').innerText()).includes('PART'));
const rootFs2 = await proj2.evaluate(() => getComputedStyle(document.documentElement).fontSize);
check('교실 프로젝터 루트 폰트 기본(16px)', rootFs2 === '16px', rootFs2);
await proj2.screenshot({ path: `${DIR}/cls-projector.png` });
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const s3 = await c3.newPage();
watch(s3, 'student-classroom');
await s3.goto(`${BASE}/join?token=${cls.token}`, { waitUntil: 'networkidle' });
await sleep(800);
check('교실 /join: 닉네임 미리 채움 없음', (await s3.locator('[data-testid=join-nick]').inputValue()) === '');
check('교실 /join: 기존 카피(강의실 입장)', (await s3.locator('h1').innerText()).includes('강의실 입장'));
await s3.locator('[data-testid=join-nick]').fill('가나');
await s3.locator('[data-testid=join-submit]').click();
await s3.waitForURL('**/play**', { timeout: 8000 });
await sleep(1200);
check('교실 참가자: 슬라이드 미러링 유지', (await s3.locator('#root').innerText()).includes('PART') && (await s3.locator('[data-testid=waiting-screen]').count()) === 0);
await s3.screenshot({ path: `${DIR}/cls-student.png` });

// ── 강사 시작 UI 모드 선택 ──
// DEV_LOGIN=1 + DB(axedu_users)가 있으면 실제 dev-login, 아니면 /api/auth/me 응답만 가짜 사용자로 대체해
// AuthGate 를 통과시킨다 (강의실 생성 API 자체는 로그인 불필요 → UI 검증에 충분).
const tp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
watch(tp, 'teacher');
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
const login = await tp.evaluate(async () => {
  const r = await fetch('/api/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'verify-auditorium@test.local', name: '강당검증' }),
  });
  return r.status;
});
if (login !== 200) {
  console.log(`⚠️  dev-login ${login} (DB 미구성) — /api/auth/me 를 가짜 사용자로 대체해 강사 UI만 검증`);
  await tp.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { user: { id: 'verify', email: 'verify-auditorium@test.local', name: '강당검증', role: 'teacher' } } }),
  );
}
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.waitForSelector('[data-testid=mode-select]', { timeout: 10000 });
check('강의 시작 UI에 모드 선택(교실/강당) 표시', true);
check('기본 선택 = 교실', (await tp.locator('[data-testid=mode-classroom]').getAttribute('aria-checked')) === 'true');
// 교실(기본)로 시작 → 배지 없음
await tp.getByText('시작 ▶').first().click();
await tp.waitForSelector('text=강의실 코드', { timeout: 10000 });
await sleep(800);
check('교실(기본)로 시작 → 콘솔에 강당 배지 없음', (await tp.locator('[data-testid=mode-badge]').count()) === 0);
await tp.getByText('새 강의실').click();
await tp.waitForSelector('[data-testid=mode-select]', { timeout: 10000 });
await tp.locator('[data-testid=mode-auditorium]').click();
check('강당 클릭 시 선택 반영', (await tp.locator('[data-testid=mode-auditorium]').getAttribute('aria-checked')) === 'true');
await tp.screenshot({ path: `${DIR}/teach-mode-select.png` });
await tp.getByText('시작 ▶').first().click();
const badge = await waitFor(async () => (await tp.locator('[data-testid=mode-badge]').count()) === 1);
check('강당 선택 후 시작 → 콘솔에 "강당 모드" 배지', badge === true);
const teachToken = (await tp.locator('#root').innerText()).match(/강의실 코드\s*\n?\s*([A-Z0-9]{4,8})/)?.[1];
const teachInfo = teachToken ? await (await fetch(`${API}/api/classrooms/${teachToken}`)).json() : null;
check('강사 UI로 만든 강의실 서버 mode=auditorium', teachInfo?.mode === 'auditorium', teachToken ?? '');
await tp.screenshot({ path: `${DIR}/teach-console-auditorium.png` });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
if (errors.length) { console.log(`console errors (${errors.length}):`); errors.slice(0, 10).forEach((e) => console.log('  ' + e)); }
process.exit(failed.length ? 1 : 0);
