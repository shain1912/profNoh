// 쇼케이스 녹화 — 폰(학생)·프로젝터 영상 + 단계별 스크린샷. 로컬 서버 8796 / 클라 5181 기동 후: npx tsx record-showcase.mts <outDir>
import { chromium, devices, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gyeongnamAviation3h as deck } from './server/src/decks/gyeongnam-aviation-3h';

const API = 'http://localhost:8796';
const WEB = 'http://localhost:5181';
const OUT = process.argv[2];
mkdirSync(`${OUT}/shots`, { recursive: true });
mkdirSync(`${OUT}/video`, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log: { file: string; caption: string; scene: string }[] = [];
let scene = '';
let n = 0;
async function shot(p: Page, caption: string) {
  const file = `shots/${String(++n).padStart(2, '0')}.png`;
  await p.screenshot({ path: `${OUT}/${file}` });
  log.push({ file, caption, scene });
  console.log('📸', file, caption);
}
const slideOf = (actId: string) => deck.slides.findIndex((s) => s.activityId === actId);
const slideById = (id: string) => deck.slides.findIndex((s) => s.id === id);

// ── 강의실 + 강사 로그인 ──
const login = await fetch(API + '/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'shain1912@gmail.com', name: '조성호' }) });
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
const cr = await (await fetch(API + '/api/classrooms', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ deckId: 'gnaero', mode: 'auditorium', title: deck.title }) })).json();
const creds = { token: cr.token, instructorSecret: cr.instructorSecret, classroomId: cr.classroomId, deckId: 'gnaero' };
console.log('classroom', cr.token);

const ctrl: Socket = io(API, { transports: ['websocket'] });
await new Promise((r) => ctrl.on('connect', r));
ctrl.emit('instructor:join', { token: cr.token, instructorSecret: cr.instructorSecret });
await sleep(500);
const goto = async (slide: number) => { ctrl.emit('instructor:goto', { slide }); await sleep(900); };
const open = async (actId: string) => { await goto(slideOf(actId)); ctrl.emit('instructor:openActivity', { activityId: actId }); await sleep(1500); };
const close = async () => { ctrl.emit('instructor:closeActivity'); await sleep(600); };

// ── 가상 학생 14명 (투표·퀴즈를 채워 화면을 실제처럼) ──
const NAMES = ['하늘정비', '제트엔진', '윙맨', '프로펠러', '관제탑', '랜딩기어', '에어버스', '드론킹', '활주로', '조종간', '블랙박스', '기장님', '토크렌치', '비행기러버'];
const bots: { s: Socket; sid: string }[] = [];
for (const [i, name] of NAMES.entries()) {
  const sid = `bot-${Date.now()}-${i}`;
  const s: Socket = io(API, { transports: ['websocket'] });
  await new Promise<void>((r) => { s.on('connect', () => s.emit('student:join', { token: cr.token, nickname: name, sessionId: sid })); s.on('joined', () => r()); });
  bots.push({ s, sid });
}
const correctOf = (actId: string, qi: number) => {
  const a: any = deck.activities[actId];
  return a.type === 'ox' ? (a.answer === 'O' ? 0 : 1) : a.questions[qi].correctIndex;
};
function botsAnswer(actId: string, qi: number, questionId: string) {
  const a: any = deck.activities[actId];
  const nOpt = a.type === 'ox' ? 2 : a.questions[qi].options.length;
  bots.forEach(({ s }, i) => setTimeout(() => {
    const right = Math.random() < 0.72;
    const opt = right ? correctOf(actId, qi) : (correctOf(actId, qi) + 1 + (i % (nOpt - 1))) % nOpt;
    s.emit('student:quizAnswer', { questionId, optionIndex: opt });
  }, 400 + i * 180));
}
function botsVote(actId: string, values: string[]) {
  bots.forEach(({ s }, i) => setTimeout(() => s.emit('student:pollVote', { activityId: actId, value: values[i % values.length] }), 300 + i * 150));
}

