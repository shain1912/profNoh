import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://168.107.44.248';
const DIR = 'shots';
mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const watch = (p, who) => {
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${who}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
};
const now = () => Date.now();

const browser = await chromium.launch();
const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const tp = await tctx.newPage(); watch(tp, 'teacher');
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.getByText('새 강의실 만들기').click();
await sleep(2500);
const token = JSON.parse(await tp.evaluate(() => localStorage.getItem('axedu_instructor'))).token;
console.log('TOKEN', token);

const sctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const sp = await sctx.newPage(); watch(sp, 'student');
await sp.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
await sp.locator('input').nth(1).fill('테스터');
await sp.getByText('입장하기').click();
await sp.waitForURL('**/play**', { timeout: 8000 }).catch(() => {});
await sleep(1200);

const nextBtn = () => tp.getByRole('button', { name: '다음' });
const prevBtn = () => tp.getByRole('button', { name: '이전' });
const cur = async () => {
  const t = await tp.locator('text=/^\\s*\\d+ \\/ \\d+\\s*$/').first().textContent().catch(() => '1 / 35');
  return parseInt(t.trim().split('/')[0], 10) - 1;
};
async function gotoSlide(idx) {
  let guard = 0;
  while ((await cur()) < idx && guard++ < 80) { await nextBtn().click(); await sleep(120); }
  while ((await cur()) > idx && guard++ < 160) { await prevBtn().click(); await sleep(120); }
  await sleep(400);
  console.log(`  → 강사 슬라이드 도달: ${(await cur()) + 1}/35 (목표 ${idx + 1})`);
}

async function openActivity() {
  const b = tp.getByText('활동 열기');
  if (await b.count()) { await b.first().click(); await sleep(1200); return true; }
  return false;
}

const results = {};

// ---- POLL (slide 2, word cloud) ----
try {
  await gotoSlide(2);
  await openActivity();
  await sleep(800);
  const inp = sp.locator('input').first();
  await inp.fill('미래', { timeout: 4000 });
  await sp.getByText('제출').click({ timeout: 4000 });
  await sleep(1500);
  const done = await sp.getByText('참여 완료').count();
  await sp.screenshot({ path: `${DIR}/a1-poll-student.png` });
  await tp.screenshot({ path: `${DIR}/a1-poll-teacher.png` });
  results.poll = done ? 'OK (제출 반영)' : 'FAIL (제출 후 확인 안됨)';
} catch (e) { results.poll = 'FAIL ' + e.message.split('\n')[0]; }
console.log('POLL:', results.poll);
await tp.getByText('활동 닫기').click().catch(() => {});

// ---- LAB (slide 11, A/B) ----
try {
  await gotoSlide(11);
  await openActivity();
  await sleep(800);
  const inp = sp.locator('input').first();
  await inp.fill('피자', { timeout: 4000 });
  const t0 = now();
  await sp.getByText('실험').click({ timeout: 4000 });
  let ok = false;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const txt = await sp.locator('body').innerText();
    if (!txt.includes('결과가 여기에 나와요') && txt.includes('차이가 보이나요')) { ok = true; break; }
  }
  const dt = ((now() - t0) / 1000).toFixed(1);
  await sp.screenshot({ path: `${DIR}/a2-lab-student.png` });
  results.lab = ok ? `OK (${dt}s)` : `FAIL/timeout (${dt}s)`;
} catch (e) { results.lab = 'FAIL ' + e.message.split('\n')[0]; }
console.log('LAB:', results.lab);
await tp.getByText('활동 닫기').click().catch(() => {});

// ---- IMAGE (slide 16) ----
try {
  await gotoSlide(16);
  await openActivity();
  await sleep(800);
  const inp = sp.locator('input').first();
  await inp.fill('노을 지는 바닷가', { timeout: 4000 });
  const t0 = now();
  await sp.getByText('만들기').click({ timeout: 4000 });
  let ok = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (await sp.locator('figure img').count()) { ok = true; break; }
  }
  const dt = ((now() - t0) / 1000).toFixed(1);
  const demo = await sp.getByText('[데모]').count();
  await sp.screenshot({ path: `${DIR}/a3-image-student.png` });
  results.image = ok ? `OK (${dt}s)${demo ? ' [데모이미지]' : ''}` : `FAIL/timeout (${dt}s)`;
} catch (e) { results.image = 'FAIL ' + e.message.split('\n')[0]; }
console.log('IMAGE:', results.image);

console.log('\n===== RESULTS =====');
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(7), v);
console.log('\n===== ERRORS (' + errors.length + ') =====');
errors.slice(0, 30).forEach((e) => console.log(e));
await browser.close();
process.exit(0);
