// 관리자(super_admin) API 검증 — verify-*.mjs 스타일 (서버만 필요, 브라우저 불필요)
// 사용법: node verify-admin.mjs [BASE]   (기본 http://localhost:8791)
const BASE = process.argv[2] || 'http://localhost:8791';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// 쿠키 유지 fetch 헬퍼
function client() {
  let cookie = '';
  return async (path, opts = {}) => {
    const r = await fetch(BASE + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
      redirect: 'manual',
    });
    const setCookie = r.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [kv] = c.split(';');
      if (kv.startsWith('axedu_sess=')) cookie = kv;
    }
    let body = null;
    try { body = await r.json(); } catch {}
    return { status: r.status, body };
  };
}

const ADMIN_EMAIL = 'admin@axedu.test'; // .env ADMIN_EMAILS 와 일치해야 함
const USER_EMAIL = 'verify-user@axedu.test';

console.log(`\n[verify-admin] BASE=${BASE}\n`);

// ── 1) 부트스트랩: ADMIN_EMAILS 이메일 로그인 → 자동 super_admin ──
console.log('1) ADMIN_EMAILS 부트스트랩');
const admin = client();
const a1 = await admin('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ email: ADMIN_EMAIL, name: '검증관리자' }) });
ok('dev-login 성공', a1.status === 200, `status=${a1.status}`);
ok('자동 super_admin 승격', a1.body?.user?.role === 'super_admin', `role=${a1.body?.user?.role}`);

// ── 2) 일반 사용자: teacher + 관리자 API 403 ──
console.log('2) 일반 사용자 접근 차단');
const user = client();
const u1 = await user('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ email: USER_EMAIL, name: '검증회원' }) });
ok('일반 dev-login 성공', u1.status === 200, `status=${u1.status}`);
ok('기본 role=teacher', u1.body?.user?.role === 'teacher', `role=${u1.body?.user?.role}`);
const userId = u1.body?.user?.id;
const u2 = await user('/api/admin/stats');
ok('teacher의 /api/admin/stats → 403', u2.status === 403, `status=${u2.status}`);
const anon = client();
const an1 = await anon('/api/admin/users');
ok('비로그인 /api/admin/users → 401', an1.status === 401, `status=${an1.status}`);

// ── 3) 통계 ──
console.log('3) 전체 통계');
const s = await admin('/api/admin/stats');
ok('stats 200', s.status === 200, `status=${s.status} ${JSON.stringify(s.body)}`);
ok('회원 수 ≥ 2', (s.body?.userCount ?? 0) >= 2, `userCount=${s.body?.userCount}`);
ok('deckCount 숫자', typeof s.body?.deckCount === 'number');
ok('최근 7일 가입 ≥ 1', (s.body?.signups7d ?? 0) >= 1, `signups7d=${s.body?.signups7d}`);
ok('최근 가입 목록 존재', Array.isArray(s.body?.recentUsers) && s.body.recentUsers.length > 0);

// ── 4) 회원 목록: 검색 + 페이지네이션 ──
console.log('4) 회원 목록 (검색·페이지네이션)');
const l1 = await admin('/api/admin/users?page=1&pageSize=2');
ok('목록 200', l1.status === 200, `status=${l1.status}`);
ok('pageSize 적용', (l1.body?.users?.length ?? 0) <= 2);
ok('total ≥ 2', (l1.body?.total ?? 0) >= 2, `total=${l1.body?.total}`);
const l2 = await admin(`/api/admin/users?search=${encodeURIComponent('verify-user')}`);
ok('검색 결과에 대상 포함', (l2.body?.users ?? []).some((u) => u.email === USER_EMAIL), JSON.stringify(l2.body?.users?.map((u) => u.email)));
const l3 = await admin(`/api/admin/users?search=${encodeURIComponent('없는사람zzz')}`);
ok('없는 검색어 → 0건', (l3.body?.total ?? -1) === 0, `total=${l3.body?.total}`);

// ── 5) 회원 상세 ──
console.log('5) 회원 상세');
const d1 = await admin(`/api/admin/users/${userId}`);
ok('상세 200', d1.status === 200, `status=${d1.status}`);
ok('덱 수 포함', typeof d1.body?.deckCount === 'number', JSON.stringify(d1.body));
ok('최근 로그인 포함', 'last_login_at' in (d1.body?.user ?? {}));

// ── 6) role 변경 ──
console.log('6) role 변경');
const r1 = await admin(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'org_admin' }) });
ok('teacher → org_admin', r1.status === 200 && r1.body?.user?.role === 'org_admin', `status=${r1.status} role=${r1.body?.user?.role}`);
const r2 = await admin(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'teacher' }) });
ok('org_admin → teacher 원복', r2.status === 200 && r2.body?.user?.role === 'teacher');
const r3 = await admin(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'hacker' }) });
ok('잘못된 role → 400', r3.status === 400, `status=${r3.status}`);
const meId = a1.body?.user?.id;
const r4 = await admin(`/api/admin/users/${meId}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'teacher' }) });
ok('자기 자신 관리자 해제 → 400', r4.status === 400, `status=${r4.status}`);

// ── 7) 활성/비활성 (is_active 컬럼 필요) ──
console.log('7) 계정 활성/비활성');
const t1 = await admin(`/api/admin/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
ok('비활성화 200', t1.status === 200 && t1.body?.user?.is_active === false, `status=${t1.status} ${JSON.stringify(t1.body)}`);
if (t1.status === 200) {
  const blockedLogin = client();
  const b1 = await blockedLogin('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ email: USER_EMAIL }) });
  ok('비활성 계정 로그인 → 403', b1.status === 403, `status=${b1.status}`);
  const t2 = await admin(`/api/admin/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
  ok('재활성화 200', t2.status === 200 && t2.body?.user?.is_active === true);
  const b2 = await blockedLogin('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ email: USER_EMAIL }) });
  ok('재활성 후 로그인 정상', b2.status === 200, `status=${b2.status}`);
}
const t3 = await admin(`/api/admin/users/${meId}/active`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) });
ok('자기 자신 비활성화 → 400', t3.status === 400, `status=${t3.status}`);
const t4 = await admin(`/api/admin/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ isActive: 'yes' }) });
ok('isActive 타입 오류 → 400', t4.status === 400, `status=${t4.status}`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
