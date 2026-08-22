// DeckEditor 브라우저 검증 — 9종 활동을 ＋버튼으로 추가하고 타입별 편집 폼이 뜨는지 확인
// 사용법: 서버(8795)+클라(5181) 기동 후  node verify-parity-editor.mjs [http://localhost:5181]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5181';
mkdirSync('shots', { recursive: true });
const errors = [];
const results = [];
const check = (name, ok) => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// dev-login (쿠키 확보) 후 덱 생성
await page.goto(BASE + '/build');
const login = await page.evaluate(async () => {
  const r = await fetch('/api/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'parity-editor@test.local', name: '편집검증' }),
  });
  return r.ok;
});
check('브라우저 dev-login', login);
const made = await page.evaluate(async () => {
  const r = await fetch('/api/decks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '편집 폼 검증' }),
  });
  return r.json();
});
await page.evaluate(({ deckId, editPin }) => {
  localStorage.setItem('deckPins', JSON.stringify({ [deckId]: editPin }));
  const mine = JSON.parse(localStorage.getItem('axedu_my_decks') ?? '[]');
  localStorage.setItem('axedu_my_decks', JSON.stringify([{ deckId, title: '편집 폼 검증', pin: editPin }, ...mine]));
}, made);

await page.goto(`${BASE}/build/${made.deckId}`);
// PIN 프롬프트가 뜨면 직접 입력
const pinBox = page.locator('input.tracking-widest');
if (await pinBox.isVisible({ timeout: 3000 }).catch(() => false)) {
  await pinBox.fill(made.editPin);
  await page.getByText('열기').click();
}
await page.waitForSelector('text=수업 시작', { timeout: 10000 });

// 활동 추가 버튼 9종 → 클릭 → 편집 폼 헤더 확인
const CASES = [
  ['AI 대화', 'AI 시스템 프롬프트'],
  ['이미지 생성', '원클릭 예시 프롬프트'],
  ['비교 실습', '비교 유형'],
  ['퀴즈', '문제'],
  ['투표', '응답 방식'],
  ['역할극', '미션 키워드'],
  ['눈높이 비유', '페르소나 A'],
  ['문학 창작', '장르'],
  ['AI 튜터', '과목'],
];
for (const [label, formMarker] of CASES) {
  const btn = page.getByTitle(`${label} 추가`);
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) { check(`＋${label} 버튼`, false); continue; }
  await btn.click();
  await page.waitForTimeout(300);
  const formOk = await page.getByText(formMarker, { exact: false }).first().isVisible().catch(() => false);
  check(`＋${label} 추가 → 편집 폼 렌더`, formOk);
}
await page.screenshot({ path: 'shots/parity-editor.png', fullPage: false });

// 저장 → 재로드 후 활동 유지 확인
await page.getByText('저장', { exact: true }).click();
await page.waitForSelector('text=저장됨', { timeout: 8000 });
const saved = await page.evaluate(async ({ deckId, editPin }) => {
  const r = await fetch(`/api/decks/${deckId}/edit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editPin }),
  });
  const d = await r.json();
  return Object.values(d.deck.activities).map((a) => a.type).sort();
}, made);
const expected = ['analogy', 'chat', 'image', 'lab', 'poll', 'quiz', 'roleplay', 'tutor', 'writing'];
check('저장 후 9종 활동 유지', JSON.stringify(saved) === JSON.stringify(expected));
console.log('   저장된 타입:', saved.join(', '));

// 정리
await page.evaluate(async ({ deckId, editPin }) => {
  await fetch(`/api/decks/${deckId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editPin }) });
}, made);

console.log('\n콘솔 에러:', errors.length ? errors.slice(0, 5).join('\n') : '없음');
const fail = results.filter((r) => !r.ok);
console.log(`===== 결과: ${results.length - fail.length}/${results.length} 통과 =====`);
await browser.close();
process.exit(fail.length ? 1 : 0);
