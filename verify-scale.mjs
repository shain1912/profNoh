// Phase 2 코어 검증 — 브로드캐스트 재설계(역할별 room · 배치) + rate limit (소켓 토큰 버킷 · HTTP)
//   근거: docs/research/2026-09-03-current-capabilities.md §2.2·2.4·2.6, feature-roadmap Phase 2 #1·#2
//
//   A) 역할별 room: 참가자는 집계(counts/total)·자기 ACK 만, 상세(entries·리더보드 전체·quiz:answered)는 스태프(강사·프로젝터)만
//   B) 배치: N명이 동시에 투표해도 poll:update 프레임은 창(300~500ms)당 1회로 수렴 — O(n²) 제거
//   C) 소켓 토큰 버킷: 한 소켓이 초당 수십 번 pollVote 를 쏘면 burst 이후는 버려진다 (방 전체 DoS 차단)
//   D) 페이로드 상한: 64KB 넘는 소켓 프레임은 연결이 끊긴다
//   E) HTTP rate limit: 강의실 생성 버스트 → 429, /api/health 는 제외
//
//   사용: node verify-scale.mjs [http://localhost:8791]   (HTTP 429 검사가 마지막이라 다른 검증 스크립트 뒤에 돌릴 것)
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:8791';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
/** 이벤트 기록 소켓 — 받은 모든 이벤트를 종류별로 쌓는다 */
function connect() {
  return new Promise((resolve) => {
    const s = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
    const box = { s, got: {}, state: null };
    s.onAny((ev, payload) => { (box.got[ev] ??= []).push(payload); if (ev === 'state') box.state = payload; });
    s.on('connect', () => resolve(box));
  });
}
const last = (box, ev) => box.got[ev]?.at(-1);
const count = (box, ev) => box.got[ev]?.length ?? 0;
const waitFor = async (fn, ms = 5000, step = 50) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); }
  return !!fn();
};

// ── 준비: 실시간 공개(live) 세션 — 참가자도 집계를 받는 경로를 검사하기 위해 ──
const { data: creds } = await post('/api/classrooms', { title: 'Phase2 검증', settings: { resultsReveal: 'live' } });
check('강의실 생성', !!creds.token, JSON.stringify(creds));
const inst = await connect(), view = await connect(), s1 = await connect(), s2 = await connect();
inst.s.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret });
view.s.emit('viewer:join', { token: creds.token });
s1.s.emit('student:join', { token: creds.token, nickname: '참가자1', sessionId: 'sc-s1-' + Date.now() });
s2.s.emit('student:join', { token: creds.token, nickname: '참가자2', sessionId: 'sc-s2-' + Date.now() });
check('강사·프로젝터·참가자2 입장', await waitFor(() => inst.state && view.state && count(s1, 'joined') && count(s2, 'joined')));

