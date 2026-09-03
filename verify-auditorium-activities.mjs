// 강당 활동 4종 검증 — survey · scale · ox(즉석 출제 포함) · Q&A 2.0(업보트·답변완료·모더레이션·프로젝터 토글)
// 사용법: 서버 기동(PORT=8791, dev DB) 후  node verify-auditorium-activities.mjs [http://localhost:8791]
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:8791';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = '';
async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

/** 소켓 이벤트 1회 대기 (조건 함수 통과 시 resolve, 타임아웃 시 reject) */
function waitFor(sock, ev, pred = () => true, ms = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { sock.off(ev, h); reject(new Error(`timeout: ${ev}`)); }, ms);
    const h = (p) => { if (pred(p)) { clearTimeout(t); sock.off(ev, h); resolve(p); } };
    sock.on(ev, h);
  });
}
/** 이벤트가 ms 동안 오지 않아야 통과 */
function expectNo(sock, ev, ms = 800) {
  return new Promise((resolve) => {
    let got = false;
    const h = () => { got = true; };
    sock.on(ev, h);
    setTimeout(() => { sock.off(ev, h); resolve(!got); }, ms);
  });
}
const connect = () => new Promise((resolve) => {
  const s = io(BASE, { transports: ['websocket'] });
  s.on('connect', () => resolve(s));
});

// ── 0. 로그인 + 덱 생성 (survey/scale/ox 저장 라운드트립) ──
await api('POST', '/api/auth/dev-login', { email: 'auditorium-a@test.local', name: '강당A검증' });
check('dev-login', !!cookie);

const { deckId, editPin } = await api('POST', '/api/decks', { title: '강당 활동 검증 덱' });
const mkSlide = (i, actId) => ({ id: 's' + i, part: 1, partTitle: '검증', layout: 'content', title: '슬라이드 ' + i, blocks: [], notes: '', activityId: actId });
const activities = {
  a_survey: { type: 'survey', id: 'a_survey', title: '만족도 설문', intro: '1분', questions: [] }, // 빈 문항 → 표준 6문항 프리셋
  a_scale: { type: 'scale', id: 'a_scale', title: '적용 가능성', prompt: '적용할 수 있다고 느끼는 정도는?', lowLabel: '전혀', highLabel: '매우' },
  a_ox: { type: 'ox', id: 'a_ox', title: 'OX', question: 'LLM은 다음 단어를 확률로 예측한다.', answer: 'O', timeLimitSec: 15, explanation: '맞다' },
};
const deck = { id: deckId, title: '강당 활동 검증 덱', slides: [mkSlide(0), ...Object.keys(activities).map((id, i) => mkSlide(i + 1, id))], activities };
await api('PUT', `/api/decks/${deckId}`, { deckId, editPin, deck });
const { deck: loaded } = await api('POST', `/api/decks/${deckId}/edit`, { editPin });
check('저장 라운드트립: survey/scale/ox 3종 보존', ['survey', 'scale', 'ox'].every((t) => Object.values(loaded.activities).some((a) => a.type === t)));
check('survey 빈 문항 → 표준 6문항 프리셋(likert4+nps1+text1)',
  loaded.activities.a_survey?.questions?.length === 6 &&
  loaded.activities.a_survey.questions.filter((q) => q.kind === 'likert').length === 4 &&
  loaded.activities.a_survey.questions.some((q) => q.kind === 'nps') &&
  loaded.activities.a_survey.questions.at(-1)?.kind === 'text');
check('ox 저장: answer/timeLimitSec/explanation 보존', loaded.activities.a_ox?.answer === 'O' && loaded.activities.a_ox?.timeLimitSec === 15 && loaded.activities.a_ox?.explanation === '맞다');
check('scale 저장: lowLabel/highLabel 보존', loaded.activities.a_scale?.lowLabel === '전혀' && loaded.activities.a_scale?.highLabel === '매우');

const pub = await api('GET', `/api/decks/${deckId}`);
check('공개 덱: ox 정답(answer)·해설 제거', pub.activities.a_ox && !('answer' in pub.activities.a_ox) && !('explanation' in pub.activities.a_ox));

