// Phase 2 영속화 검증 — 상태 스냅샷·부팅 복원 + 강사 재접속 + 참가자 점수 복원(DB 폴백)
//   근거: docs/research/2026-09-03-current-capabilities.md 리스크 2, feature-roadmap Phase 2 #3
//
//   이 스크립트는 서버를 직접 띄우고 죽였다 다시 띄운다 (재시작 시나리오). 개발 서버(8792)와 별개 포트를 쓴다.
//   전제: 루트 .env 에 dev DB(SUPABASE_URL=/dev) + DEV_LOGIN=1 + AUTH_JWT_SECRET, DDL deploy/migrations/2026-09-03-classroom-snapshots.sql 적용.
//
//   A) 생성 → 진행(슬라이드·투표·점수) → 스냅샷 → 서버 강제 종료 → 재기동: 토큰·슬라이드·열린 활동·투표·점수 유지
//   B) 강사 재접속: 로그인 계정 귀속 → GET /api/classrooms/mine 에 재시작 뒤에도 나온다, 예전 instructorSecret 으로 콘솔 입장
//   C) 참가자 DB 폴백: 스냅샷에 없는(저장 전 재시작) 세션도 axedu_participants 행으로 점수·participantId 복원
//   D) 종료: POST /api/classrooms/:id/end → 목록 제외, 입장 차단, 재기동 시 복원 안 됨
//
//   사용: node verify-persist.mjs [PORT=8796]
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = Number(process.argv[2] || 8796);
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ── 서버 수명 관리 ──
let child = null;
async function portBusy() {
  try { await fetch(`${BASE}/api/health`); return true; } catch { return false; }
}
async function startServer(extraEnv = {}) {
  // 잔존 서버가 같은 포트를 잡고 있으면 "재시작" 이 가짜가 된다 — 반드시 빈 포트에서만
  if (await portBusy()) throw new Error(`포트 ${PORT} 를 다른 서버가 이미 점유 중 — 빈 포트를 인자로 주세요`);
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/src/index.ts'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CLIENT_ORIGIN: `http://localhost:${PORT}`,
      APP_ORIGIN: `http://localhost:${PORT}`,
      RATE_LIMIT_DISABLED: '1',
      SNAPSHOT_DEBOUNCE_MS: '1000',
      SNAPSHOT_MAX_WAIT_MS: '2000',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const t0 = Date.now();
  while (Date.now() - t0 < 40_000) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) { await sleep(300); return log; } // pino 비동기 flush 뒤 로그 반환
    } catch { /* 아직 */ }
    await sleep(200);
  }
  console.error(log.slice(-3000));
  throw new Error('서버 기동 실패');
}
function stopServer() {
  return new Promise((resolve) => {
    if (!child) return resolve();
    const c = child;
    child = null;
    c.once('exit', () => resolve());
    c.kill('SIGKILL'); // 크래시/OOM 과 같은 급사 — 종료 훅(flush) 없이 죽는다
    setTimeout(resolve, 3000);
  });
}
async function waitPortFree() {
  const t0 = Date.now();
  while (Date.now() - t0 < 10_000) {
    try { await fetch(`${BASE}/api/health`); } catch { return; }
    await sleep(200);
  }
}

// ── HTTP/소켓 도우미 ──
let cookie = '';
async function http(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})), headers: r.headers };
}
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

const S1 = 'persist-s1-' + Date.now();
const S3 = 'persist-s3-' + Date.now();
let creds = null;
let pollId = null;
let s3ParticipantId = null;

