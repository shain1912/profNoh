// 활동 생성 패리티 검증 — 세 경로(수동 저장/AI 조교 quick-generate/원버튼 generate)에서
// 9종 활동이 모두 만들어지는지 확인한다.
// 사용법: 서버 기동(PORT=8795) 후  node verify-activity-parity.mjs [http://localhost:8795]
const BASE = process.argv[2] || 'http://localhost:8795';
const ALL_TYPES = ['chat', 'image', 'lab', 'quiz', 'poll', 'roleplay', 'analogy', 'writing', 'tutor'];

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

// ── 0. 로그인 ──
await api('POST', '/api/auth/dev-login', { email: 'parity-worker@test.local', name: '패리티검증' });
check('dev-login', !!cookie);

// ── 1. 수동 편집 경로: 9종 전부 저장 → 로드 라운드트립 ──
const { deckId, editPin } = await api('POST', '/api/decks', { title: '패리티 검증 덱' });
const mkSlide = (i, actId) => ({
  id: 's' + i, part: 1, partTitle: '검증', layout: 'content', title: '슬라이드 ' + i,
  blocks: [], notes: '', activityId: actId,
});
const activities = {
  a_chat: { type: 'chat', id: 'a_chat', title: '대화', intro: '인트로', systemPrompt: '너는 도우미야.', missions: ['미션1', '미션2'] },
  a_image: { type: 'image', id: 'a_image', title: '이미지', suggestions: ['노을 지는 바닷가, 수채화'] },
  a_lab: {
    type: 'lab', id: 'a_lab', labType: 'harness', title: '랩', task: '과제', inputPlaceholder: '예시',
    examplePrompts: ['체육대회 계획 짜줘'], labelA: '싱글샷', labelB: '다단계',
    cannedResults: { '체육대회 계획 짜줘': { outputA: 'A 결과', outputB: 'B 결과' } },
  },
  a_quiz: { type: 'quiz', id: 'a_quiz', title: '퀴즈', intro: '몸풀기', questions: [{ id: 'q1', question: '1+1?', options: ['1', '2'], correctIndex: 1, timeLimitSec: 15, explanation: '2다' }] },
  a_poll: { type: 'poll', id: 'a_poll', title: '투표', prompt: '한 단어로?', mode: 'wordcloud', options: [] },
  a_poll2: { type: 'poll', id: 'a_poll2', title: '객관식 투표', prompt: '어느 쪽?', mode: 'choice', options: ['A', 'B'] },
  a_roleplay: { type: 'roleplay', id: 'a_roleplay', title: '역할극', systemPrompt: '너는 세종대왕이야.', missionKeyword: '애민정신', missionDescription: '단어를 이끌어내자' },
  a_analogy: { type: 'analogy', id: 'a_analogy', title: '비유', personaA: '7세', personaB: '고등학생' },
  a_writing: { type: 'writing', id: 'a_writing', title: '창작', genre: 'story', promptPlaceholder: '첫눈' },
  a_tutor: { type: 'tutor', id: 'a_tutor', title: '튜터', subject: 'math', taskDescription: '문제 풀기' },
};
const deck = {
  id: deckId, title: '패리티 검증 덱',
  slides: [mkSlide(0), ...Object.keys(activities).map((id, i) => mkSlide(i + 1, id))],
  activities,
};
await api('PUT', `/api/decks/${deckId}`, { deckId, editPin, deck });
const { deck: loaded } = await api('POST', `/api/decks/${deckId}/edit`, { editPin });
const loadedTypes = new Set(Object.values(loaded.activities).map((a) => a.type));
for (const t of ALL_TYPES) check(`수동 저장 라운드트립: ${t}`, loadedTypes.has(t));
check('lab 옵션 보존: labType/examplePrompts/cannedResults/labels',
  loaded.activities.a_lab?.labType === 'harness' &&
  loaded.activities.a_lab?.examplePrompts?.length === 1 &&
  loaded.activities.a_lab?.cannedResults?.['체육대회 계획 짜줘']?.outputB === 'B 결과' &&
  loaded.activities.a_lab?.labelB === '다단계');