// quick-generate 타입 허용 검사 (AI 호출은 하지 않음 — 미등록 타입만 400 확인)
const bad = await fetch(BASE + '/api/decks/quick-generate', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ deck, pdfText: 'x', type: 'nope', count: 1 }) });
check('quick-generate: 미등록 타입 400 거부 (survey/scale/ox 는 GEN_TYPES 등록)', bad.status === 400);

// ── 1. 강의실 + 소켓 4개 (강사 / 학생 A·B / 프로젝터) ──
const creds = await api('POST', '/api/classrooms', { deckId });
const [ins, stA, stB, view] = await Promise.all([connect(), connect(), connect(), connect()]);
ins.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret });
await waitFor(ins, 'state');
stA.emit('student:join', { token: creds.token, nickname: '참가자A', sessionId: 'sess-A-' + Date.now() });
stB.emit('student:join', { token: creds.token, nickname: '참가자B', sessionId: 'sess-B-' + Date.now() });
view.emit('viewer:join', { token: creds.token });
await Promise.all([waitFor(stA, 'joined'), waitFor(stB, 'joined'), waitFor(view, 'state')]);
check('소켓 입장: 강사·학생2·프로젝터', true);

// ── 2. scale: 열기 → 투표 5·3 → 분포 ──
{
  const p = waitFor(view, 'poll:update', (d) => d.activityId === 'a_scale');
  ins.emit('instructor:openActivity', { activityId: 'a_scale' });
  await p;
  const upd = waitFor(view, 'poll:update', (d) => d.activityId === 'a_scale' && d.distribution.total === 2);
  stA.emit('student:pollVote', { activityId: 'a_scale', value: '5' });
  stB.emit('student:pollVote', { activityId: 'a_scale', value: '3' });
  const d = await upd;
  check('scale 투표: 분포 {5:1, 3:1}, total 2', d.distribution.counts['5'] === 1 && d.distribution.counts['3'] === 1);
  const noBad = await expectNo(view, 'poll:update', 600);
  stA.emit('student:pollVote', { activityId: 'a_scale', value: '9' });
  check('scale 투표: 범위 밖 값(9) 무시', await expectNo(view, 'poll:update', 600) && noBad);
}

// ── 3. survey: 열기 → 제출 → 집계 → 마감 → 늦은 제출 거부 ──
{
  const opened = waitFor(stA, 'activity:opened', (a) => a.activityId === 'a_survey');
  ins.emit('instructor:openActivity', { activityId: 'a_survey' });
  const a = await opened;
  check('survey 열기: phase=open', a.survey?.phase === 'open');
  const qs = loaded.activities.a_survey.questions;
  const ans = {}; qs.forEach((q, i) => { ans[q.id] = q.kind === 'text' ? '주관식 응답입니다' : q.kind === 'nps' ? 9 : 4 + (i % 2); });
  const upd = waitFor(view, 'survey:update', (s) => s.activityId === 'a_survey' && s.total === 1);
  stA.emit('student:surveySubmit', { activityId: 'a_survey', answers: { ...ans, [qs[0].id]: 99 } }); // 첫 문항 범위 밖 → 그 문항만 무시
  const s = await upd;
  const q0 = s.questions.find((q) => q.id === qs[0].id);
  const qn = s.questions.find((q) => q.kind === 'nps');
  const qt = s.questions.find((q) => q.kind === 'text');
  check('survey 집계: total 1, 범위 밖 문항 무시, NPS 평균 9, 주관식 수집', q0.count === 0 && qn.avg === 9 && qt.texts?.[0] === '주관식 응답입니다');
  const closed = waitFor(stB, 'activity:opened', (x) => x.survey?.phase === 'closed');
  ins.emit('instructor:surveyClose');
  await closed;
  check('survey 마감: phase=closed 브로드캐스트', true);
  const err = waitFor(stB, 'errmsg');
  stB.emit('student:surveySubmit', { activityId: 'a_survey', answers: { [qs[1].id]: 5 } });
  check('survey 마감 후 제출 거부(errmsg)', !!(await err));
}

