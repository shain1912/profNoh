// Phase 2 영속화 — 강사 UI 재접속(1탭 복귀) 브라우저 검증
//   /teach 로그인 → 강의실 시작 → "새 강의실" 로 선택 화면 복귀 → 🔁 진행 중인 강의실 목록에 같은 코드 →
//   "이어서 진행" 1탭 → 콘솔에 같은 코드·연결 → 새로고침해도 목록 유지 → "종료" 하면 목록에서 사라짐
//   사용: node verify-persist-ui.mjs [UI=http://localhost:5178] [API=http://localhost:8792]  (서버 DEV_LOGIN=1 + dev DB)
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5178';
const API = process.argv[3] || 'http://localhost:8792';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tp = await ctx.newPage();
  const errors = [];
  tp.on('pageerror', (e) => errors.push(String(e)));

  await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
  const dl = await tp.evaluate(async () => {
    const r = await fetch('/api/auth/dev-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ email: 'persist-ui@test.dev', name: '재접속 강사' }),
    });
    return r.status;
  });
  check('dev-login (DEV_LOGIN=1 필요)', dl === 200, `status=${dl}`);

  // 이전 실행이 남긴 진행 중 강의실은 전부 종료해 깨끗한 상태에서 시작
  await tp.evaluate(async () => {
    const r = await fetch('/api/classrooms/mine', { credentials: 'include' });
    const j = await r.json();
    for (const c of j.classrooms ?? []) await fetch(`/api/classrooms/${c.classroomId}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
  });

  await tp.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
  check('시작 화면: 진행 중 강의실 없음 → 섹션 숨김', (await tp.getByTestId('ongoing-classrooms').count()) === 0);

  await tp.getByRole('button', { name: /기본 샘플 강의/ }).click();
  await tp.getByTestId('anon-policy-chip').waitFor({ timeout: 15000 });
  await tp.getByText('● 연결').waitFor({ timeout: 10000 });
  const code = (await tp.locator('header button.text-2xl').first().innerText()).trim();
  check('강의실 시작 → 콘솔 코드 표시', /^[A-Z0-9]{6}$/.test(code), code);
  // 슬라이드를 2장 넘겨 두면 복귀 후 같은 위치인지 확인할 수 있다
  // 연타하면 두 번째 키가 갱신 전 slideIndex 로 계산돼 같은 슬라이드로 가므로 서버 반영을 기다린 뒤 누른다
  await tp.keyboard.press('ArrowRight');
  await tp.waitForTimeout(500);
  await tp.keyboard.press('ArrowRight');
  await tp.waitForTimeout(600);

  // "새 강의실" = 선택 화면으로 복귀 (강의실은 살아 있음)
  await tp.getByRole('button', { name: '새 강의실', exact: true }).click();
  await tp.getByTestId('ongoing-classrooms').waitFor({ timeout: 10000 });
  check('선택 화면에 🔁 진행 중인 강의실 섹션', await tp.getByTestId('ongoing-classrooms').isVisible());
  check('목록에 방금 강의실 코드', await tp.getByTestId(`ongoing-${code}`).isVisible());
  const meta = await tp.getByTestId(`ongoing-${code}`).innerText();
  check('목록 메타에 슬라이드 3 (진행 위치 유지)', /슬라이드 3/.test(meta), meta.replace(/\n/g, ' '));

  // 새로고침해도(자격 미저장) 로그인 계정 귀속으로 목록이 다시 뜬다
  await tp.reload({ waitUntil: 'networkidle' });
  await tp.getByTestId('ongoing-classrooms').waitFor({ timeout: 10000 });
  check('새로고침 후에도 목록 유지', await tp.getByTestId(`ongoing-${code}`).isVisible());

  // 1탭 복귀
  await tp.getByTestId(`resume-${code}`).click();
  await tp.getByTestId('anon-policy-chip').waitFor({ timeout: 15000 });
  await tp.getByText('● 연결').waitFor({ timeout: 10000 });
  const code2 = (await tp.locator('header button.text-2xl').first().innerText()).trim();
  check('"이어서 진행" 1탭 → 같은 코드로 콘솔 복귀', code2 === code, `${code} → ${code2}`);
  const mineAfter = await tp.evaluate(async () => (await (await fetch('/api/classrooms/mine', { credentials: 'include' })).json()).classrooms);
  const row = (mineAfter ?? []).find((c) => c.token === code);
  check('복귀한 강의실의 서버 슬라이드 = 2(0-base) · 강사 접속 유지', row?.currentSlide === 2 && row?.status === 'live', JSON.stringify(row));

  // 종료 → 목록에서 제거 + 참가자 입장 화면엔 없음
  await tp.getByRole('button', { name: '새 강의실', exact: true }).click();
  await tp.getByTestId(`end-${code}`).waitFor({ timeout: 10000 });
  await tp.getByTestId(`end-${code}`).click();
  await tp.waitForTimeout(800);
  check('"종료" 후 목록에서 제거', (await tp.getByTestId(`ongoing-${code}`).count()) === 0);
  const info = await (await fetch(`${API}/api/classrooms/${code}`)).json();
  check('종료된 코드는 입장 화면에 없음(exists=false)', info.exists === false, JSON.stringify(info));

  check('브라우저 pageerror 없음', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('예외 없이 완료', false, e?.stack ?? String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? '🎉' : '💥'} ${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length === 0 ? 0 : 1);