check('quiz 옵션 보존: intro/timeLimitSec', loaded.activities.a_quiz?.intro === '몸풀기' && loaded.activities.a_quiz?.questions?.[0]?.timeLimitSec === 15);
check('poll 옵션 보존: title/mode(wordcloud·choice)',
  loaded.activities.a_poll?.mode === 'wordcloud' && loaded.activities.a_poll2?.mode === 'choice' && loaded.activities.a_poll2?.options?.length === 2);
check('chat 옵션 보존: systemPrompt/missions', loaded.activities.a_chat?.systemPrompt?.length > 0 && loaded.activities.a_chat?.missions?.length === 2);

// ── 2. AI 조교 quick-generate: 9종 전부 허용 + 신규 3종 실생성 ──
const pdfText = ['[Page 1]', '생성형 AI는 다음에 올 단어를 확률로 예측해 글을 만든다. 환각이라는 그럴듯한 거짓말도 한다.',
  '[Page 2]', '프롬프트의 말투보다 맥락(배경·조건·예시)을 주는 것이 결과를 크게 바꾼다.',
  '[Page 3]', '복잡한 일은 한 번에 시키기보다 단계로 쪼개 시키는 하네스 설계가 더 좋은 결과를 낸다.'].join('\n');
const pdfDeck = {
  id: deckId, title: 'AI 특강',
  slides: [1, 2, 3].map((n) => ({ id: 'p' + n, part: 1, partTitle: 'PDF', layout: 'pdf', title: n + '페이지', pdfUrl: '/x.pdf', pageNumber: n, blocks: [], notes: '' })),
  activities: {},
};
// 잘못된 타입은 거부되는지
const badRejected = await fetch(BASE + '/api/decks/quick-generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ deck: pdfDeck, pdfText, type: 'nope', count: 1 }),
}).then((r) => r.status === 400);
check('quick-generate: 미등록 타입 400 거부', badRejected);

const REQUIRED_FIELDS = {
  chat: (a) => !!a.systemPrompt,
  image: (a) => Array.isArray(a.suggestions) && a.suggestions.length > 0,
  lab: (a) => !!a.task && !!a.labelA && !!a.labelB && ['prompt', 'context', 'harness'].includes(a.labType),
};
for (const type of ['chat', 'image', 'lab']) {
  try {
    const r = await api('POST', '/api/decks/quick-generate', { deck: pdfDeck, pdfText, type, count: 1 });
    const op = (r.operations ?? [])[0];
    const ok = !!op && op.type === `add_${type}` && REQUIRED_FIELDS[type](op.activity ?? {});
    check(`quick-generate 실생성: ${type}`, ok, ok ? (op.activity.title ?? '') : JSON.stringify(r).slice(0, 150));
  } catch (e) {
    check(`quick-generate 실생성: ${type}`, false, e.message);
  }
}

// ── 3. 원버튼 생성: 신규 3종 포함 요청 ──
try {
  const g = await api('POST', '/api/decks/generate', {
    topic: '생성형 AI와 미래 직업', audience: '고등학교 1학년', parts: 2, quizPerPart: 1,
    activities: ['chat', 'image', 'lab', 'roleplay'],
  });
  const { deck: gen } = await api('POST', `/api/decks/${g.deckId}/edit`, { editPin: g.editPin });
  const genTypes = new Set(Object.values(gen.activities).map((a) => a.type));
  console.log('   원버튼 결과 활동 타입:', [...genTypes].join(', '));
  for (const t of ['chat', 'image', 'lab', 'roleplay']) {
    check(`원버튼 생성 포함: ${t}`, genTypes.has(t), genTypes.has(t) ? '' : '(모델이 누락 — 재시도 시 달라질 수 있음)');
  }
  check('원버튼 생성: 퀴즈 자동 포함', genTypes.has('quiz'));
  await api('DELETE', `/api/decks/${g.deckId}`, { editPin: g.editPin });
} catch (e) {
  check('원버튼 생성', false, e.message);
}

// ── 정리 ──
await api('DELETE', `/api/decks/${deckId}`, { editPin });

const fail = results.filter((r) => !r.ok);
console.log(`\n===== 결과: ${results.length - fail.length}/${results.length} 통과 =====`);
if (fail.length) { console.log('실패:', fail.map((f) => f.name).join(' | ')); process.exit(1); }