// ── 4. ox 즉석 출제 (덱 편집 없이) → 응답 → 정답 공개 → 점수 ──
{
  const opened = waitFor(stA, 'activity:opened', (a) => a.type === 'ox');
  ins.emit('instructor:quickOx', { question: '즉석 문제: 1+1=2 이다.', answer: 'O', timeLimitSec: 10 });
  const a = await opened;
  check('quickOx: adhoc ox 활동 열림(덱에 없음) + 정답 미노출', a.adhoc?.type === 'ox' && !('answer' in a.adhoc) && a.quiz?.total === 1 && a.activityId.startsWith('ox_'));
  const q = waitFor(stA, 'quiz:question');
  ins.emit('instructor:quizStart');
  const qq = await q;
  check('quickOx: quiz:question 보기 O/X', qq.options.join('') === 'OX' && qq.question.startsWith('즉석'));
  const answered = waitFor(ins, 'quiz:answered', (p) => p.count === 2);
  stA.emit('student:quizAnswer', { questionId: qq.questionId, optionIndex: 0 });
  stB.emit('student:quizAnswer', { questionId: qq.questionId, optionIndex: 1 });
  await answered;
  const rev = waitFor(view, 'quiz:reveal');
  ins.emit('instructor:quizReveal');
  const r = await rev;
  const aScore = r.leaderboard.find((e) => e.nickname === '참가자A')?.score ?? 0;
  const bScore = r.leaderboard.find((e) => e.nickname === '참가자B')?.score ?? 0;
  check('quickOx: 정답 공개 correctIndex=0, 분포 {0:1,1:1}, A 득점·B 0점', r.correctIndex === 0 && r.distribution['0'] === 1 && r.distribution['1'] === 1 && aScore >= 500 && bScore === 0);
  // 늦게 들어온 프로젝터가 ox 상태를 복원하는지
  const late = await connect();
  const sync = waitFor(late, 'quiz:reveal');
  late.emit('viewer:join', { token: creds.token });
  check('quickOx: 늦은 입장 소켓에 문항+정답 공개 동기화', (await sync).questionId === qq.questionId);
  late.close();
  ins.emit('instructor:closeActivity');
  await waitFor(stA, 'activity:closed');
}

// ── 5. 덱의 ox 활동도 quiz 엔진으로 동작 ──
{
  const opened = waitFor(stA, 'activity:opened', (a) => a.activityId === 'a_ox');
  ins.emit('instructor:openActivity', { activityId: 'a_ox' });
  const a = await opened;
  check('덱 ox 활동 열기: quiz 상태(total 1)', a.type === 'ox' && a.quiz?.total === 1);
  ins.emit('instructor:closeActivity');
  await waitFor(stA, 'activity:closed');
}

