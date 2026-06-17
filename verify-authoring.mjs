import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errs = [];
const tp = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
tp.on('pageerror', (e) => errs.push('teacher ' + e.message));

// 1) 덱 생성
await tp.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
await tp.getByText('또는 빈 강의로 직접 만들기').click();
await sleep(300);
await tp.locator('details input').first().fill('자동테스트 강의');
await tp.getByText('＋ 빈 강의 만들기').click();
await tp.waitForURL('**/build/**', { timeout: 8000 });
await sleep(800);

// 2) 퀴즈 페이지 추가 + 문제 작성
await tp.getByText('＋퀴즈').click(); await sleep(400);
const inputs = tp.locator('main input');
await inputs.nth(1).fill('1+1은?');
const optionInputs = tp.locator('main input[placeholder^="보기"]');
await optionInputs.nth(0).fill('2');
await optionInputs.nth(1).fill('3');
await tp.locator('main input[type=radio]').first().check();
await tp.getByText('저장', { exact: true }).click(); await sleep(800);
console.log('저장 상태 보임:', await tp.getByText('저장됨').count());

// 3) 이 덱으로 수업 시작
await tp.getByText('이 덱으로 수업 시작').click();
await tp.waitForURL('**/teach', { timeout: 8000 });
await sleep(1500);
const token = JSON.parse(await tp.evaluate(() => localStorage.getItem('axedu_instructor'))).token;
console.log('TOKEN', token);

// 4) 학생 입장 + 동기화
const sp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
sp.on('pageerror', (e) => errs.push('student ' + e.message));
await sp.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
await sp.locator('input').nth(1).fill('학생'); await sp.getByText('입장하기').click();
await sp.waitForURL('**/play**', { timeout: 8000 }); await sleep(1000);

// 5) 강사 원버튼으로 퀴즈 슬라이드까지 진행 후 활동 열기
const btn = tp.getByTestId('next-step');
let opened = false;
for (let i = 0; i < 12; i++) {
  const label = (await btn.textContent()).trim();
  if (/시작하기/.test(label)) { await btn.click(); opened = true; await sleep(800); break; }
  await btn.click(); await sleep(400);
}
console.log('활동 열림:', opened);
const studentText = (await sp.locator('#root').innerText()).replace(/\n+/g, ' | ').slice(0, 80);
console.log('학생 화면:', studentText);

console.log('ERRORS', errs.length); errs.slice(0, 10).forEach((e) => console.log(e));
await browser.close();
process.exit(0);
