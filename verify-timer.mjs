// 활동 타이머 · 자동 마감 · 자동 공개 E2E (소켓 레벨)
//
// 검증 항목 (R2 A5-3 / R3 결핍 12):
//   P1 타이머 투표 열기 → 프로젝터(viewer)·참가자 state.activity.poll 에 endsAt/timerSec 가 실림, 결과는 숨김(revealed=false)
//   P2 타이머 중 투표 → 집계 반영 (poll:update)
//   P3 타이머 종료 → 강사 조작 없이 closed=true, autoReveal=true 라 revealed=true 로 자동 전환
//   P4 마감 후 투표 → 거부(errmsg) + 집계 불변
//   P5 autoReveal=false 투표: 마감 후 revealed=false 유지 → 강사 pollReveal 로 공개
//   P6 타이머 없는 투표: 기존과 동일하게 처음부터 공개(revealed=true), endsAt 없음
//   P7 강사 "지금 마감"(pollClose) 이 타이머보다 먼저 마감시킴
//   Q1 퀴즈 autoReveal=true: 제한시간 종료 후 강사 조작 없이 quiz:reveal 수신
//   Q2 활동 닫기 시 예약된 타이머 해제 (닫은 뒤 늦게 reveal/close 가 오지 않음)
//
// 사용: node verify-timer.mjs [http://localhost:8794]
// 서버는 내장 덱(ai-ax-4h)의 poll-warmup / quiz-warmup(15초 문항) 을 사용한다.
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:8794';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

