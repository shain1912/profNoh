// 강당 D — 브라우저 검증 (Playwright): 타이머 게이지 · 결과 숨김/공개 · 리듬 뱃지 · 입장 문구 · 강당 카피 톤
//
//   U1 입장 화면(교실): 개인정보 미수집 1줄 표시
//   U2 입장 화면(강당 mock): 존댓말 카피 ("세션 입장", "입장 코드")
//   U3 강사 콘솔: 리듬 뱃지 렌더 + 투표 슬라이드에서 타이머 선택기 표시 → 30초 타이머로 열기
//   U4 프로젝터: 원형 게이지(countdown-ring) + 결과 숨김(poll-hidden)
//   U5 참가자(교실): 투표 후 "결과는 마감 후 공개" 안내, 결과 비노출
//   U6 참가자(강당 mock): 존댓말 카피 ("진행자에게 질문하기")
//   U7 강사 "지금 마감" → 프로젝터 결과 공개(poll-results)
//   U8 리듬 뱃지: 가짜 시계로 16분/21분 경과 → warn/alert 레벨
//
// 사용: node verify-flow-ui.mjs [http://localhost:5180]
import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5180';
const API = process.argv[3] || process.env.API || 'http://localhost:8794'; // 강당 강의실 생성 + 강사 소켓
const DIR = 'shots';
mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const errors = [];
const watch = (p, who) => {
  p.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
};
const TEACHER = { id: 'u-verify', email: 'verify-flow@test.local', name: '검증강사', role: 'teacher' };
async function mockTeacherAuth(ctx) {
  await ctx.route('**/api/auth/me', (r) => r.fulfill({ json: { user: TEACHER } }));
  await ctx.route('**/api/decks', (r) =>
    r.request().method() === 'GET' ? r.fulfill({ json: [{ id: 'ai-ax-4h', title: 'AI·AX 특강 (내장)', slideCount: 36, updatedAt: new Date().toISOString() }] }) : r.continue(),
  );
}

const browser = await chromium.launch();

// ── 강사 콘솔 ──
const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await mockTeacherAuth(tctx);
const tp = await tctx.newPage();
watch(tp, 'teacher');
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.getByText('시작 ▶').first().click();
await tp.getByTestId('rhythm-badge').waitFor({ timeout: 10000 });
// 소켓 instructor:join 이 끝난 뒤에야 키보드 슬라이드 이동이 서버에 반영된다
await tp.getByText('● 연결').waitFor({ timeout: 10000 });
await sleep(800);
const token = (await tp.locator('#root').innerText()).match(/강의실 코드\s*\n?\s*([A-Z0-9]{4,8})/)[1];
console.log('TOKEN', token);
const badge = tp.getByTestId('rhythm-badge');
ok((await badge.getAttribute('data-level')) === 'ok' && /분/.test(await badge.innerText()), 'U3 리듬 뱃지 렌더(level=ok)', await badge.innerText());

// 투표 슬라이드(index 2, poll-warmup)로 이동
await tp.keyboard.press('ArrowRight');
await tp.keyboard.press('ArrowRight');
await tp.getByTestId('timer-picker').waitFor({ timeout: 5000 });
ok(true, 'U3 투표 슬라이드에서 타이머 선택기 표시');
await tp.getByTestId('timer-30').click();
await tp.getByTestId('timer-picker').locator('input[type=checkbox]').check();
ok(/⏱ 30초/.test(await tp.getByTestId('next-step').innerText()), 'U3 다음 단계 버튼에 타이머 표기', await tp.getByTestId('next-step').innerText());
await tp.screenshot({ path: `${DIR}/flow-01-teacher-timer-picker.png` });

// ── 입장 화면 (교실) ──
const s1ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const s1 = await s1ctx.newPage();
watch(s1, 'student1');
await s1.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
await sleep(500);
const joinText = await s1.locator('#root').innerText();
ok(/개인정보는 수집하지 않습니다/.test(joinText), 'U1 입장 화면 개인정보 미수집 1줄');
ok(/강의실 입장/.test(joinText) && /선생님/.test(joinText), 'U1 교실 모드 기본 카피 유지');
await s1.screenshot({ path: `${DIR}/flow-02-join-classroom.png` });
await s1.locator('input').nth(1).fill('참가자A');
await s1.getByText('입장하기').click();
await s1.waitForURL('**/play**', { timeout: 8000 });
await sleep(800);

// ── 입장 화면 (강당): 실제 강당 모드 강의실 — 모드는 소켓 스냅샷(settings.mode)이 우선이라 REST mock 으로는 안 바뀐다 ──
const aud = await (await fetch(`${API}/api/classrooms`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'auditorium' }),
})).json();
const t2 = io(API, { transports: ['websocket'] });
await new Promise((r) => t2.on('connect', r));
t2.emit('instructor:join', { token: aud.token, instructorSecret: aud.instructorSecret });
await new Promise((r) => t2.once('state', r));
const s2ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const s2 = await s2ctx.newPage();
watch(s2, 'student2');
await s2.goto(`${BASE}/join?token=${aud.token}`, { waitUntil: 'networkidle' });
await sleep(700);
// 입장 화면 컨테이너만 검사 (사이트 공용 사용 가이드 패널 텍스트 제외)
const join2 = await s2.locator('[data-mode]').first().innerText();
ok(/세션 입장/.test(join2) && /입장 코드/.test(join2) && !/선생님|친구들|학생/.test(join2), 'U2 강당 모드 입장 카피(존댓말)', join2.split('\n').slice(0, 2).join(' / '));
ok((await s2.locator('[data-mode]').first().getAttribute('data-mode')) === 'auditorium', 'U2 data-mode=auditorium');
await s2.screenshot({ path: `${DIR}/flow-03-join-auditorium.png` });
await s2.locator('input').nth(1).fill('참가자B');
await s2.getByText('입장하기').click();
await s2.waitForURL('**/play**', { timeout: 8000 });
await sleep(800);
ok((await s2.locator('button[title]').first().getAttribute('title')) === '진행자에게 질문하기', 'U6 강당 모드 참가자 카피(진행자에게 질문하기)');

