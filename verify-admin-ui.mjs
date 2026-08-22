// /admin UI 스모크 테스트 (임시) — super_admin 대시보드 렌더 + teacher 차단 화면
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8791';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errs = [];
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}`); };

// 1) 관리자 세션 → /admin 대시보드
const ctx1 = await browser.newContext();
await ctx1.request.post(`${BASE}/api/auth/dev-login`, { data: { email: 'admin@axedu.test', name: '검증관리자' } });
const p1 = await ctx1.newPage();
p1.on('pageerror', (e) => errs.push('admin ' + e.message));
await p1.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await sleep(1200);
ok('관리자 대시보드 렌더', (await p1.getByText('관리자 대시보드').count()) > 0);
ok('통계 카드(전체 회원)', (await p1.getByText('전체 회원').count()) > 0);
ok('회원 관리 테이블', (await p1.getByText('회원 관리').count()) > 0);

// 검색 동작
await p1.locator('input[placeholder="이메일/이름 검색"]').fill('verify-user');
await p1.getByText('검색', { exact: true }).click();
await sleep(800);
ok('검색 결과 표시', (await p1.getByText('verify-user@axedu.test').count()) > 0);

// 2) 일반 강사 세션 → 차단 화면
const ctx2 = await browser.newContext();
await ctx2.request.post(`${BASE}/api/auth/dev-login`, { data: { email: 'verify-user@axedu.test', name: '검증회원' } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errs.push('teacher ' + e.message));
await p2.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await sleep(1000);
ok('teacher 접근 차단 화면', (await p2.getByText('접근 권한이 없어요').count()) > 0);

ok('페이지 에러 없음', errs.length === 0);
if (errs.length) console.log(errs);
console.log(`\nUI 결과: ${pass} 통과 / ${fail} 실패`);
await browser.close();
process.exit(fail ? 1 : 0);
