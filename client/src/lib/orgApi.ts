/** 기관 관리 API 클라이언트 — /api/orgs(super_admin), /api/org(org_admin) */

export interface Org {
  id: string;
  name: string;
  org_type: '교육청' | '학교' | '기업';
  allowed_domains: string[];
  seat_limit: number | null;
  contract_start: string | null;
  contract_end: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  provider: string;
}

export interface OrgInvite {
  id: string;
  code: string;
  role: 'teacher' | 'org_admin';
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_at: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? `요청 실패 (${r.status})`);
  return data as T;
}

// ── super_admin ──
export const listOrgs = () => call<{ orgs: Org[] }>('/api/orgs').then((d) => d.orgs);
export const createOrg = (body: Record<string, unknown>) =>
  call<{ org: Org }>('/api/orgs', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.org);
export const updateOrg = (id: string, body: Record<string, unknown>) =>
  call<{ org: Org }>(`/api/orgs/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((d) => d.org);
export const deleteOrg = (id: string) => call<{ ok: true }>(`/api/orgs/${id}`, { method: 'DELETE' });
export const listOrgMembersAdmin = (id: string) =>
  call<{ org: Org; members: OrgMember[] }>(`/api/orgs/${id}/members`);

// ── org_admin ──
export const fetchMyOrg = () => call<{ org: Org }>('/api/org').then((d) => d.org);
export const fetchMyOrgMembers = () => call<{ members: OrgMember[] }>('/api/org/members').then((d) => d.members);
export const saveMyOrgDomains = (domains: string[]) =>
  call<{ org: Org }>('/api/org/domains', { method: 'PUT', body: JSON.stringify({ domains }) }).then((d) => d.org);
export const listMyInvites = () => call<{ invites: OrgInvite[] }>('/api/org/invites').then((d) => d.invites);
export const createMyInvite = (body: { role?: string; maxUses?: number; expiresInDays?: number }) =>
  call<{ invite: OrgInvite }>('/api/org/invites', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.invite);
export const deleteMyInvite = (id: string) => call<{ ok: true }>(`/api/org/invites/${id}`, { method: 'DELETE' });

// ── 누구나(로그인) ──
export const joinWithCode = (code: string) =>
  call<{ user: { orgId: string } }>('/api/org/join', { method: 'POST', body: JSON.stringify({ code }) });