// ── 프로젝터 ──
const pp = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
watch(pp, 'projector');
await pp.goto(`${BASE}/screen/${token}`, { waitUntil: 'networkidle' });
await sleep(800);

// ── 투표 열기 (30초 타이머 + 자동 공개) — 강당 강의실도 같은 조건으로 ──
await tp.getByTestId('next-step').click();
t2.emit('instructor:openActivity', { activityId: 'poll-warmup', timerSec: 30, autoReveal: true });
await pp.getByTestId('countdown-ring').waitFor({ timeout: 8000 });
const remaining = Number(await pp.getByTestId('countdown-ring').getAttribute('data-remaining'));
ok(remaining > 20 && remaining <= 30, 'U4 프로젝터 원형 게이지 표시', `남은 ${remaining}초`);
ok(await pp.getByTestId('poll-hidden').isVisible(), 'U4 프로젝터 결과 숨김(마감 전)');
await pp.screenshot({ path: `${DIR}/flow-04-projector-ring.png` });
await tp.screenshot({ path: `${DIR}/flow-05-teacher-poll-running.png` });
ok(/지금 마감/.test(await tp.getByTestId('next-step').innerText()), 'U3 강사 다음 단계 = 지금 마감', await tp.getByTestId('next-step').innerText());

// 참가자 투표
await s1.locator('input').first().fill('집중');
await s1.getByRole('button', { name: '제출' }).click();
await sleep(600);
const s1text = await s1.locator('#root').innerText();
ok(/결과는 마감 후 공개/.test(s1text), 'U5 참가자(교실): 투표 후 결과 숨김 안내', s1text.split('\n').find((l) => /마감/.test(l)));
ok(!/집중/.test(s1text.replace(/집중\s*$/m, '')) || !(await s1.locator('canvas').count()), 'U5 참가자: 마감 전 결과 미노출');
await s1.screenshot({ path: `${DIR}/flow-06-student-voted-hidden.png` });
await s2.locator('input').first().fill('성장');
await s2.getByRole('button', { name: '제출' }).click();
await sleep(600);
ok(/결과는 마감 후 공개됩니다/.test(await s2.locator('#root').innerText()), 'U6 참가자(강당): 존댓말 안내');
await s2.screenshot({ path: `${DIR}/flow-07-student-auditorium.png` });

// ── 강사 지금 마감 → 자동 공개 ──
await tp.getByTestId('next-step').click();
t2.emit('instructor:pollClose');
await pp.getByTestId('poll-results').waitFor({ timeout: 8000 });
ok((await pp.getByTestId('projector-poll').getAttribute('data-poll-closed')) === 'true', 'U7 지금 마감 → 프로젝터 closed');
ok(await pp.getByTestId('poll-results').isVisible(), 'U7 자동 공개 → 프로젝터 결과 표시');
await sleep(800);
await pp.screenshot({ path: `${DIR}/flow-08-projector-revealed.png` });
await sleep(400);
ok(/참여 완료! 친구들의 응답을 봐요/.test(await s1.locator('#root').innerText()), 'U7 참가자(교실) 결과 공개 카피');
ok(/전체 응답을 확인해 보세요/.test(await s2.locator('#root').innerText()), 'U7 참가자(강당) 결과 공개 카피');
await s1.screenshot({ path: `${DIR}/flow-09-student-revealed.png` });

// ── U8 리듬 뱃지 임계값 (가짜 시계) ──
const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await mockTeacherAuth(rctx);
const rp = await rctx.newPage();
await rp.clock.install();
await rp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await rp.getByText('시작 ▶').first().click();
await rp.getByTestId('rhythm-badge').waitFor({ timeout: 10000 });
await sleep(500);
await rp.clock.fastForward('16:00');
await sleep(300);
const b16 = rp.getByTestId('rhythm-badge');
ok((await b16.getAttribute('data-level')) === 'warn', 'U8 16분 경과 → 노랑(warn)', await b16.innerText());
await rp.screenshot({ path: `${DIR}/flow-10-rhythm-warn.png` });
await rp.clock.fastForward('05:00');
await sleep(300);
ok((await b16.getAttribute('data-level')) === 'alert', 'U8 21분 경과 → 빨강(alert)', await b16.innerText());
await rp.screenshot({ path: `${DIR}/flow-11-rhythm-alert.png` });

ok(errors.length === 0, '브라우저 pageerror 없음', errors.join(' | '));
await browser.close();
console.log(failures === 0 ? '\n🎉 verify-flow-ui: 전부 통과' : `\n💥 verify-flow-ui: ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
