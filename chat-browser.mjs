import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://168.107.44.248';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

// 강사
const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const tp = await tctx.newPage();
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.getByText('새 강의실 만들기').click();
await sleep(2500);
const token = JSON.parse(await tp.evaluate(() => localStorage.getItem('axedu_instructor'))).token;
console.log('token', token);

// 학생 입장
const sctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const sp = await sctx.newPage();
sp.on('pageerror', (e) => console.log('STUDENT pageerror:', e.message));
await sp.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
await sp.locator('input').nth(1).fill('채팅봇');
await sp.getByText('입장하기').click();
await sp.waitForURL('**/play**');
await sleep(1200);

// 강사: 채팅 슬라이드(인덱스7)로 이동 후 활동 열기
for (let i = 0; i < 7; i++) { await tp.getByRole('button', { name: '다음' }).click(); await sleep(400); }
await sleep(500);
const openBtn = tp.getByRole('button', { name: '활동 열기' });
if (await openBtn.count()) await openBtn.first().click();
await sleep(1500);
console.log('teacher slide:', (await tp.locator('h1').first().textContent().catch(() => '')).trim());

// 학생: 채팅 입력 → 전송 → 응답 대기
const input = sp.locator('input').first();
await input.fill('한 문장으로 인사해줘');
await sp.getByRole('button', { name: '보내기' }).click();
console.log('waiting for AI reply...');
// assistant 말풍선이 나타날 때까지 대기 (최대 30s)
let reply = '';
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  const bubbles = await sp.locator('.bg-white\\/10').allTextContents().catch(() => []);
  const cand = bubbles.find((t) => t && !t.includes('생각하는'));
  if (cand && cand.trim().length > 2) { reply = cand.trim(); break; }
}
console.log('AI REPLY:', reply || '(none)');
await sp.screenshot({ path: 'shots/12-student-chat.png' });
await browser.close();
console.log(reply ? 'CHAT OK' : 'CHAT FAIL');
process.exit(0);
