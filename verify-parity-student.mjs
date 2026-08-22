// 학생 화면 레지스트리 렌더링 검증 — 9종 중 대표 활동(chat/lab/poll/roleplay)을 열고
// 학생 브라우저에 올바른 활동 UI가 뜨는지 확인 (렌더러는 기존 컴포넌트 재사용)
// 사용법: 서버(8795)+클라(5181) 기동 후  node verify-parity-student.mjs
import { chromium } from 'playwright';
import { io } from 'socket.io-client';

const CLIENT = process.argv[2] || 'http://localhost:5181';
const SERVER = process.argv[3] || 'http://localhost:8795';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}`); };

let cookie = '';
async function api(method, path, body) {
  const r = await fetch(SERVER + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return r.json();
}

// 덱 준비: 대표 활동 4종
await api('POST', '/api/auth/dev-login', { email: 'parity-student@test.local' });
const { deckId, editPin } = await api('POST', '/api/decks', { title: '학생뷰 검증' });
const deck = {
  id: deckId, title: '학생뷰 검증',
  slides: [
    { id: 's0', part: 0, partTitle: '', layout: 'title', title: '학생뷰 검증', blocks: [] },
    { id: 's1', part: 0, partTitle: '', layout: 'content', title: '대화', blocks: [], activityId: 'v_chat' },
    { id: 's2', part: 0, partTitle: '', layout: 'content', title: '랩', blocks: [], activityId: 'v_lab' },
    { id: 's3', part: 0, partTitle: '', layout: 'content', title: '투표', blocks: [], activityId: 'v_poll' },
    { id: 's4', part: 0, partTitle: '', layout: 'content', title: '역할극', blocks: [], activityId: 'v_rp' },
  ],
  activities: {
    v_chat: { type: 'chat', id: 'v_chat', title: '학생뷰 대화', intro: '미션을 골라보자', systemPrompt: '도우미', missions: ['별명을 지어줘'] },
    v_lab: { type: 'lab', id: 'v_lab', labType: 'context', title: '학생뷰 랩', task: '요청을 적어줘', labelA: '맥락 없음', labelB: '맥락 있음', examplePrompts: ['영화 추천해줘'] },
    v_poll: { type: 'poll', id: 'v_poll', title: '학생뷰 투표', prompt: '한 단어로?', mode: 'wordcloud', options: [] },
    v_rp: { type: 'roleplay', id: 'v_rp', title: '학생뷰 역할극', systemPrompt: '너는 세종대왕이야.', missionKeyword: '애민정신', missionDescription: '애민을 여쭤보자' },
  },
};
await api('PUT', `/api/decks/${deckId}`, { deckId, editPin, deck });
const { token, instructorSecret } = await api('POST', '/api/classrooms', { deckId });
console.log('   교실 토큰:', token);

// 강사 소켓
const teacher = io(SERVER, { transports: ['websocket'] });
await new Promise((res, rej) => {
  teacher.on('connect', () => { teacher.emit('instructor:join', { token, instructorSecret }); res(); });
  teacher.on('connect_error', rej);
});
await sleep(500);

// 학생 브라우저
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${CLIENT}/join?token=${token}`);
await page.locator('input').nth(1).fill('검증생');
await page.getByText('입장하기').click();
await page.waitForURL('**/play**', { timeout: 10000 }).catch(() => {});
await sleep(1000);

const CASES = [
  ['v_chat', 'chat 학생뷰(미션 칩)', '별명을 지어줘'],
  ['v_lab', 'lab 학생뷰(비교 라벨)', '맥락 있음'],
  ['v_poll', 'poll 학생뷰(질문)', '한 단어로?'],
  ['v_rp', 'roleplay 학생뷰(미션)', '애민을 여쭤보자'],
];
for (const [actId, name, marker] of CASES) {
  teacher.emit('instructor:openActivity', { activityId: actId });
  await sleep(1200);
  const ok = await page.getByText(marker, { exact: false }).first().isVisible().catch(() => false);
  check(name, ok);
  teacher.emit('instructor:closeActivity');
  await sleep(400);
}
await page.screenshot({ path: 'shots/parity-student.png' });

teacher.close();
await browser.close();
await api('DELETE', `/api/decks/${deckId}`, { editPin });
console.log('페이지 에러:', errors.length ? errors.join(' | ') : '없음');
const fail = results.filter((r) => !r.ok);
console.log(`===== 결과: ${results.length - fail.length}/${results.length} 통과 =====`);
process.exit(fail.length ? 1 : 0);