// ── 6. Q&A 2.0 ──
{
  // 질문 → 강사·학생·프로젝터 모두 수신 (자동 공개)
  const [qi, qa, qv] = [waitFor(ins, 'question:new'), waitFor(stA, 'question:new'), waitFor(view, 'question:new')];
  stB.emit('student:askQuestion', { text: '첫 번째 질문입니다' });
  const [q1] = await Promise.all([qi, qa, qv]);
  check('Q&A: 질문 필드(upvotes 0/answered false/approved true) + 전원 수신', q1.upvotes === 0 && q1.answered === false && q1.approved === true);

  // 업보트: A 1회 → 1, A 재시도 무시, B → 2
  const u1 = waitFor(view, 'question:update', (q) => q.id === q1.id && q.upvotes === 1);
  stA.emit('student:upvoteQuestion', { questionId: q1.id });
  await u1;
  stA.emit('student:upvoteQuestion', { questionId: q1.id });
  const noDup = await expectNo(view, 'question:update', 600);
  const u2 = waitFor(view, 'question:update', (q) => q.id === q1.id && q.upvotes === 2);
  stB.emit('student:upvoteQuestion', { questionId: q1.id });
  await u2;
  check('Q&A 업보트: 1인 1질문 1회(중복 무시), 2명 → 2', noDup);

  // 답변완료
  const ans = waitFor(stA, 'question:update', (q) => q.id === q1.id && q.answered === true);
  ins.emit('instructor:questionAnswered', { questionId: q1.id, answered: true });
  await ans;
  check('Q&A 답변완료 체크 → 참가자에 전파', true);

  // 프로젝터 카드 뷰 토글 → state.qa.onScreen
  const st = waitFor(view, 'state', (s) => s.qa?.onScreen === true);
  ins.emit('instructor:qaSettings', { onScreen: true });
  await st;
  check('Q&A 프로젝터 카드 뷰 토글: snapshot.qa.onScreen=true', true);

  // 모더레이션: 승인 전 참가자·프로젝터 미수신, 강사만 수신 → 승인 → 공개
  const mod = waitFor(ins, 'state', (s) => s.qa?.moderation === true);
  ins.emit('instructor:qaSettings', { moderation: true });
  await mod;
  const pendingToIns = waitFor(ins, 'question:new', (q) => q.approved === false);
  const hidden = expectNo(view, 'question:new', 900);
  const hiddenA = expectNo(stA, 'question:new', 900);
  stB.emit('student:askQuestion', { text: '승인 대기 질문' });
  const q2 = await pendingToIns;
  check('Q&A 모더레이션: 미승인 질문은 강사에게만(프로젝터·다른 참가자 미수신)', (await hidden) && (await hiddenA) && q2.approved === false);
  const shown = waitFor(view, 'question:new', (q) => q.id === q2.id && q.approved === true);
  ins.emit('instructor:questionApprove', { questionId: q2.id });
  await shown;
  check('Q&A 승인 → 프로젝터·참가자에 공개', true);

  // 삭제
  const rm = waitFor(stA, 'question:remove', (p) => p.id === q2.id);
  ins.emit('instructor:questionRemove', { questionId: q2.id });
  await rm;
  check('Q&A 삭제 → question:remove 전파', true);

  // 늦게 입장한 참가자는 승인된 질문만 동기화
  const late = await connect();
  const sync = waitFor(late, 'questions:sync');
  late.emit('student:join', { token: creds.token, nickname: '늦참', sessionId: 'sess-late-' + Date.now() });
  const list = await sync;
  check('Q&A 늦은 입장: questions:sync(승인분) 수신', Array.isArray(list) && list.some((q) => q.id === q1.id) && list.every((q) => q.approved));
  late.close();
}

// ── 7. DB 저장 + 리포트 (best-effort 기록이므로 잠시 대기) ──
await sleep(2000);
try {
  const rep = await api('GET', `/api/classrooms/${creds.classroomId}/report?secret=${creds.instructorSecret}`);
  const sv = rep.surveySummary?.a_survey;
  const sc = rep.pollSummary?.a_scale;
  check('리포트: surveySummary(total 1, 문항별 avg/dist/texts)', sv?.total === 1 && sv.questions.some((q) => q.kind === 'nps' && q.avg === 9) && sv.questions.some((q) => q.kind === 'text' && q.texts.length === 1));
  check('리포트: scale 평균 4.00 (5·3)', sc?.mode === 'scale' && sc.avg === 4);
  check('리포트: qaSummary(질문 DB 저장, 업보트·답변완료 반영)', Array.isArray(rep.qaSummary) && rep.qaSummary.some((q) => q.text === '첫 번째 질문입니다' && q.upvotes === 2 && q.answered === true) && !rep.qaSummary.some((q) => q.text === '승인 대기 질문'));
  check('리포트: 즉석 OX 응답이 quizSummary 에 기록', Object.entries(rep.quizSummary).some(([k, v]) => k.startsWith('ox_') && v.totalAnswers === 2));
} catch (e) {
  check('리포트 API', false, e.message);
}

// ── 정리 ──
for (const s of [ins, stA, stB, view]) s.close();
await api('DELETE', `/api/decks/${deckId}`, { editPin });

const fail = results.filter((r) => !r.ok);
console.log(`\n===== 결과: ${results.length - fail.length}/${results.length} 통과 =====`);
if (fail.length) { console.log('실패:', fail.map((f) => f.name).join(' | ')); process.exit(1); }
process.exit(0);