const browser = await chromium.launch();
// 폰 (영상)
const phoneCtx = await browser.newContext({ ...devices['iPhone 13'], recordVideo: { dir: `${OUT}/video/phone`, size: { width: 390, height: 844 } } });
const phone = await phoneCtx.newPage();
// 프로젝터 (영상)
const projCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: `${OUT}/video/projector`, size: { width: 1280, height: 720 } } });
const proj = await projCtx.newPage();
// 강사 콘솔 (스크린샷)
const insCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const [ck, cv] = cookie.split('=');
await insCtx.addCookies([{ name: ck, value: cv, url: WEB }]);
const ins = await insCtx.newPage();

async function quiz(actId: string, count: number, phoneRight = true) {
  const a: any = deck.activities[actId];
  await open(actId);
  for (let qi = 0; qi < count; qi++) {
    const qEvt = new Promise<any>((r) => bots[0].s.once('quiz:question', r));
    ctrl.emit('instructor:quizStart');
    const q = await Promise.race([qEvt, sleep(4000).then(() => null)]);
    await sleep(1200);
    if (q?.questionId) botsAnswer(actId, qi, q.questionId);
    if (qi === 0) await shot(phone, `${a.title} — 폰 문제 화면`);
    if (a.type === 'ox') {
      const ans = correctOf(actId, qi) === 0 ? '맞다 (O)' : '틀리다 (X)';
      await phone.locator(`button[aria-label="${ans}"]`).click().catch(() => {});
    } else {
      const optText: string = a.questions[qi].options[phoneRight ? a.questions[qi].correctIndex : 0];
      await phone.getByRole('button', { name: optText.slice(0, 12) }).first().click().catch((e) => console.log('quiz click', e.message));
    }
    await sleep(3200);
    ctrl.emit('instructor:quizReveal');
    await sleep(2200);
    if (qi === 0) { await shot(proj, `${a.title} — 프로젝터 정답 공개`); await shot(phone, `${a.title} — 폰 정답·해설`); }
    if (qi < count - 1) { ctrl.emit('instructor:quizNext'); await sleep(900); }
  }
}

async function vibeBuild(prompt: string, label: string) {
  await phone.locator('textarea').last().fill(prompt);
  await phone.getByRole('button', { name: /앱 만들기|고치기/ }).click();
  await sleep(3800);
  await shot(phone, `${label} — AI가 코드를 쓰는 중 (실시간)`);
  await phone.waitForSelector('iframe[src*="/api/vibe/app/"]', { timeout: 90_000 });
  await sleep(2500);
  await shot(phone, `${label} — 완성된 앱이 폰에서 바로 실행`);
}

