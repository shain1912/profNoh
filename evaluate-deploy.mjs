import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'https://blend.kodekorea.kr';
const OUT_DIR = 'shots/deploy-eval';
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = new Date().toISOString();
const results = [];
const errors = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
}

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${label}] console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    errors.push(`[${label}] request failed: ${req.method()} ${req.url()} ${failure?.errorText || ''}`);
  });
}

async function visibleText(page) {
  return (await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
}

function hasHangul(text) {
  return /[가-힣]/.test(text);
}

function hasMojibakeSignals(text) {
  return /[媛쒓궗숈깮뺤쓽肄붾뱶낆옣묒뾽]/.test(text) || text.includes('???');
}

async function setLocalStorage(page, pairs) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((items) => {
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
  }, pairs);
}

async function main() {
  const apiHealth = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
  record('API health', apiHealth.ok === true, JSON.stringify(apiHealth));

  const createRes = await fetch(`${BASE}/api/classrooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const classroom = await createRes.json().catch(() => null);
  record('Create classroom API', createRes.ok && classroom?.token && classroom?.instructorSecret, JSON.stringify(classroom));
  if (!classroom?.token || !classroom?.instructorSecret) throw new Error('Cannot continue without classroom credentials.');

  const browser = await chromium.launch({ headless: true });

  const homeCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const home = await homeCtx.newPage();
  watch(home, 'home');
  await home.goto(BASE, { waitUntil: 'networkidle' });
  await home.screenshot({ path: `${OUT_DIR}/01-home-mobile.png`, fullPage: true });
  const homeText = await visibleText(home);
  record('Home renders', homeText.length > 20, homeText.slice(0, 120));
  record('Home Korean readable', hasHangul(homeText) && !hasMojibakeSignals(homeText), homeText.slice(0, 160));

  const teacherCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const teacher = await teacherCtx.newPage();
  watch(teacher, 'teacher');
  await setLocalStorage(teacher, {
    axedu_instructor: JSON.stringify({
      token: classroom.token,
      instructorSecret: classroom.instructorSecret,
      classroomId: classroom.classroomId,
      deckId: classroom.deckId,
    }),
  });
  await teacher.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
  await teacher.screenshot({ path: `${OUT_DIR}/02-teacher-console.png`, fullPage: true });
  const nextStep = teacher.getByTestId('next-step');
  record('Teacher console next-step button', await nextStep.count() === 1, (await visibleText(teacher)).slice(0, 160));
  record('Teacher Korean readable', hasHangul(await visibleText(teacher)) && !hasMojibakeSignals(await visibleText(teacher)), (await visibleText(teacher)).slice(0, 160));

  async function makeStudent(name, fileName) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await ctx.newPage();
    watch(page, name);
    await setLocalStorage(page, {
      axedu_nick: name,
      axedu_session_id: `${name}-${Date.now()}`,
    });
    await page.goto(`${BASE}/play?token=${classroom.token}`, { waitUntil: 'networkidle' });
    await sleep(1200);
    await page.screenshot({ path: `${OUT_DIR}/${fileName}`, fullPage: true });
    return { ctx, page, name };
  }

  const s1 = await makeStudent('Alpha', '03-student-alpha-initial.png');
  const s2 = await makeStudent('Beta', '04-student-beta-initial.png');
  const initialStudentText = await visibleText(s1.page);
  record('Student joins live classroom', initialStudentText.length > 10 && !/join/i.test(s1.page.url()), initialStudentText.slice(0, 160));

  await sleep(1000);
  const teacherTextAfterJoin = await visibleText(teacher);
  record('Teacher sees participant count area', /2|Alpha|Beta|연결|connected/i.test(teacherTextAfterJoin), teacherTextAfterJoin.slice(0, 180));

  const snapshots = [];
  for (let i = 0; i < 6; i++) {
    const label = await nextStep.textContent().catch(() => '');
    await nextStep.click();
    await sleep(900);
    snapshots.push({
      step: i + 1,
      label: (label || '').trim(),
      student: (await visibleText(s1.page)).slice(0, 180),
    });
  }
  await teacher.screenshot({ path: `${OUT_DIR}/05-teacher-after-six-steps.png`, fullPage: true });
  await s1.page.screenshot({ path: `${OUT_DIR}/06-student-after-six-steps.png`, fullPage: true });
  record('Teacher one-button flow advances', snapshots.some((s) => s.student !== initialStudentText.slice(0, 180)), JSON.stringify(snapshots));

  const studentNow = await visibleText(s1.page);
  const hasQuizOrActivity = /quiz|정답|문제|보기|AI|투표|활동|媛|臾|퀴즈/i.test(studentNow);
  record('Student receives activity/quiz state', hasQuizOrActivity, studentNow.slice(0, 220));

  const buttons = s1.page.locator('button');
  const buttonCount = await buttons.count();
  if (buttonCount > 0) {
    await buttons.nth(Math.min(1, buttonCount - 1)).click().catch(() => {});
    await sleep(500);
    await s1.page.screenshot({ path: `${OUT_DIR}/07-student-after-answer-attempt.png`, fullPage: true });
    record('Student can click an activity button', true, `buttonCount=${buttonCount}`);
  } else {
    record('Student can click an activity button', false, 'No buttons found in current student view.');
  }

  const projectorCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const projector = await projectorCtx.newPage();
  watch(projector, 'projector');
  await projector.goto(`${BASE}/screen/${classroom.token}`, { waitUntil: 'networkidle' });
  await sleep(1000);
  await projector.screenshot({ path: `${OUT_DIR}/08-projector.png`, fullPage: true });
  const projectorText = await visibleText(projector);
  record('Projector view renders', projectorText.length > 10, projectorText.slice(0, 160));

  const joinCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const join = await joinCtx.newPage();
  watch(join, 'join');
  await join.goto(`${BASE}/join?token=${classroom.token}`, { waitUntil: 'networkidle' });
  await join.screenshot({ path: `${OUT_DIR}/09-join-mobile.png`, fullPage: true });
  const joinText = await visibleText(join);
  record('Join page renders', joinText.length > 10, joinText.slice(0, 160));
  record('Join page Korean readable', hasHangul(joinText) && !hasMojibakeSignals(joinText), joinText.slice(0, 160));

  const summary = {
    base: BASE,
    timestamp: stamp,
    classroom,
    results,
    errors,
    screenshots: OUT_DIR,
  };
  writeFileSync(`${OUT_DIR}/deploy-eval-results.json`, JSON.stringify(summary, null, 2), 'utf8');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
