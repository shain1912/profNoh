import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const DIR = 'shots';
mkdirSync(DIR, { recursive: true });

const errors = [];
function watch(page, who) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${who}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function head(page) {
  try {
    const h1 = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => null);
    const h2 = await page.locator('h2').first().textContent({ timeout: 800 }).catch(() => null);
    return (h1 || h2 || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  } catch { return '(none)'; }
}

const browser = await chromium.launch();
const log = (...a) => console.log(...a);

// ───────── 강사 ─────────
const teacher = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const tp = await teacher.newPage(); watch(tp, 'teacher');
await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
await tp.getByText('새 강의실 만들기').click();
await sleep(2500);
const creds = JSON.parse(await tp.evaluate(() => localStorage.getItem('axedu_instructor')));
const token = creds.token;
log('TOKEN =', token);
await tp.screenshot({ path: `${DIR}/01-teacher-console.png` });

// ───────── 학생 2명 동시 입장 ─────────
async function joinStudent(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage(); watch(p, name);
  await p.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
  await p.locator('input').nth(1).fill(name);
  await p.getByText('입장하기').click();
  await p.waitForURL('**/play**', { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  return { ctx, p, name };
}
log('--- 동시 입장 (S1,S2) ---');
const [s1, s2] = await Promise.all([joinStudent('가나'), joinStudent('다라')]);
await s1.p.screenshot({ path: `${DIR}/02-student1.png` });
await s2.p.screenshot({ path: `${DIR}/03-student2.png` });
log('S1 sees:', await head(s1.p), '| S2 sees:', await head(s2.p));

// ───────── 내용(불릿) 슬라이드 캡처 후 원위치 ─────────
await tp.getByText('다음').click(); await sleep(800);
await s1.p.screenshot({ path: `${DIR}/03b-student1-content.png` });
log('content slide S1:', await head(s1.p));
await tp.getByText('이전').click(); await sleep(800);

// ───────── 슬라이드 동기화 (강사가 2번 넘김) ─────────
log('--- 슬라이드 넘김 x2 ---');
await tp.getByText('다음').click(); await sleep(900);
await tp.getByText('다음').click(); await sleep(900);
log('teacher:', await head(tp), '| S1:', await head(s1.p), '| S2:', await head(s2.p));
await s1.p.screenshot({ path: `${DIR}/04-student1-after-2slides.png` });

// ───────── 시차 입장 (S3 늦게) ─────────
log('--- 늦게 입장 S3 ---');
const s3 = await joinStudent('마바');
await sleep(1200);
log('S3(late) sees:', await head(s3.p), '(강사와 같아야 함)');
await s3.p.screenshot({ path: `${DIR}/05-student3-late-join.png` });

// ───────── 퀴즈 슬라이드로 이동 + 진행 ─────────
log('--- 퀴즈 진행 ---');
// 워밍업 퀴즈 슬라이드(인덱스3)까지 이동: 현재 인덱스2 → 다음 1번
await tp.getByText('다음').click(); await sleep(900);
const openBtn = tp.getByText('활동 열기');
if (await openBtn.count()) { await openBtn.first().click(); await sleep(1000); }
await tp.screenshot({ path: `${DIR}/06-teacher-quiz-open.png` });
const startBtn = tp.getByText('문제 시작');
if (await startBtn.count()) { await startBtn.first().click(); await sleep(1200); }
await s1.p.screenshot({ path: `${DIR}/07-student1-quiz-question.png` });
log('S1 quiz view:', await head(s1.p));
// 학생들 답 선택 (첫 보기 버튼)
for (const s of [s1, s2, s3]) {
  const btns = s.p.locator('button');
  const n = await btns.count();
  // 보기 버튼은 보통 텍스트가 긴 큰 버튼 → 마지막 쪽. 안전하게 2번째 버튼 클릭 시도
  if (n > 1) { await btns.nth(1).click().catch(() => {}); }
  await sleep(200);
}
await sleep(800);
await s1.p.screenshot({ path: `${DIR}/08-student1-answered.png` });
const revealBtn = tp.getByText('정답 공개');
if (await revealBtn.count()) { await revealBtn.first().click(); await sleep(1200); }
await tp.screenshot({ path: `${DIR}/09-teacher-after-reveal.png` });
await s1.p.screenshot({ path: `${DIR}/10-student1-reveal.png` });

// ───────── 프로젝터 ─────────
const proj = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const pp = await proj.newPage(); watch(pp, 'projector');
await pp.goto(`${BASE}/screen/${token}`, { waitUntil: 'networkidle' });
await sleep(1500);
await pp.screenshot({ path: `${DIR}/11-projector.png` });
log('projector sees:', await head(pp));

// ───────── 콘솔/페이지 에러 요약 ─────────
log('\n===== CONSOLE / PAGE ERRORS (' + errors.length + ') =====');
for (const e of errors.slice(0, 40)) log(e);

await browser.close();
log('\nDONE. screenshots in ./shots');
process.exit(0);
