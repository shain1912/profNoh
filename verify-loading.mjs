import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const tp = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.getByText('새 강의실 만들기').click(); await sleep(2500);
const token = JSON.parse(await tp.evaluate(() => localStorage.getItem('axedu_instructor'))).token;
const sp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
await sp.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
await sp.locator('input').nth(1).fill('그림'); await sp.getByText('입장하기').click();
await sp.waitForURL('**/play**'); await sleep(800);
// 원버튼만 눌러 학생 화면에 이미지 입력칸이 뜰 때까지 진행
const btn = tp.getByTestId('next-step');
const studentHasImageInput = async () =>
  (await sp.getByPlaceholder('그리고 싶은 장면을 글로 묘사해줘…').count()) > 0;
let g = 0;
while (g++ < 80 && !(await studentHasImageInput())) {
  const label = (await btn.textContent()).trim();
  await btn.click();
  await sleep(/시작하기|문제|정답/.test(label) ? 1200 : 450);
}
console.log('이미지 입력칸 도달:', await studentHasImageInput());
// 학생이 프롬프트 입력 후 만들기 → 로딩 표시 캡처
await sp.getByPlaceholder('그리고 싶은 장면을 글로 묘사해줘…').fill('노을 지는 바닷가, 파스텔');
await sp.getByRole('button', { name: '만들기' }).click();
await sleep(1500);
const hasBar = await sp.locator('.progress-indeterminate').count();
const txt = (await sp.locator('#root').innerText()).includes('그리는 중');
await sp.screenshot({ path: 'shots/loading-image.png' });
console.log('진행바 표시:', hasBar > 0, '| 안내문구:', txt);
await browser.close(); process.exit(0);