try {
  // ═══ 0. 입장 ═══
  scene = '입장 · 워밍업';
  await proj.goto(`${WEB}/screen/${cr.token}`);
  await ins.goto(`${WEB}/teach`);
  await ins.evaluate((c) => history.replaceState({ usr: { creds: c }, key: 'x', idx: 0 }, '', '/teach'), creds);
  await ins.reload();
  await ins.waitForSelector('[data-testid="next-step"]', { timeout: 20_000 }).catch(() => {});
  await goto(0);
  await sleep(1200);
  await shot(proj, '프로젝터 — 강당 모드 대기 화면 (입장 QR · 접속 인원)');
  await proj.keyboard.press('s');
  await sleep(1200);
  await shot(proj, '프로젝터 — S 키로 슬라이드 보기 전환 (하단 입장 바 유지)');
  await phone.goto(`${WEB}/join?token=${cr.token}`);
  await sleep(800);
  const nick = phone.locator('input').nth(1);
  await nick.fill('');
  await nick.pressSequentially('항공고 김민준', { delay: 60 });
  await phone.getByRole('button', { name: /입장|시작|참여/ }).first().click();
  await phone.waitForURL(/\/play/, { timeout: 10_000 }).catch(() => {});
  await sleep(1200);
  await shot(phone, '폰 — QR 찍고 이름만 쓰면 입장 (앱 설치 없음)');
  await shot(ins, '강사 콘솔 — 슬라이드 · 노트 · 활동 제어');

  await open('poll-warmup');
  await phone.locator('input').last().pressSequentially('자동화', { delay: 70 });
  await phone.getByRole('button', { name: /보내기|제출|등록/ }).first().click().catch(() => phone.keyboard.press('Enter'));
  botsVote('poll-warmup', ['챗GPT', '자동화', '로봇', '미래', '편리함', '자율비행', '자동화', '일자리', '챗GPT', '드론', '무서움', '신기함', '자동화', '코딩']);
  await sleep(3000);
  ctrl.emit('instructor:pollClose'); await sleep(500); ctrl.emit('instructor:pollReveal'); await sleep(2500);
  await shot(proj, '워밍업 — "AI 하면 떠오르는 단어" 워드클라우드');
  await close();
  await quiz('quiz-warmup', 1);
  await close();

  // ═══ 1교시 ═══
  scene = '1교시 · 바이브코딩';
  await goto(slideById('g1-4')); await sleep(800);
  await shot(proj, '슬라이드 — AI 그림 코딩 = 모양 + 색 + 글자');
  await open('image-future-aircraft');
  await phone.getByText(/남색 원 안에/).first().click();
  await phone.getByRole('button', { name: '만들기' }).click();
  await phone.waitForSelector('figure img', { timeout: 60_000 });
  await sleep(1500);
  await shot(phone, 'AI 그림 코딩 — 말로 설명한 엠블럼을 SVG 코드로 그림 (약 4초)');
  await close();

  await goto(slideById('g1-7')); await sleep(600);
  await shot(proj, '슬라이드 — 좋은 요청 공식');
  await open('vibe-lv1');
  await shot(phone, '바이브코딩 Lv.1 — 미션과 아이디어 칩');
  // 가상 학생 5명도 앱을 만든다 (갤러리용)
  const botIdeas = ['토크 단위 변환기 in-lb ft-lb N·m', '항공 음성 알파벳 암기 퀴즈', '공항 3글자 코드 맞히기 게임', '항공 정비 공구 대여 기록장', '비행기 부품 이름 맞히기 퀴즈'];
  const botBuilds = bots.slice(0, 5).map(({ sid }, i) => fetch(API + '/api/ai/vibe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cr.token, sessionId: sid, activityId: 'vibe-lv1', prompt: botIdeas[i] + ' 앱' }) }).then((r) => r.text()));
  await vibeBuild('항공기 외부 점검(Walk-around) 체크리스트 앱. 항목을 체크하면 진행률이 올라가고, 다 체크하면 축하 메시지', 'Lv.1 첫 앱');
  const f = phone.frames().find((fr) => fr.url().includes('/api/vibe/app/'));
  if (f) {
    const boxes = f.locator('input[type=checkbox], [role=checkbox], li, .item');
    const cnt = Math.min(3, await boxes.count());
    for (let i = 0; i < cnt; i++) await boxes.nth(i).click({ timeout: 2000 }).catch(() => {});
    await sleep(800);
    await shot(phone, 'Lv.1 — 만든 앱을 직접 눌러 보기 (진행률 증가)');
  }
  await vibeBuild('배경을 하늘색 그라데이션으로 바꾸고 맨 위에 비행기 이모지를 크게 넣어줘', 'Lv.1 고치기');
  await Promise.all(botBuilds);
  await close();

  // ═══ 2교시 ═══
  scene = '2교시 · AI 윤리';
  await goto(slideById('g2-3')); await sleep(800);
  await shot(proj, '슬라이드 — 환각(Hallucination)');
  await quiz('ox-hallucination', 1);
  await close();

  await open('roleplay-investigation');
  await phone.locator('textarea, input').last().fill('토크 값을 AI한테 물어봤을 때, 그 숫자를 매뉴얼이랑 대조해 봤나요?');
  await phone.locator('form button.btn-primary').last().click();
  await phone.waitForFunction(() => document.body.innerText.includes('김민수') || document.querySelectorAll('[class*="assistant"], .whitespace-pre-wrap').length > 1, null, { timeout: 60_000 }).catch(() => {});
  await sleep(6000);
  await shot(phone, 'AI 사고 조사위원회 역할극 — 학생이 조사위원, AI가 정비사');
  await close();

  await quiz('quiz-deepfake', 1);
  await close();

  await open('vibe-lv2');
  await sleep(1500);
  await shot(phone, 'Lv.2 — 1교시에 만든 내 앱이 그대로 불러와짐');
  await vibeBuild('각 항목 옆에 "매뉴얼 확인함" 체크칸을 추가하고, 매뉴얼 확인 안 한 항목이 있으면 빨간 경고를 띄워줘', 'Lv.2 검증 기능 추가');
  await close();

  // ═══ 3교시 ═══
  scene = '3교시 · 항공 AI 진로';
  await open('poll-aviation-ai');
  const opts: string[] = (deck.activities['poll-aviation-ai'] as any).options;
  await phone.getByRole('button', { name: opts[0].slice(0, 8) }).first().click().catch(() => {});
  botsVote('poll-aviation-ai', [opts[0], opts[1], opts[0], opts[2], opts[3], opts[0], opts[1], opts[4] ?? opts[0], opts[2], opts[0], opts[1], opts[5] ?? opts[1], opts[0], opts[3]]);
  await sleep(3000);
  ctrl.emit('instructor:pollClose'); await sleep(500); ctrl.emit('instructor:pollReveal'); await sleep(2500);
  await shot(proj, '투표 — 10년 뒤 가장 기대되는 항공 AI 분야');
  await close();

  await open('image-future-me');
  await phone.getByText(/금색 날개 가운데/).first().click();
  await phone.getByRole('button', { name: '만들기' }).click();
  await phone.waitForSelector('figure img', { timeout: 60_000 });
  await sleep(1500);
  await shot(phone, '나의 항공 진로 윙 배지 — SVG 코드 그림');
  await close();

  await open('tutor-career');
  await phone.locator('textarea, input').last().fill('항공정비사가 되고 싶은데 고등학교 때 뭘 준비하면 좋을까요?');
  await phone.locator('form button.btn-primary').last().click();
  await sleep(12_000);
  await shot(phone, 'AI 진로 코치 — 단계별 로드맵 상담');
  await close();

  await open('vibe-lv3');
  await sleep(1500);
  await phone.locator('button:has(img)').first().click().catch(() => {});
  await phone.locator('textarea').last().pressSequentially(' 그리고 아래에 고등학교 · 졸업 후 · 5년 뒤 로드맵을 카드 3개로 보여줘', { delay: 15 });
  await shot(phone, 'Lv.3 — 내가 만든 배지를 눌러 요청에 넣기');
  await vibeBuild(await phone.locator('textarea').last().inputValue(), 'Lv.3 진로 포트폴리오');
  await close();

  // 갤러리
  const gal = await insCtx.newPage();
  await gal.setViewportSize({ width: 1600, height: 900 });
  await gal.goto(`${WEB}/gallery/${cr.classroomId}?secret=${cr.instructorSecret}`);
  await sleep(5000);
  await shot(gal, '💻 앱 갤러리 — 학생 작품을 프로젝터에 모아 보기');
  await gal.locator('button.group').first().click();
  await sleep(3500);
  await shot(gal, '앱 갤러리 — 한 작품 크게 띄우기');

  await quiz('quiz-final', 2);
  await sleep(1500);
  await shot(proj, '종합 퀴즈 대회 — 리더보드');
  await close();
  await goto(deck.slides.length - 1); await sleep(1500);
  await shot(proj, '특강 종료');
} catch (e) {
  console.error('SCENE FAIL', scene, e);
  await shot(phone, `오류 시점 (${scene})`).catch(() => {});
}

await phoneCtx.close();
await projCtx.close();
await insCtx.close();
await browser.close();
writeFileSync(`${OUT}/shots.json`, JSON.stringify(log, null, 2));
bots.forEach(({ s }) => s.close());
ctrl.close();
console.log('done', log.length, 'shots');
process.exit(0);
