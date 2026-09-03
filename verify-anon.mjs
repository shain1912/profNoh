// 익명 시스템 검증 — 세션 정책 / 활동 오버라이드 / 결과 숨김→공개
//   1) 소켓 레벨: 서버가 학생·프로젝터에게 nickname/결과를 실제로 내보내지 않는지 (브로드캐스트 필터링)
//   2) UI 레벨: 시작 화면 정책 선택 → 학생 익명 뱃지 → 프로젝터 결과 숨김 → 강사 결과 공개 → 서명 없는 롤링페이퍼
//
//   실행 (포트 8792/5178):
//     PORT=8792 CLIENT_ORIGIN=http://localhost:5178 DEV_LOGIN=1 AUTH_JWT_SECRET=dev npm -w server run dev
//     API_PORT=8792 VITE_DEV_PORT=5178 npm -w client run dev
//     node verify-anon.mjs http://localhost:5178 http://localhost:8792
import { io } from 'socket.io-client';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5178'; // UI (Vite dev 또는 빌드 서빙)
const API = process.argv[3] || 'http://localhost:8792';  // API + Socket.IO
const DIR = 'shots';
mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name} ${detail}`); }
}

// ───────────────────────── 소켓 유틸 ─────────────────────────
function connect() {
  return io(API, { transports: ['websocket'], forceNew: true });
}
/** 조건을 만족하는 이벤트 1건을 기다림 */
function waitFor(sock, event, pred = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { sock.off(event, h); reject(new Error(`timeout: ${event}`)); }, timeoutMs);
    const h = (...args) => { if (pred(...args)) { clearTimeout(t); sock.off(event, h); resolve(args[0]); } };
    sock.on(event, h);
  });
}
async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

// ═══════════════════════ PART 1: 소켓 레벨 ═══════════════════════
async function socketLevel() {
  console.log('\n[1] 소켓 레벨 — 서버 브로드캐스트 필터링');
  const creds = await post('/api/classrooms', { settings: { anonymity: 'named_default', resultsReveal: 'after_close' } });
  check('강의실 생성', !!creds.token, JSON.stringify(creds));
  const info = await (await fetch(`${API}/api/classrooms/${creds.token}`)).json();
  check('강의실 정보에 익명 정책 노출', info.anonymity === 'named_default' && info.resultsReveal === 'after_close', JSON.stringify(info));

  const inst = connect(), s1 = connect(), s2 = connect(), s3 = connect(), viewer = connect();
  const all = [inst, s1, s2, s3, viewer];
  try {
    const instState = waitFor(inst, 'state');
    inst.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret });
    const st = await instState;
    check('스냅샷에 anonymity/resultsReveal 포함', st.anonymity === 'named_default' && st.resultsReveal === 'after_close');

    const j1 = waitFor(s1, 'joined'); s1.emit('student:join', { token: creds.token, nickname: '가나' }); await j1;
    const j2 = waitFor(s2, 'joined'); s2.emit('student:join', { token: creds.token, nickname: '다라' }); await j2;
    const v = waitFor(viewer, 'state'); viewer.emit('viewer:join', { token: creds.token }); await v;

    // ── (A) named_default + after_close: 결과 숨김 → 강사만 분포, 공개 후 마감 ──
    let opened = waitFor(viewer, 'activity:opened');
    inst.emit('instructor:openActivity', { activityId: 'poll-warmup' });
    let act = await opened;
    check('named_default: 활동 anonymous=false', act.anonymous === false);
    check('after_close: 열자마자 revealResults=false', act.revealResults === false);

    const vHidden = waitFor(viewer, 'poll:update', (p) => p.distribution.total === 2);
    const sHidden = waitFor(s1, 'poll:update', (p) => p.distribution.total === 2);
    const iFull = waitFor(inst, 'poll:update', (p) => p.distribution.total === 2);
    s1.emit('student:pollVote', { activityId: 'poll-warmup', value: '로봇' });
    s2.emit('student:pollVote', { activityId: 'poll-warmup', value: '챗봇' });
    const [vh, sh, ifull] = await Promise.all([vHidden, sHidden, iFull]);
    check('프로젝터: hidden=true, counts 비어 있음, total 만', vh.distribution.hidden === true && Object.keys(vh.distribution.counts).length === 0 && vh.distribution.entries.length === 0, JSON.stringify(vh.distribution));
    check('학생: hidden=true (밴드왜건 방지)', sh.distribution.hidden === true && Object.keys(sh.distribution.counts).length === 0);
    check('강사: 전체 분포 + 닉네임 entries', !ifull.distribution.hidden && ifull.distribution.counts['로봇'] === 1 && ifull.distribution.entries.map((e) => e.nickname).sort().join() === '가나,다라', JSON.stringify(ifull.distribution));

    const updated = waitFor(viewer, 'activity:updated');
    const vFull = waitFor(viewer, 'poll:update', (p) => !p.distribution.hidden);
    inst.emit('instructor:revealResults');
    const up = await updated;
    check('결과 공개: revealResults=true, closed=true', up.revealResults === true && up.closed === true, JSON.stringify(up));
    const vf = await vFull;
    check('공개 후 프로젝터에 분포 + 닉네임(실명 활동)', vf.distribution.counts['챗봇'] === 1 && vf.distribution.entries.every((e) => typeof e.nickname === 'string'), JSON.stringify(vf.distribution));

    const j3 = waitFor(s3, 'joined'); s3.emit('student:join', { token: creds.token, nickname: '마바' }); await j3;
    const err = waitFor(s3, 'errmsg');
    s3.emit('student:pollVote', { activityId: 'poll-warmup', value: '늦음' });
    const e = await err;
    check('마감 후 응답 거부 (errmsg)', /마감/.test(e.message), e.message);
    inst.emit('instructor:closeActivity');
    await waitFor(viewer, 'activity:closed');

    // ── (B) always_anon: 리더보드 가명 + 롤링페이퍼 entries 에 nickname 없음 ──
    const stAnon = waitFor(viewer, 'state', (s) => s.anonymity === 'always_anon');
    const lb = waitFor(viewer, 'leaderboard');
    inst.emit('instructor:updateSettings', { anonymity: 'always_anon' });
    await stAnon;
    const lbv = await lb;
    check('always_anon: 리더보드 전부 가명 "익명 N"', lbv.length === 3 && lbv.every((x) => /^익명 \d+$/.test(x.nickname)), JSON.stringify(lbv));

    opened = waitFor(viewer, 'activity:opened');
    inst.emit('instructor:openActivity', { activityId: 'poll-feedback' });
    act = await opened;
    check('always_anon: 활동 anonymous=true', act.anonymous === true);
    const iAnon = waitFor(inst, 'poll:update', (p) => p.distribution.total === 2);
    s1.emit('student:pollVote', { activityId: 'poll-feedback', value: '최고' });
    s2.emit('student:pollVote', { activityId: 'poll-feedback', value: '유익' });
    const ia = await iAnon;
    check('익명 활동: 강사에게도 entries 에 nickname 없음', ia.distribution.entries.length === 2 && ia.distribution.entries.every((x) => !('nickname' in x)), JSON.stringify(ia.distribution));
    const vAnon = waitFor(viewer, 'poll:update', (p) => !p.distribution.hidden);
    inst.emit('instructor:revealResults');
    const va = await vAnon;
    check('익명 활동 공개 후 프로젝터: 값은 있고 nickname 키 자체가 없음', va.distribution.entries.length === 2 && va.distribution.entries.every((x) => !('nickname' in x) && x.value), JSON.stringify(va.distribution));
    check('익명 활동 브로드캐스트 원문에 닉네임 문자열 부재', !JSON.stringify(va).includes('가나') && !JSON.stringify(va).includes('다라'));
    inst.emit('instructor:closeActivity');
    await waitFor(viewer, 'activity:closed');

    // ── (C) live 정책: 열자마자 공개 ──
    const stLive = waitFor(viewer, 'state', (s) => s.resultsReveal === 'live' && s.anonymity === 'named_default');
    inst.emit('instructor:updateSettings', { anonymity: 'named_default', resultsReveal: 'live' });
    await stLive;
    opened = waitFor(viewer, 'activity:opened');
    inst.emit('instructor:openActivity', { activityId: 'poll-warmup' });
    act = await opened;
    check('live: 열자마자 revealResults=true', act.revealResults === true && act.closed === false);
    const vLive = waitFor(viewer, 'poll:update', (p) => p.distribution.total >= 3);
    s3.emit('student:pollVote', { activityId: 'poll-warmup', value: '드론' });
    const vl = await vLive;
    check('live: 프로젝터에 실시간 분포', !vl.distribution.hidden && vl.distribution.counts['드론'] === 1, JSON.stringify(vl.distribution));

    // ── (D) 늦게 들어온 뷰어 동기화: 숨김 상태면 hidden 으로 ──
    inst.emit('instructor:updateSettings', { resultsReveal: 'after_close' });
    inst.emit('instructor:closeActivity');
    await waitFor(viewer, 'activity:closed');
    opened = waitFor(viewer, 'activity:opened');
    inst.emit('instructor:openActivity', { activityId: 'poll-feedback' });
    await opened;
    const late = connect();
    const lateUpdate = waitFor(late, 'poll:update');
    late.emit('viewer:join', { token: creds.token });
    const lu = await lateUpdate;
    check('늦게 입장한 뷰어: 미공개 투표는 hidden', lu.distribution.hidden === true, JSON.stringify(lu.distribution));
    late.close();
    inst.emit('instructor:closeActivity');
  } finally {
    all.forEach((s) => s.close());
  }
  return creds;
}

// ═══════════════════════ PART 2: UI 레벨 ═══════════════════════
async function uiLevel() {
  console.log('\n[2] UI 레벨 — 강사 시작 화면 → 학생 뱃지 → 프로젝터 숨김/공개 → 롤링페이퍼 서명');
  const errors = [];
  const watch = (p, who) => {
    p.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
  };
  const browser = await chromium.launch();
  try {
    const tp = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
    watch(tp, 'teacher');
    await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
    const dl = await tp.evaluate(async () => {
      const r = await fetch('/api/auth/dev-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'verify-anon@test.local', name: '익명검증' }),
      });
      return r.status;
    });
    check('dev-login (DEV_LOGIN=1 필요)', dl === 200, `status=${dl}`);
    await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
    check('시작 화면에 익명 정책 선택 UI', await tp.getByTestId('anon-settings').isVisible());
    await tp.getByTestId('anon-anon_default').click();
    await tp.getByTestId('reveal-after_close').click();
    await tp.screenshot({ path: `${DIR}/anon-01-create.png` });
    await tp.getByText('시작 ▶').first().click();
    await tp.getByTestId('anon-policy-chip').waitFor({ timeout: 10000 });
    const token = (await tp.locator('#root').innerText()).match(/강의실 코드\s*\n?\s*([A-Z0-9]{4,8})/)[1];
    console.log('  TOKEN', token);
    check('콘솔 헤더에 정책 칩 "익명 기본"', /익명 기본/.test(await tp.getByTestId('anon-policy-chip').innerText()));

    // 학생 2명 + 프로젝터
    async function join(name) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
      watch(p, name);
      await p.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
      await p.locator('input').nth(1).fill(name);
      await p.getByText('입장하기').click();
      await p.waitForURL('**/play**', { timeout: 8000 }).catch(() => {});
      await sleep(600);
      return p;
    }
    const [s1, s2] = await Promise.all([join('가나'), join('다라')]);
    const proj = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    watch(proj, 'projector');
    await proj.goto(`${BASE}/screen/${token}`, { waitUntil: 'networkidle' });

    // poll-warmup 슬라이드로 이동 (← → 단축키) 후 원버튼으로 활동 열기
    const deck = await (await fetch(`${API}/api/decks/ai-ax-4h`)).json();
    const idx = deck.slides.findIndex((s) => s.activityId === 'poll-warmup');
    check('샘플 덱에 poll-warmup 슬라이드 존재', idx >= 0, String(idx));
    await tp.locator('body').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < idx; i++) { await tp.keyboard.press('ArrowRight'); await sleep(120); }
    await sleep(400);
    const btn = tp.getByTestId('next-step');
    check('원버튼이 투표 시작을 제안', /시작하기/.test(await btn.innerText()), await btn.innerText());
    await btn.click();
    await sleep(1200);

    // 학생: 익명 뱃지
    check('학생 활동 화면 "익명으로 제출됩니다" 뱃지', await s1.getByTestId('anon-badge').isVisible());
    check('학생 헤더 "익명 활동" 뱃지', /익명 활동/.test(await s1.getByTestId('student-anon-badge').innerText().catch(() => '')));
    await s1.screenshot({ path: `${DIR}/anon-02-student-badge.png` });
    // 강사: 미공개 표시 + 결과 공개 버튼
    check('강사 콘솔 "결과 숨김" 상태 표시', await tp.getByTestId('poll-unrevealed').isVisible());
    check('원버튼이 "결과 공개"로 바뀜', /결과 공개/.test(await btn.innerText()), await btn.innerText());

    // 학생 응답
    await s1.locator('input').fill('로봇'); await s1.getByRole('button', { name: '제출' }).click();
    await s2.locator('input').fill('챗봇'); await s2.getByRole('button', { name: '제출' }).click();
    await sleep(800);
    check('학생: 응답 후 "결과는 강사님이 공개하면" 대기 문구', await s1.getByTestId('poll-waiting').isVisible());
    check('프로젝터: 결과 숨김 카드', await proj.getByTestId('poll-hidden').isVisible());
    check('프로젝터: 익명 뱃지', await proj.getByTestId('anon-badge').isVisible());
    check('프로젝터: 숨김 상태에서 롤링페이퍼 노트 없음', (await proj.locator('text=로봇').count()) === 0);
    await proj.screenshot({ path: `${DIR}/anon-03-projector-hidden.png` });
    await tp.screenshot({ path: `${DIR}/anon-04-teacher-unrevealed.png` });

    // 강사 결과 공개
    await tp.getByTestId('reveal-results').click();
    await sleep(1000);
    check('강사: 공개됨 · 응답 마감 표시', /공개됨/.test(await tp.getByTestId('poll-revealed').innerText().catch(() => '')));
    check('프로젝터: 숨김 카드 사라짐', (await proj.getByTestId('poll-hidden').count()) === 0);
    check('프로젝터: 롤링페이퍼에 응답 표시', (await proj.locator('text=로봇').count()) >= 1);
    check('프로젝터: 익명 활동이라 서명(– 닉네임) 0개', (await proj.getByTestId('paper-signature').count()) === 0);
    // 리더보드 서랍(화면 밖, DOM 상 존재)은 anon_default 세션에서 실명이 정상 — 서랍을 제외한 본문에서만 닉네임 부재 확인
    const drawerText = await proj.locator('div.fixed.right-0').first().innerText().catch(() => '');
    const bodyText = (await proj.locator('#root').innerText()).replace(drawerText, '');
    check('프로젝터 본문(서랍 제외)에 닉네임 문자열 없음', !bodyText.includes('가나') && !bodyText.includes('다라'));
    await proj.screenshot({ path: `${DIR}/anon-05-projector-revealed-anon.png` });
    await s1.screenshot({ path: `${DIR}/anon-06-student-revealed.png` });

    // 수업 중 정책 변경: 항상 닉네임 → 뱃지 사라지고 서명 등장
    await tp.getByTestId('anon-policy-chip').click();
    await tp.getByTestId('anon-always_named').click();
    await sleep(900);
    check('정책 변경 후 학생 뱃지 → "닉네임과 함께"', await s1.getByTestId('named-badge').isVisible());
    check('정책 변경 후 프로젝터 서명 등장', (await proj.getByTestId('paper-signature').count()) === 2, String(await proj.getByTestId('paper-signature').count()));
    await proj.screenshot({ path: `${DIR}/anon-07-projector-named.png` });
    await tp.keyboard.press('Escape');

    // 리포트 (DB 활성 시에만 실질 검증)
    const creds = await tp.evaluate(() => null);
    void creds;
    check('브라우저 pageerror 없음', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
}

// ═══════════════════════ PART 3: 리포트 API (DB 있을 때) ═══════════════════════
async function reportLevel(creds) {
  console.log('\n[3] 리포트 API — 익명 집계 플래그');
  const r = await fetch(`${API}/api/classrooms/${creds.classroomId}/report?secret=${creds.instructorSecret}`);
  if (r.status === 503) { console.log('  ⏭  DB 비활성(503) — 리포트 집계는 server/test/anonymity.test.mjs 단위 테스트로 검증'); return; }
  const data = await r.json();
  check('리포트 200', r.status === 200, String(r.status));
  check('리포트에 anonymity 메타', !!data.anonymity && typeof data.anonymity.policy === 'string', JSON.stringify(data.anonymity));
  const polls = Object.values(data.pollSummary ?? {});
  check('pollSummary 각 항목에 anonymous 플래그', polls.length > 0 && polls.every((p) => typeof p.anonymous === 'boolean'));
}

try {
  const creds = await socketLevel();
  await uiLevel();
  await reportLevel(creds);
} catch (e) {
  fail++; failures.push(`예외: ${e.message}`);
  console.error('  ❌ 예외', e);
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패${failures.length ? '\n  실패 항목: ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
