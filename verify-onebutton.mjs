// 원버튼 진행 모드 검증: 강사가 "다음 단계" 버튼만 눌러 수업이 진행되는지 확인
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:8787';
const DIR = 'shots';
mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const watch = (p, who) => {
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${who}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
};

const browser = await chromium.launch();
const tp = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
watch(tp, 'teacher');
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
// 로그인 필수화: dev-login으로 강사 세션 확보 후 재진입
await tp.evaluate(async () => {
  await fetch('/api/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'verify-onebutton@test.local', name: '원버튼검증' }),
  });
});
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.getByText('시작 ▶').click();
await sleep(2500);
// 세션이 서버측으로 이동해 localStorage 대신 콘솔 헤더의 강의실 코드에서 토큰 추출
const token = (await tp.locator('#root').innerText()).match(/강의실 코드\s*\n?\s*([A-Z0-9]{4,8})/)[1];
console.log('TOKEN', token);

// 학생 2명
async function join(name) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  watch(p, name);
  await p.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
  await p.locator('input').nth(1).fill(name);
  await p.getByText('입장하기').click();
  await p.waitForURL('**/play**', { timeout: 8000 }).catch(() => {});
  await sleep(800);
  return p;
}
const [s1, s2] = await Promise.all([join('가나'), join('다라')]);

const btn = tp.getByTestId('next-step');
const btnText = async () => (await btn.textContent()).trim();
const studentSees = async (p) => ((await p.locator('#root').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 70));

// 원버튼만 눌러 25스텝 진행하며 활동/퀴즈가 자동으로 뜨는지 관찰
let openedActivities = 0, quizRan = false;
for (let i = 0; i < 25; i++) {
  const label = await btnText();
  if (/시작하기/.test(label)) openedActivities++;
  if (/정답 공개|문제 시작|다음 문제/.test(label)) quizRan = true;
  console.log(`step ${String(i).padStart(2)} | 버튼="${label}" | 학생="${await studentSees(s1)}"`);
  await btn.click();
  await sleep(/시작하기|정답 공개|문제 시작/.test(label) ? 1500 : 700);
}

await tp.screenshot({ path: `${DIR}/ob-teacher.png` });
await s1.screenshot({ path: `${DIR}/ob-student.png` });
console.log('\n활동 열림 횟수:', openedActivities, '| 퀴즈 진행:', quizRan);
console.log('===== ERRORS (' + errors.length + ') =====');
errors.slice(0, 20).forEach((e) => console.log(e));
await browser.close();
process.exit(0);