// ── 강의실 생성 ──
const created = await fetch(`${BASE}/api/classrooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: '타이머 E2E' }),
}).then((r) => r.json());
const { token, instructorSecret } = created;
console.log('classroom', token);

// 소켓 헬퍼 — 최신 state / 이벤트 수집
function connect(name) {
  const s = io(BASE, { transports: ['websocket'] });
  const box = { s, name, state: null, polls: {}, reveals: [], questions: [], errs: [], notices: [] };
  s.on('state', (snap) => (box.state = snap));
  s.on('poll:update', (p) => (box.polls[p.activityId] = p.distribution));
  s.on('quiz:reveal', (r) => box.reveals.push({ ...r, at: Date.now() }));
  s.on('quiz:question', (q) => box.questions.push(q));
  s.on('errmsg', (e) => box.errs.push(e.message));
  s.on('notice', (n) => box.notices.push(n.message));
  return box;
}
const waitFor = async (fn, ms = 5000, step = 50) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(step);
  }
  return fn();
};

const teacher = connect('teacher');
const viewer = connect('viewer');
const s1 = connect('s1');
const s2 = connect('s2');
await new Promise((r) => teacher.s.on('connect', r));
teacher.s.emit('instructor:join', { token, instructorSecret });
viewer.s.emit('viewer:join', { token });
s1.s.emit('student:join', { token, nickname: '참가자1', sessionId: 'e2e-s1-' + Date.now() });
s2.s.emit('student:join', { token, nickname: '참가자2', sessionId: 'e2e-s2-' + Date.now() });
ok(await waitFor(() => teacher.state && viewer.state && s1.state && s2.state), '강사·프로젝터·참가자 2명 접속');

const POLL = 'poll-warmup';
const pollOf = (b) => b.state?.activity?.poll;

// ── P1~P4: 타이머 3초 + autoReveal ──
teacher.s.emit('instructor:openActivity', { activityId: POLL, timerSec: 3, autoReveal: true });
ok(await waitFor(() => pollOf(viewer)?.endsAt && pollOf(s1)?.endsAt), 'P1 타이머 투표 열림 — 프로젝터/참가자에 endsAt 전달');
const p1 = pollOf(viewer);
// 서버는 5초 미만 타이머를 5초로 보정한다 (normalizeTimerSec) — 이후 대기는 timerSec 기준
ok(p1?.timerSec >= 3 && p1?.closed === false && p1?.revealed === false && p1?.autoReveal === true,
  'P1 초기 상태: closed=false, revealed=false(결과 숨김), autoReveal=true', JSON.stringify(p1));
const openedAt = Date.now();

s1.s.emit('student:pollVote', { activityId: POLL, value: '집중' });
s2.s.emit('student:pollVote', { activityId: POLL, value: '성장' });
ok(await waitFor(() => viewer.polls[POLL]?.total === 2), 'P2 타이머 중 투표 2건 집계', JSON.stringify(viewer.polls[POLL]?.counts));

const remain = Math.max(0, p1.endsAt - Date.now());
await sleep(remain + 800);
ok(pollOf(viewer)?.closed === true, 'P3 타이머 종료 → 강사 조작 없이 자동 마감', `경과 ${Date.now() - openedAt}ms`);
ok(pollOf(viewer)?.revealed === true && pollOf(s1)?.revealed === true, 'P3 autoReveal → 결과 자동 공개(프로젝터·참가자)');
ok(pollOf(viewer)?.endsAt === undefined, 'P3 마감 후 endsAt 제거(게이지 종료)');

const before = viewer.polls[POLL].total;
s1.s.emit('student:pollVote', { activityId: POLL, value: '늦은응답' });
ok(await waitFor(() => s1.errs.some((m) => m.includes('마감')), 2000), 'P4 마감 후 응답 → 참가자에게 마감 안내(errmsg)', s1.errs.at(-1));
await sleep(300);
ok(viewer.polls[POLL].total === before && !('늦은응답' in viewer.polls[POLL].counts), 'P4 마감 후 응답은 집계에 반영되지 않음');

// ── P5: autoReveal=false → 강사 수동 공개 ──
teacher.s.emit('instructor:closeActivity');
await waitFor(() => viewer.state?.activity === null);
teacher.s.emit('instructor:openActivity', { activityId: POLL, timerSec: 5, autoReveal: false });
ok(await waitFor(() => pollOf(viewer)?.endsAt && pollOf(viewer)?.closed === false), 'P5 autoReveal=false 투표 열림');
await sleep(Math.max(0, pollOf(viewer).endsAt - Date.now()) + 800);
ok(pollOf(viewer)?.closed === true && pollOf(viewer)?.revealed === false, 'P5 마감됐지만 결과는 비공개 유지');
teacher.s.emit('instructor:pollReveal');
ok(await waitFor(() => pollOf(viewer)?.revealed === true), 'P5 강사 "결과 공개" → revealed=true');

// ── P6: 타이머 없음 → 기존 동작 ──
teacher.s.emit('instructor:closeActivity');
await waitFor(() => viewer.state?.activity === null);
teacher.s.emit('instructor:openActivity', { activityId: POLL });
ok(await waitFor(() => pollOf(viewer) !== undefined), 'P6 타이머 없는 투표 열림');
const p6 = pollOf(viewer);
ok(p6?.endsAt === undefined && p6?.closed === false && p6?.revealed === true, 'P6 타이머 없음: endsAt 없음 · 처음부터 결과 공개(기존 동작 유지)', JSON.stringify(p6));

// ── P7: 강사 "지금 마감" ──
teacher.s.emit('instructor:closeActivity');
await waitFor(() => viewer.state?.activity === null);
teacher.s.emit('instructor:openActivity', { activityId: POLL, timerSec: 60, autoReveal: true });
ok(await waitFor(() => pollOf(viewer)?.endsAt), 'P7 60초 타이머 투표 열림');
teacher.s.emit('instructor:pollClose');
ok(await waitFor(() => pollOf(viewer)?.closed === true && pollOf(viewer)?.revealed === true), 'P7 강사 "지금 마감" → 즉시 마감 + 자동 공개');

// ── Q1: 퀴즈 autoReveal ──
teacher.s.emit('instructor:closeActivity');
await waitFor(() => viewer.state?.activity === null);
const QUIZ = 'quiz-warmup'; // 문항 15초
teacher.s.emit('instructor:openActivity', { activityId: QUIZ, autoReveal: true });
ok(await waitFor(() => viewer.state?.activity?.quiz?.autoReveal === true), 'Q1 퀴즈 autoReveal 옵션으로 열림');
teacher.s.emit('instructor:quizStart');
ok(await waitFor(() => viewer.questions.length === 1), 'Q1 문제 시작');
const q = viewer.questions[0];
s1.s.emit('student:quizAnswer', { questionId: q.questionId, optionIndex: 0 });
const qWait = Math.max(0, q.endsAt - Date.now()) + 1500 + 1000;
console.log(`   … 제한시간 종료 대기 ${Math.round(qWait / 1000)}초`);
await sleep(qWait);
ok(viewer.reveals.length === 1 && viewer.reveals[0].questionId === q.questionId, 'Q1 제한시간 종료 → 강사 조작 없이 quiz:reveal 수신');
ok(viewer.state?.activity?.quiz?.phase === 'revealed', 'Q1 state.quiz.phase = revealed');
ok(viewer.reveals[0] && viewer.reveals[0].at - q.endsAt >= 1400, 'Q1 자동 공개는 응답 유예(+1.5s) 이후', `${viewer.reveals[0]?.at - q.endsAt}ms`);

// ── Q2: 활동 닫기 → 예약 타이머 해제 ──
teacher.s.emit('instructor:quizNext'); // 2번째 문항 시작 (autoReveal 예약)
ok(await waitFor(() => viewer.questions.length === 2), 'Q2 다음 문항 시작');
teacher.s.emit('instructor:closeActivity');
await waitFor(() => viewer.state?.activity === null);
const revealsBefore = viewer.reveals.length;
const q2 = viewer.questions[1];
await sleep(Math.max(0, q2.endsAt - Date.now()) + 2500);
ok(viewer.reveals.length === revealsBefore && viewer.state?.activity === null, 'Q2 닫힌 활동의 타이머는 해제됨(늦은 reveal 없음)');

for (const b of [teacher, viewer, s1, s2]) b.s.close();
console.log(failures === 0 ? '\n🎉 verify-timer: 전부 통과' : `\n💥 verify-timer: ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