try {
  // ════════ 1기: 생성·진행·스냅샷 ════════
  await startServer();
  console.log(`\n[1기] 서버 기동 :${PORT}`);

  const login = await http('POST', '/api/auth/dev-login', { email: 'persist-verify@test.dev', name: '영속화 강사' });
  check('dev-login', login.status === 200, `status=${login.status}`);
  const setCookie = login.headers.get('set-cookie') ?? '';
  cookie = setCookie.split(';')[0];
  check('세션 쿠키 발급', cookie.startsWith('axedu_sess='));

  const created = await http('POST', '/api/classrooms', { title: '영속화 검증', settings: { resultsReveal: 'live' } });
  creds = created.data;
  check('강의실 생성 (로그인 상태)', created.status === 200 && !!creds.token, creds.token);

  const mine1 = await http('GET', '/api/classrooms/mine');
  check('[B] /mine 에 방금 만든 강의실 (owner 귀속)', mine1.status === 200 && mine1.data.classrooms?.some((c) => c.token === creds.token && c.instructorSecret === creds.instructorSecret));
  cookie = '';
  const mineAnon = await http('GET', '/api/classrooms/mine');
  check('[B] /mine 은 로그인 없이는 401', mineAnon.status === 401);
  cookie = setCookie.split(';')[0];

  const deck = await http('GET', `/api/decks/${creds.deckId}`);
  pollId = Object.values(deck.data.activities ?? {}).find((a) => a.type === 'poll')?.id;
  check('덱에 투표 활동 존재', !!pollId, pollId);

  const inst = await connect(), s1 = await connect();
  inst.s.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret });
  s1.s.emit('student:join', { token: creds.token, nickname: '참가자1', sessionId: S1 });
  check('강사·참가자 입장', await waitFor(() => inst.state && count(s1, 'joined')));

  inst.s.emit('instructor:goto', { slide: 3 });
  inst.s.emit('instructor:openActivity', { activityId: pollId });
  check('슬라이드 3 · 투표 열림', await waitFor(() => inst.state?.currentSlide === 3 && inst.state?.activity?.activityId === pollId));
  s1.s.emit('student:pollVote', { activityId: pollId, value: '복원되나요' });
  s1.s.emit('student:roleplayClear', { activityId: 'rp-persist' }); // +500 점 (활동 열기 없이 점수 생김)
  check('참가자1 점수 500', await waitFor(() => last(s1, 'joined')?.score === 500), JSON.stringify(last(s1, 'joined')));
  check('투표 1표 집계', await waitFor(() => last(inst, 'poll:update')?.distribution?.total === 1));

  await sleep(3500); // debounce 1s / max-wait 2s → 스냅샷 저장 완료
  inst.s.close(); s1.s.close();
  await stopServer();
  await waitPortFree();
  console.log('[1기] 서버 강제 종료(SIGKILL)');

  // ════════ 2기: 복원 검증 + DB 폴백용 참가자 ════════
  // 스냅샷 창을 30초로 늘려 이번 기수의 변경(참가자3)이 스냅샷에 들어가지 않게 한다 → 3기에서 DB 폴백만으로 복원돼야 함
  const log2 = await startServer({ SNAPSHOT_DEBOUNCE_MS: '30000', SNAPSHOT_MAX_WAIT_MS: '30000', SNAPSHOT_INTERVAL_MS: '60000' });
  console.log('\n[2기] 서버 재기동');
  check('[A] 부팅 로그에 복원 건수', /강의실 \d+개 복원/.test(log2), (log2.match(/\[snapshot\][^\n]*/) ?? [''])[0]);

  const info = await http('GET', `/api/classrooms/${creds.token}`);
  check('[A] 토큰 유효 (exists) · status live', info.data.exists === true && info.data.status === 'live', JSON.stringify(info.data));

  const mine2 = await http('GET', '/api/classrooms/mine');
  const mineRow = mine2.data.classrooms?.find((c) => c.token === creds.token);
  check('[B] 재시작 뒤 /mine 에 그대로 (슬라이드 3)', !!mineRow && mineRow.currentSlide === 3 && mineRow.instructorSecret === creds.instructorSecret, JSON.stringify(mineRow));

  const inst2 = await connect(), s1b = await connect(), s3 = await connect();
  inst2.s.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret });
  check('[B] 예전 instructorSecret 으로 콘솔 입장', await waitFor(() => !!inst2.state), JSON.stringify(inst2.got.errmsg ?? ''));
  check('[A] 슬라이드 3 · 투표 활동 열린 채 복원', inst2.state?.currentSlide === 3 && inst2.state?.activity?.activityId === pollId);
  check('[A] 투표 1표·응답 텍스트 복원', await waitFor(() => last(inst2, 'poll:update')?.distribution?.total === 1) && JSON.stringify(last(inst2, 'poll:update')).includes('복원되나요'));
  check('[A] 리더보드에 참가자1 500점', last(inst2, 'leaderboard')?.some((e) => e.nickname === '참가자1' && e.score === 500), JSON.stringify(last(inst2, 'leaderboard')));

  s1b.s.emit('student:join', { token: creds.token, nickname: '참가자1', sessionId: S1 });
  check('[A] 참가자1 재입장 → 점수 500 유지', await waitFor(() => last(s1b, 'joined')?.score === 500), JSON.stringify(last(s1b, 'joined')));

  s3.s.emit('student:join', { token: creds.token, nickname: '참가자3', sessionId: S3 });
  check('참가자3 입장 (스냅샷 창 밖)', await waitFor(() => count(s3, 'joined')));
  s3ParticipantId = last(s3, 'joined')?.participantId;
  s3.s.emit('student:roleplayClear', { activityId: 'rp-persist' });
  check('참가자3 점수 500', await waitFor(() => last(s3, 'joined')?.score === 500));
  await sleep(1500); // persistScore(DB) 완료 대기 — 스냅샷(30초)은 아직 안 찍힘
  inst2.s.close(); s1b.s.close(); s3.s.close();
  await stopServer();
  await waitPortFree();
  console.log('[2기] 서버 강제 종료');

  // ════════ 3기: DB 폴백 + 종료 ════════
  await startServer();
  console.log('\n[3기] 서버 재기동');
  const s3b = await connect();
  s3b.s.emit('student:join', { token: creds.token, nickname: '참가자3', sessionId: S3 });
  check('참가자3 재입장', await waitFor(() => count(s3b, 'joined')));
  const j3 = last(s3b, 'joined');
  check('[C] 스냅샷에 없던 참가자3 — DB 폴백으로 점수 500 복원', j3?.score === 500, JSON.stringify(j3));
  check('[C] participantId 도 DB 행과 동일 (응답 FK 유지)', !!s3ParticipantId && j3?.participantId === s3ParticipantId, `${s3ParticipantId} vs ${j3?.participantId}`);
  s3b.s.close();

  const ended = await http('POST', `/api/classrooms/${creds.classroomId}/end`, {});
  check('[D] 종료 (owner 쿠키)', ended.status === 200 && ended.data.status === 'ended', JSON.stringify(ended.data));
  const mine3 = await http('GET', '/api/classrooms/mine');
  check('[D] 종료 후 /mine 에서 제외', !mine3.data.classrooms?.some((c) => c.token === creds.token));
  const info3 = await http('GET', `/api/classrooms/${creds.token}`);
  check('[D] 종료 후 입장 화면엔 없음(exists=false)', info3.data.exists === false);
  const s4 = await connect();
  s4.s.emit('student:join', { token: creds.token, nickname: '늦은사람', sessionId: 'persist-late' });
  check('[D] 종료 후 student:join 거부', await waitFor(() => count(s4, 'errmsg')) && !count(s4, 'joined'), JSON.stringify(last(s4, 'errmsg')));
  s4.s.close();
  await stopServer();
  await waitPortFree();

  // ════════ 4기: 종료된 강의실은 복원되지 않음 ════════
  await startServer();
  console.log('\n[4기] 서버 재기동');
  const info4 = await http('GET', `/api/classrooms/${creds.token}`);
  check('[D] 재기동 후 종료 강의실 미복원', info4.data.exists === false);
} catch (e) {
  check('예외 없이 완료', false, e?.stack ?? String(e));
} finally {
  await stopServer();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? '🎉' : '💥'} ${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length === 0 ? 0 : 1);
