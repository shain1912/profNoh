// 바이브코딩·이미지 저장·쿼터 검증 — 서버 기동 후: node verify-vibe.mjs http://localhost:8796
// gnaero 덱이 DB 에 있어야 한다 (npx tsx server/src/decks/seed.ts gyeongnamAviation3h <email>).
// 실제 AI 를 호출한다: 이미지 1장 + 앱 생성 3회.
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:8796';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
async function vibe(body) {
  const t0 = Date.now();
  const r = await fetch(BASE + '/api/ai/vibe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return { status: r.status, data: await r.json().catch(() => ({})) };
  const text = await r.text();
  const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const deltas = lines.filter((l) => l.t === 'd').length;
  return { status: r.status, deltas, last: lines.at(-1), ms: Date.now() - t0 };
}
const join = (token, nickname, sessionId) => new Promise((resolve) => {
  const s = io(BASE, { transports: ['websocket'] });
  s.on('connect', () => s.emit('student:join', { token, nickname, sessionId }));
  s.on('joined', () => resolve(s));
});

const cr = await api('POST', '/api/classrooms', { deckId: 'gnaero', mode: 'auditorium' });
check('강의실 생성 (gnaero, 강당)', cr.status === 200, cr.data.token);
const { token, classroomId, instructorSecret } = cr.data;
const deck = (await api('GET', '/api/decks/gnaero')).data;
const vibes = Object.values(deck.activities).filter((a) => a.type === 'vibe');
check('공개 덱: vibe 활동 3개', vibes.length === 3, vibes.map((v) => `${v.id}:${v.continueMode}`).join(', '));
const imgActs = Object.values(deck.activities).filter((a) => a.type === 'image');
check('공개 덱: image SVG 엔진·1인 3장', imgActs.length === 2 && imgActs.every((a) => a.engine === 'svg' && a.maxImages === 3));

const sA = 'sess-vA-' + Date.now();
const sB = 'sess-vB-' + Date.now();
const a = await join(token, '학생A', sA);
const b = await join(token, '학생B', sB);

// 1) 이미지 → 파일 저장 + 내 이미지 기록
const img = await api('POST', '/api/ai/image', { token, sessionId: sA, activityId: 'image-future-me', prompt: '항공 정비복을 입고 드론을 점검하는 학생, 밝은 격납고' });
check('이미지 생성 → /api/uploads URL', img.status === 200 && img.data.dataUrl?.startsWith('/api/uploads/gen-'), img.data.dataUrl ?? JSON.stringify(img.data));
if (img.data.dataUrl?.startsWith('/api/')) {
  const f = await fetch(BASE + img.data.dataUrl);
  check('저장된 이미지 서빙 (webp/svg)', f.status === 200 && /^image\/(webp|svg\+xml)/.test(f.headers.get('content-type') ?? ''), `${(await f.arrayBuffer()).byteLength} bytes`);
}

// 2) 새 앱 (Lv1)
const v1 = await vibe({ token, sessionId: sA, activityId: 'vibe-lv1', prompt: '비행기 부품 이름 맞히기 퀴즈 앱. 문제 3개, 맞히면 점수 올라가게' });
check('Lv1 앱 생성 (스트리밍 done)', v1.last?.t === 'done', `${v1.ms}ms, 조각 ${v1.deltas}개, ${JSON.stringify(v1.last).slice(0, 120)}`);
const app1 = v1.last?.appId;
if (app1) {
  const r = await fetch(`${BASE}/api/vibe/app/${app1}`);
  const html = await r.text();
  check('앱 서빙: text/html + CSP sandbox', r.status === 200 && r.headers.get('content-type')?.startsWith('text/html') && /sandbox allow-scripts/.test(r.headers.get('content-security-policy') ?? ''));
  check('앱 HTML 완결 (<!DOCTYPE … </html>)', /^<!DOCTYPE html/i.test(html) && html.trim().toLowerCase().endsWith('</html>'), `${html.length}자`);
}

// 3) 내 기록
const mine = await api('GET', `/api/vibe/mine?token=${token}&sessionId=${sA}&activityId=vibe-lv3`);
check('내 기록: 앱 1 + 이미지 1', mine.data.apps?.length === 1 && mine.data.images?.length === 1);

// 4) 남의 앱 이어서 고치기 금지
const steal = await vibe({ token, sessionId: sB, activityId: 'vibe-lv2', prompt: '배경을 파랗게', baseAppId: app1 });
check('다른 학생 앱 baseAppId → 403', steal.status === 403);

// 5) Lv3 이어서 + 내 이미지
const v3 = await vibe({ token, sessionId: sA, activityId: 'vibe-lv3', prompt: '내 그림 1번을 맨 위에 넣고, 아래에 "나의 항공 진로" 제목을 넣어줘', baseAppId: app1 });
check('Lv3 이어서 고치기 done', v3.last?.t === 'done', `${v3.ms}ms`);
if (v3.last?.appId) {
  const html = await (await fetch(`${BASE}/api/vibe/app/${v3.last.appId}`)).text();
  check('Lv3 앱에 내 이미지 경로 포함', html.includes(img.data.dataUrl ?? '__none__'));
}

// 6) 강사 갤러리
const gal = await api('GET', `/api/classrooms/${classroomId}/vibe-gallery?secret=${instructorSecret}`);
check('갤러리: 학생A 최신 앱, 버전 2', gal.data.apps?.length === 1 && gal.data.apps[0].versions === 2 && gal.data.apps[0].nickname === '학생A');
const galBad = await api('GET', `/api/classrooms/${classroomId}/vibe-gallery?secret=wrong`);
check('갤러리: 잘못된 secret → 403', galBad.status === 403);

// 7) 입력 검증
const empty = await vibe({ token, sessionId: sB, activityId: 'vibe-lv1', prompt: '  ' });
check('빈 요청 → 400', empty.status === 400);
const wrongAct = await vibe({ token, sessionId: sB, activityId: 'image-future-me', prompt: '앱' });
check('vibe 아닌 활동 → 400', wrongAct.status === 400);
const badId = await fetch(`${BASE}/api/vibe/app/../../.env`);
check('앱 경로 조작 → 4xx', badId.status >= 400);

console.log('GALLERY', classroomId, instructorSecret);
a.close(); b.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
