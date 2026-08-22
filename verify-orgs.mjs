/**
 * TASK B 검증: 기관 관리 + 화이트리스트 도메인 API
 * 사용: node verify-orgs.mjs [BASE]  (기본 http://localhost:8792)
 * 필요: 서버 실행(DEV_LOGIN=1) + .env(SUPABASE 키 — 테스트 계정 역할 승격/정리용)
 */
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8792';

// .env 파싱 (dotenv 없이)
const envText = readFileSync(new URL('./.env', import.meta.url), 'utf8');
const ENV = Object.fromEntries(
  envText.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const SB = ENV.SUPABASE_URL;
const SB_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function sbRest(path, init) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${await r.text()}`);
  return r;
}

/** dev-login → { cookie, user } */
async function devLogin(email, name) {
  const r = await fetch(`${BASE}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });
  if (!r.ok) throw new Error(`dev-login ${email} ${r.status}: ${await r.text()}`);
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  const { user } = await r.json();
  return { cookie, user };
}

async function api(cookie, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function setRole(email, role) {
  await sbRest(`axedu_users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

const T = Date.now();
const SUPER = `vtest-super-${T}@orgtest.local`;
const DOMAIN = `vtest-orgb-${T}.kr`; // 런마다 고유 — 잔여 org와 충돌 방지
const AUTO = `vtest-auto-${T}@${DOMAIN}`; // 화이트리스트 도메인 자동 매칭 대상
const OUTSIDER = `vtest-out-${T}@gmail.example`; // 초대코드로 합류할 외부인
const testEmails = [SUPER, AUTO, OUTSIDER];

console.log(`\n🔎 기관 관리 API 검증 시작 — ${BASE}\n`);

// ── 0) super_admin 준비 ──
console.log('[0] super_admin 준비');
let superSess = await devLogin(SUPER, '검증최고관리자');
await setRole(SUPER, 'super_admin');
check('dev-login + super_admin 승격', !!superSess.cookie);

// ── 1) 권한 가드 ──
console.log('[1] 권한 가드');
{
  const anon = await api('', 'GET', '/api/orgs');
  check('비로그인 /api/orgs → 401', anon.status === 401, `(${anon.status})`);
  const teacher = await devLogin(OUTSIDER, '외부강사');
  const forb = await api(teacher.cookie, 'GET', '/api/orgs');
  check('teacher /api/orgs → 403', forb.status === 403, `(${forb.status})`);
  const noOrg = await api(teacher.cookie, 'GET', '/api/org/members');
  check('무소속 teacher /api/org/members → 403', noOrg.status === 403, `(${noOrg.status})`);
}

// ── 2) super_admin org CRUD ──
console.log('[2] super_admin: org CRUD');
let orgId;
{
  const created = await api(superSess.cookie, 'POST', '/api/orgs', {
    name: `검증기관-${T}`,
    orgType: '교육청',
    allowedDomains: [`@${DOMAIN}`, DOMAIN, 'DUP.example'],
    seatLimit: 50,
    contractStart: '2026-03-01',
    contractEnd: '2027-02-28',
  });
  orgId = created.data?.org?.id;
  check('org 생성(201)', created.status === 201 && !!orgId, JSON.stringify(created.data));
  check('도메인 정규화·중복 제거', JSON.stringify(created.data?.org?.allowed_domains?.sort()) === JSON.stringify([DOMAIN, 'dup.example'].sort()), JSON.stringify(created.data?.org?.allowed_domains));

  const list = await api(superSess.cookie, 'GET', '/api/orgs');
  check('org 목록에 포함', list.status === 200 && list.data.orgs?.some((o) => o.id === orgId));

  const upd = await api(superSess.cookie, 'PUT', `/api/orgs/${orgId}`, { seatLimit: 80 });
  check('org 수정(seat_limit=80)', upd.status === 200 && upd.data.org?.seat_limit === 80, JSON.stringify(upd.data));

  const bad = await api(superSess.cookie, 'POST', '/api/orgs', { name: 'x', orgType: '동아리' });
  check('잘못된 org_type → 400', bad.status === 400, `(${bad.status})`);
}

// ── 3) 도메인 매칭 자동 org 부여 ──
console.log('[3] 가입 시 도메인 매칭 자동 org_id 부여');
let autoSess;
{
  autoSess = await devLogin(AUTO, '자동매칭강사');
  const me = await api(autoSess.cookie, 'GET', '/api/auth/me');
  check('화이트리스트 도메인 신규 가입 → org_id 자동 부여', me.data.user?.orgId === orgId, JSON.stringify(me.data.user));

  // 재로그인해도 유지
  const again = await devLogin(AUTO, '자동매칭강사');
  const me2 = await api(again.cookie, 'GET', '/api/auth/me');
  check('재로그인 시 org 유지', me2.data.user?.orgId === orgId);
}

// ── 4) org_admin: 회원/도메인/초대코드 ──
console.log('[4] org_admin: 내 기관 관리');
let inviteCode;
{
  await setRole(AUTO, 'org_admin');
  const org = await api(autoSess.cookie, 'GET', '/api/org');
  check('내 기관 조회', org.status === 200 && org.data.org?.id === orgId, JSON.stringify(org.data));

  const members = await api(autoSess.cookie, 'GET', '/api/org/members');
  check('내 기관 회원 목록(자신 포함)', members.status === 200 && members.data.members?.some((m) => m.email === AUTO), JSON.stringify(members.data));

  const dom = await api(autoSess.cookie, 'PUT', '/api/org/domains', { domains: [DOMAIN, 'added.example'] });
  check('도메인 화이트리스트 수정', dom.status === 200 && dom.data.org?.allowed_domains?.includes('added.example'), JSON.stringify(dom.data));

  const inv = await api(autoSess.cookie, 'POST', '/api/org/invites', { role: 'teacher', maxUses: 2, expiresInDays: 7 });
  inviteCode = inv.data?.invite?.code;
  check('초대코드 발급(201, 8자리)', inv.status === 201 && /^[A-Z0-9]{8}$/.test(inviteCode ?? ''), JSON.stringify(inv.data));

  const invList = await api(autoSess.cookie, 'GET', '/api/org/invites');
  check('초대코드 목록', invList.status === 200 && invList.data.invites?.some((i) => i.code === inviteCode));
}

// ── 5) 초대코드 합류 ──
console.log('[5] 초대코드로 기관 합류');
{
  const outSess = await devLogin(OUTSIDER, '외부강사');
  const badJoin = await api(outSess.cookie, 'POST', '/api/org/join', { code: 'WRONG123' });
  check('잘못된 코드 → 400', badJoin.status === 400, `(${badJoin.status})`);

  const join = await api(outSess.cookie, 'POST', '/api/org/join', { code: inviteCode });
  check('초대코드 합류 → org_id 부여', join.status === 200 && join.data.user?.orgId === orgId, JSON.stringify(join.data));

  const invList = await api(autoSess.cookie, 'GET', '/api/org/invites');
  check('used_count 증가', invList.data.invites?.find((i) => i.code === inviteCode)?.used_count === 1);
}

// ── 6) super_admin 기관별 회원 조회 ──
console.log('[6] super_admin: 기관별 회원 조회');
{
  const r = await api(superSess.cookie, 'GET', `/api/orgs/${orgId}/members`);
  const emails = (r.data.members ?? []).map((m) => m.email);
  check('기관 회원 2명(자동매칭+초대합류)', r.status === 200 && emails.includes(AUTO) && emails.includes(OUTSIDER), JSON.stringify(emails));
}

// ── 7) org 삭제 + 정리 ──
console.log('[7] 삭제/정리');
{
  const del = await api(superSess.cookie, 'DELETE', `/api/orgs/${orgId}`);
  check('org 삭제', del.status === 200);
  const me = await api(autoSess.cookie, 'GET', '/api/auth/me');
  check('삭제 후 회원은 무소속', me.data.user?.orgId == null, JSON.stringify(me.data.user));
}
// 테스트 계정 정리 (dev DB 오염 방지)
for (const email of testEmails) {
  await sbRest(`axedu_users?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch((e) => console.warn('정리 실패:', e.message));
}

console.log(`\n결과: ✅ ${pass} / ❌ ${fail}\n`);
process.exit(fail ? 1 : 0);
