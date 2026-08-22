import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errs = [];
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on('pageerror', (e) => errs.push('' + e.message));

await p.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
// 로그인 필수화: dev-login으로 강사 세션 확보 후 재진입
// 무료 플랜 덱 3개 제한이 생겨 매 실행마다 새 계정 사용
await p.evaluate(async () => {
  await fetch('/api/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `verify-aiwizard-${Date.now()}@test.local`, name: 'AI마법사검증' }),
  });
});
await p.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
await p.getByText('생성형 AI 입문', { exact: true }).click();
await p.getByRole('button', { name: '다음 ▶' }).click();
await sleep(300);
await p.getByText('✨ 강의 만들기').click();
console.log('생성 시작, 대기…');
await p.waitForURL('**/build/**', { timeout: 60000 }).catch(() => {});
await sleep(1500);
const url = p.url();
const slideBtns = await p.locator('aside button').count();
console.log('편집기 URL:', /\/build\/[A-Z0-9]{4,}/.test(url), '| 페이지 버튼 수:', slideBtns);
await p.screenshot({ path: 'shots/aiwizard.png' });
console.log('ERRORS', errs.length); errs.slice(0, 8).forEach((e) => console.log(e));
await browser.close();
process.exit(0);