// ═══ A) 역할별 room ═══
console.log('\n[A] 역할별 room 분리');
{
  const POLL = 'poll-warmup'; // wordcloud
  inst.s.emit('instructor:openActivity', { activityId: POLL });
  await waitFor(() => last(s1, 'activity:opened')?.activityId === POLL);
  s1.s.emit('student:pollVote', { activityId: POLL, value: '로봇' });
  s2.s.emit('student:pollVote', { activityId: POLL, value: '챗봇' });
  const done = await waitFor(() => last(inst, 'poll:update')?.distribution.total === 2 && last(view, 'poll:update')?.distribution.total === 2 && last(s1, 'poll:update')?.distribution.total === 2);
  check('투표 2건 → 강사·프로젝터·참가자 모두 total 2 수신', done);
  const di = last(inst, 'poll:update').distribution, dv = last(view, 'poll:update').distribution, ds = last(s1, 'poll:update').distribution;
  check('강사: entries(닉네임+값) 전체', Array.isArray(di.entries) && di.entries.length === 2 && di.entries.every((e) => e.nickname && e.value), JSON.stringify(di));
  check('프로젝터(스태프룸): entries 전체', Array.isArray(dv.entries) && dv.entries.length === 2, JSON.stringify(dv));
  check('참가자: counts/total 집계만, entries 없음', ds.counts['로봇'] === 1 && ds.counts['챗봇'] === 1 && ds.total === 2 && !('entries' in ds), JSON.stringify(ds));
  check('참가자 수신 원문에 다른 참가자 닉네임 없음', !JSON.stringify(s1.got['poll:update']).includes('참가자2'));
  // 늦게 들어온 참가자도 같은 필터
  const late = await connect();
  late.s.emit('student:join', { token: creds.token, nickname: '늦참', sessionId: 'sc-late-' + Date.now() });
  await waitFor(() => count(late, 'poll:update') > 0);
  const dl = last(late, 'poll:update').distribution;
  check('늦은 참가자 동기화도 집계만(entries 없음)', dl.total === 2 && !('entries' in dl), JSON.stringify(dl));
  // 접속 인원은 참가자에게도(강당 대기 화면) — 배치로 도착
  check('참가자에게 participants(접속 수) 배치 도착', await waitFor(() => last(s1, 'participants')?.count === 3, 3000), JSON.stringify(last(s1, 'participants')));
  late.s.close();
  inst.s.emit('instructor:closeActivity');
  await waitFor(() => view.state?.activity === null);

  // 퀴즈: quiz:answered 는 스태프만, quiz:reveal 은 참가자에게 리더보드 없이 me 만
  const QUIZ = 'quiz-warmup';
  inst.s.emit('instructor:openActivity', { activityId: QUIZ });
  await waitFor(() => last(s1, 'activity:opened')?.activityId === QUIZ);
  inst.s.emit('instructor:quizStart');
  await waitFor(() => count(s1, 'quiz:question') > 0 && count(s2, 'quiz:question') > 0);
  const q = last(s1, 'quiz:question');
  const answeredBeforeS1 = count(s1, 'quiz:answered');
  s1.s.emit('student:quizAnswer', { questionId: q.questionId, optionIndex: 0 });
  s2.s.emit('student:quizAnswer', { questionId: q.questionId, optionIndex: 1 });
  check('quiz:answered → 강사·프로젝터에 count 2 (배치)', await waitFor(() => last(inst, 'quiz:answered')?.count === 2 && last(view, 'quiz:answered')?.count === 2, 3000));
  await sleep(700);
  check('quiz:answered → 참가자에게는 오지 않음', count(s1, 'quiz:answered') === answeredBeforeS1);
  check('참가자 자기 ACK(joined) 로 점수 갱신', (last(s1, 'joined')?.score ?? 0) >= 0 && count(s1, 'joined') >= 2, JSON.stringify(last(s1, 'joined')));
  inst.s.emit('instructor:quizReveal');
  await waitFor(() => count(view, 'quiz:reveal') > 0 && count(s1, 'quiz:reveal') > 0 && count(s2, 'quiz:reveal') > 0);
  const rv = last(view, 'quiz:reveal'), r1 = last(s1, 'quiz:reveal'), r2 = last(s2, 'quiz:reveal');
  check('프로젝터 quiz:reveal: 리더보드 전체(3명)', rv.leaderboard.length === 3, JSON.stringify(rv.leaderboard));
  check('참가자 quiz:reveal: 리더보드 빈 배열 + me(점수·순위)', r1.leaderboard.length === 0 && r1.me && r1.me.rank >= 1 && r2.me && r2.me.rank >= 1, JSON.stringify({ r1: r1.me, r2: r2.me }));
  check('참가자별 me 가 서로 다름(자기 것)', r1.me.rank !== r2.me.rank || r1.me.score !== r2.me.score, JSON.stringify({ r1: r1.me, r2: r2.me }));
  check('참가자 수신 원문에 다른 참가자 닉네임 없음(리더보드 미전송)', !JSON.stringify(s1.got['quiz:reveal']).includes('참가자2') && count(s1, 'leaderboard') === 0);
  check('스태프에게는 leaderboard 이벤트 별도 수신', count(view, 'leaderboard') >= 2 && count(inst, 'leaderboard') >= 2);
  inst.s.emit('instructor:closeActivity');
  await waitFor(() => view.state?.activity === null);
}

// ═══ B) 배치 전송 ═══
console.log('\n[B] 집계 배치 — N명 동시 투표 시 프레임 수');
const N = 60;
{
  const POLL = 'poll-feedback';
  inst.s.emit('instructor:openActivity', { activityId: POLL });
  await waitFor(() => last(view, 'activity:opened')?.activityId === POLL);
  const crowd = [];
  for (let i = 0; i < N; i++) crowd.push(await connect());
  crowd.forEach((b, i) => b.s.emit('student:join', { token: creds.token, nickname: `군중${i}`, sessionId: `sc-crowd-${i}-${Date.now()}` }));
  check(`${N}명 입장`, await waitFor(() => crowd.every((b) => count(b, 'joined') > 0), 15000));
  await sleep(700); // 입장 배치 소진
  const viewFrames0 = count(view, 'poll:update'), s1Frames0 = count(s1, 'poll:update'), instFrames0 = count(inst, 'poll:update');
  const t0 = Date.now();
  crowd.forEach((b, i) => b.s.emit('student:pollVote', { activityId: POLL, value: `단어${i % 7}` }));
  check(`${N}표 → 프로젝터 total ${N} 도달`, await waitFor(() => last(view, 'poll:update')?.distribution.total === N, 5000), `${Date.now() - t0}ms`);
  await sleep(800);
  const viewFrames = count(view, 'poll:update') - viewFrames0, s1Frames = count(s1, 'poll:update') - s1Frames0, instFrames = count(inst, 'poll:update') - instFrames0;
  console.log(`   poll:update 프레임 — 프로젝터 ${viewFrames}, 강사 ${instFrames}, 참가자 ${s1Frames} (표 ${N}건)`);
  check(`프로젝터 프레임 수 ≤ 6 (표당 1회면 ${N})`, viewFrames >= 1 && viewFrames <= 6, String(viewFrames));
  check('참가자 프레임 수 ≤ 4', s1Frames >= 1 && s1Frames <= 4, String(s1Frames));
  check(`참가자 최종 집계 total ${N}, entries 없음`, last(s1, 'poll:update')?.distribution.total === N && !('entries' in last(s1, 'poll:update').distribution));
  // 참가자 1명이 받은 바이트: entries 가 없으니 표 수에 비례하지 않는다
  const bytesS1 = s1.got['poll:update'].slice(s1Frames0).reduce((a, p) => a + JSON.stringify(p).length, 0);
  const bytesView = view.got['poll:update'].slice(viewFrames0).reduce((a, p) => a + JSON.stringify(p).length, 0);
  console.log(`   수신 바이트 — 프로젝터 ${bytesView}B, 참가자 ${bytesS1}B`);
  check('참가자 수신량이 프로젝터(entries 포함)보다 작음', bytesS1 < bytesView);
  // 마감(전이)은 즉시 — 배치를 기다리지 않는다
  const t1 = Date.now();
  inst.s.emit('instructor:closeActivity');
  await waitFor(() => view.state?.activity === null);
  check('활동 닫기 전이는 즉시 반영', Date.now() - t1 < 300, `${Date.now() - t1}ms`);
  crowd.forEach((b) => b.s.close());
}

