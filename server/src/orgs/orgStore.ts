import { randomBytes } from 'node:crypto';
import { supabase, dbSafe } from '../db';
import type { UserRow } from '../auth/userStore';

/**
 * 기관(교육청/학교/기업) 저장소 — axedu_orgs / axedu_org_invites.
 * 이메일 도메인 화이트리스트 매칭으로 가입 시 org_id 자동 부여.
 */

export interface OrgRow {
  id: string;
  name: string;
  org_type: '교육청' | '학교' | '기업';
  allowed_domains: string[];
  seat_limit: number | null;
  contract_start: string | null;
  contract_end: string | null;
  created_at: string;
}

export interface OrgInviteRow {
  id: string;
  org_id: string;
  code: string;
  role: 'teacher' | 'org_admin';
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

/** 도메인 정규화: 소문자, 앞의 @ 제거, 공백 제거 */
export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^@/, '');
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return normalizeDomain(email.slice(at + 1));
}

/** 이메일 도메인이 allowed_domains에 포함된 org 조회 (없으면 null) */
export async function findOrgByEmailDomain(email: string): Promise<OrgRow | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  return dbSafe(async (sb) => {
    const r = await sb
      .from('axedu_orgs')
      .select('*')
      .contains('allowed_domains', [domain])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (r.error) throw r.error;
    return (r.data as OrgRow) ?? null;
  });
}

/**
 * 로그인/가입 시 org 자동 부여: org_id가 이미 있으면 유지, 없으면 도메인 매칭으로 부여.
 * 어떤 실패에도 로그인 흐름을 막지 않도록 원본 user를 그대로 반환한다.
 */
export async function ensureOrgAssignment(user: UserRow): Promise<UserRow> {
  if (!user || user.org_id || !supabase) return user;
  try {
    const org = await findOrgByEmailDomain(user.email);
    if (!org) return user;
    const upd = await supabase
      .from('axedu_users')
      .update({ org_id: org.id })
      .eq('id', user.id)
      .is('org_id', null) // 경합 시 기존 org 유지
      .select('*')
      .maybeSingle();
    if (upd.error) throw upd.error;
    return (upd.data as UserRow) ?? { ...user, org_id: org.id };
  } catch (e) {
    console.error('[orgs] org 자동 부여 실패:', (e as Error).message);
    return user;
  }
}

// ── org CRUD (super_admin) ──

export async function listOrgs(): Promise<OrgRow[] | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_orgs').select('*').order('created_at', { ascending: true });
    if (r.error) throw r.error;
    return r.data as OrgRow[];
  });
}

export async function getOrg(id: string): Promise<OrgRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_orgs').select('*').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as OrgRow) ?? null;
  });
}

export interface OrgInput {
  name: string;
  org_type: string;
  allowed_domains: string[];
  seat_limit: number | null;
  contract_start: string | null;
  contract_end: string | null;
}

export async function createOrg(input: OrgInput): Promise<OrgRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_orgs').insert(input).select('*').single();
    if (r.error) throw r.error;
    return r.data as OrgRow;
  });
}

export async function updateOrg(id: string, patch: Partial<OrgInput>): Promise<OrgRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_orgs').update(patch).eq('id', id).select('*').maybeSingle();
    if (r.error) throw r.error;
    return (r.data as OrgRow) ?? null;
  });
}

export async function deleteOrg(id: string): Promise<boolean> {
  const ok = await dbSafe(async (sb) => {
    // 소속 회원의 org_id 해제 후 삭제 (초대코드는 FK CASCADE)
    const un = await sb.from('axedu_users').update({ org_id: null }).eq('org_id', id);
    if (un.error) throw un.error;
    const r = await sb.from('axedu_orgs').delete().eq('id', id);
    if (r.error) throw r.error;
    return true;
  });
  return ok === true;
}

// ── 회원 조회 ──

export interface OrgMemberRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  provider: string;
  org_id: string | null;
}

export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[] | null> {
  return dbSafe(async (sb) => {
    const r = await sb
      .from('axedu_users')
      .select('id, email, name, role, provider, org_id')
      .eq('org_id', orgId)
      .order('email', { ascending: true });
    if (r.error) throw r.error;
    return r.data as OrgMemberRow[];
  });
}

// ── 초대코드 ──

function makeInviteCode(): string {
  // 사람이 입력하기 쉬운 8자리 (혼동 문자 제외)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export async function listInvites(orgId: string): Promise<OrgInviteRow[] | null> {
  return dbSafe(async (sb) => {
    const r = await sb
      .from('axedu_org_invites')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (r.error) throw r.error;
    return r.data as OrgInviteRow[];
  });
}

export async function createInvite(p: {
  orgId: string;
  role?: 'teacher' | 'org_admin';
  maxUses?: number | null;
  expiresAt?: string | null;
  createdBy: string;
}): Promise<OrgInviteRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb
      .from('axedu_org_invites')
      .insert({
        org_id: p.orgId,
        code: makeInviteCode(),
        role: p.role ?? 'teacher',
        max_uses: p.maxUses ?? null,
        expires_at: p.expiresAt ?? null,
        created_by: p.createdBy,
      })
      .select('*')
      .single();
    if (r.error) throw r.error;
    return r.data as OrgInviteRow;
  });
}

export async function deleteInvite(orgId: string, inviteId: string): Promise<boolean> {
  const ok = await dbSafe(async (sb) => {
    const r = await sb.from('axedu_org_invites').delete().eq('id', inviteId).eq('org_id', orgId);
    if (r.error) throw r.error;
    return true;
  });
  return ok === true;
}

/** 초대코드 사용: 검증 후 사용자에게 org_id(+필요 시 org_admin 역할) 부여 */
export async function redeemInvite(
  user: UserRow,
  code: string,
): Promise<{ ok: true; user: UserRow } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'DB 미설정' };
  const norm = code.trim().toUpperCase();
  const r = await supabase.from('axedu_org_invites').select('*').eq('code', norm).maybeSingle();
  if (r.error) return { ok: false, message: r.error.message };
  const inv = r.data as OrgInviteRow | null;
  if (!inv) return { ok: false, message: '유효하지 않은 초대코드입니다.' };
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())
    return { ok: false, message: '만료된 초대코드입니다.' };
  if (inv.max_uses !== null && inv.used_count >= inv.max_uses)
    return { ok: false, message: '사용 한도를 초과한 초대코드입니다.' };
  if (user.org_id && user.org_id !== inv.org_id)
    return { ok: false, message: '이미 다른 기관에 소속되어 있습니다.' };

  const patch: Record<string, unknown> = { org_id: inv.org_id };
  if (inv.role === 'org_admin' && user.role !== 'super_admin') patch.role = 'org_admin';
  const upd = await supabase.from('axedu_users').update(patch).eq('id', user.id).select('*').single();
  if (upd.error) return { ok: false, message: upd.error.message };

  const inc = await supabase
    .from('axedu_org_invites')
    .update({ used_count: inv.used_count + 1 })
    .eq('id', inv.id);
  if (inc.error) console.error('[orgs] 초대코드 사용 횟수 갱신 실패:', inc.error.message);

  return { ok: true, user: upd.data as UserRow };
}