// ═══ C) 소켓 토큰 버킷 ═══
console.log('\n[C] 소켓 이벤트 토큰 버킷');
{
  const POLL = 'poll-warmup';
  inst.s.emit('instructor:openActivity', { activityId: POLL });
  await waitFor(() => last(s1, 'activity:opened')?.activityId === POLL);
  const errBefore = count(s1, 'errmsg');
  for (let i = 0; i < 30; i++) s1.s.emit('student:pollVote', { activityId: POLL, value: `v${i}` });
  await sleep(900);
  const d = last(inst, 'poll:update')?.distribution;
  const mine = d?.entries?.find((e) => e.nickname === '참가자1')?.value;
  check('버스트 30회 중 burst(4) 이후는 버려짐 — 최종값이 v0~v4 중 하나', /^v[0-4]$/.test(mine ?? ''), `mine=${mine}`);
  check('한도 초과 안내 errmsg 는 1회만', count(s1, 'errmsg') - errBefore === 1, String(count(s1, 'errmsg') - errBefore));
  // 충전 후에는 다시 허용
  await sleep(1200);
  s1.s.emit('student:pollVote', { activityId: POLL, value: '회복' });
  check('1초 충전 후 다시 허용', await waitFor(() => last(inst, 'poll:update')?.distribution.entries?.some((e) => e.nickname === '참가자1' && e.value === '회복'), 2000));
  // 질문 스팸: 5초에 1개(연속 2개) — 10개 쏘면 2개만
  const qBefore = count(inst, 'question:new');
  for (let i = 0; i < 10; i++) s1.s.emit('student:askQuestion', { text: `스팸 질문 ${i}` });
  await sleep(600);
  check('askQuestion 10연발 → 강사에 2개만 도착', count(inst, 'question:new') - qBefore === 2, String(count(inst, 'question:new') - qBefore));
  inst.s.emit('instructor:closeActivity');
  await waitFor(() => view.state?.activity === null);
}

// ═══ D) 페이로드 상한 ═══
console.log('\n[D] 소켓 페이로드 상한(64KB)');
{
  let disconnected = false;
  s2.s.on('disconnect', () => { disconnected = true; });
  s2.s.emit('student:askQuestion', { text: 'x'.repeat(100 * 1024) });
  check('100KB 프레임 → 서버가 연결 종료', await waitFor(() => disconnected, 3000));
}

// ═══ E) HTTP rate limit ═══
console.log('\n[E] HTTP rate limit');
{
  const health = await Promise.all(Array.from({ length: 40 }, () => fetch(`${BASE}/api/health`).then((r) => r.status)));
  check('/api/health 40연발 전부 200 (제외 경로)', health.every((s) => s === 200));
  const statuses = [];
  for (let i = 0; i < 26; i++) statuses.push(await post('/api/classrooms', { title: `burst ${i}` }));
  const limited = statuses.filter((r) => r.status === 429);
  check('강의실 생성 26연발 → 429 발생 (20/분)', limited.length >= 5 && statuses.slice(0, 15).every((r) => r.status === 200), `429=${limited.length}`);
  check('429 응답 본문에 한국어 안내', limited[0]?.data?.error === 'rate_limited' && /다시 시도/.test(limited[0]?.data?.message ?? ''), JSON.stringify(limited[0]?.data));
}

for (const b of [inst, view, s1, s2]) b.s.close();
const fail = results.filter((r) => !r.ok);
console.log(`\n===== verify-scale: ${results.length - fail.length}/${results.length} 통과 =====`);
if (fail.length) { console.log('실패:', fail.map((f) => f.name).join(' | ')); process.exit(1); }
process.exit(0);
