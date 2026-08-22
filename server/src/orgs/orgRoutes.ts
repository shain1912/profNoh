import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSessionUser } from '../auth/session';
import type { UserRow } from '../auth/userStore';
import {
  listOrgs,
  getOrg,
  createOrg,
  updateOrg,
  deleteOrg,
  listOrgMembers,
  listInvites,
  createInvite,
  deleteInvite,
  redeemInvite,
  normalizeDomain,
  type OrgInput,
} from './orgStore';

/**
 * 기관 관리 API.
 * - /api/orgs/*  : super_admin 전용 — org CRUD + 기관별 회원 조회
 * - /api/org/*   : org_admin 전용 — 내 기관 회원/도메인/초대코드 관리
 * - /api/org/join: 로그인 사용자 누구나 — 초대코드로 기관 합류
 */

async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | null> {
  const user = await getSessionUser(req);
  if (!user) {
    reply.code(401).send({ error: 'unauthorized', message: '로그인이 필요합니다.' });
    return null;
  }
  return user;
}

async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (user.role !== 'super_admin') {
    reply.code(403).send({ error: 'forbidden', message: '최고 관리자 권한이 필요합니다.' });
    return null;
  }
  return user;
}

/** org_admin(자기 기관) 또는 super_admin. 반환값에 대상 orgId 포함. */
async function requireOrgAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ user: UserRow; orgId: string } | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (user.role !== 'org_admin' && user.role !== 'super_admin') {
    reply.code(403).send({ error: 'forbidden', message: '기관 관리자 권한이 필요합니다.' });
    return null;
  }
  if (!user.org_id) {
    reply.code(400).send({ error: 'no_org', message: '소속된 기관이 없습니다.' });
    return null;
  }
  return { user, orgId: user.org_id };
}

const ORG_TYPES = ['교육청', '학교', '기업'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badId(id: string, reply: FastifyReply): boolean {
  if (UUID_RE.test(id)) return false;
  reply.code(404).send({ error: 'notfound', message: '기관을 찾을 수 없습니다.' });
  return true;
}

function parseOrgBody(body: Record<string, unknown>, partial = false): Partial<OrgInput> | { error: string } {
  const out: Partial<OrgInput> = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: '기관명이 필요합니다.' };
    out.name = name;
  }
  if (body.orgType !== undefined || !partial) {
    const t = String(body.orgType ?? '학교');
    if (!ORG_TYPES.includes(t)) return { error: `org_type은 ${ORG_TYPES.join('/')} 중 하나여야 합니다.` };
    out.org_type = t;
  }
  if (body.allowedDomains !== undefined) {
    if (!Array.isArray(body.allowedDomains)) return { error: 'allowedDomains는 배열이어야 합니다.' };
    out.allowed_domains = [...new Set(body.allowedDomains.map((d) => normalizeDomain(String(d))).filter(Boolean))];
  } else if (!partial) {
    out.allowed_domains = [];
  }
  if (body.seatLimit !== undefined) out.seat_limit = body.seatLimit === null ? null : Number(body.seatLimit);
  if (body.contractStart !== undefined) out.contract_start = body.contractStart ? String(body.contractStart) : null;
  if (body.contractEnd !== undefined) out.contract_end = body.contractEnd ? String(body.contractEnd) : null;
  return out;
}

export async function registerOrgRoutes(app: FastifyInstance) {
  // ── super_admin: org CRUD ──

  app.get('/api/orgs', async (req, reply) => {
    if (!(await requireSuperAdmin(req, reply))) return;
    const orgs = await listOrgs();
    if (!orgs) return reply.code(503).send({ error: 'db', message: 'DB 조회 실패' });
    return { orgs };
  });

  app.post('/api/orgs', async (req, reply) => {
    if (!(await requireSuperAdmin(req, reply))) return;
    const parsed = parseOrgBody((req.body ?? {}) as Record<string, unknown>);
    if ('error' in parsed) return reply.code(400).send({ error: 'bad', message: parsed.error });
    const org = await createOrg(parsed as OrgInput);
    if (!org) return reply.code(503).send({ error: 'db', message: '기관 생성 실패' });
    return reply.code(201).send({ org });
  });

  app.put('/api/orgs/:id', async (req, reply) => {
    if (!(await requireSuperAdmin(req, reply))) return;
    const { id } = req.params as { id: string };
    if (badId(id, reply)) return;
    const parsed = parseOrgBody((req.body ?? {}) as Record<string, unknown>, true);
    if ('error' in parsed) return reply.code(400).send({ error: 'bad', message: parsed.error });
    const org = await updateOrg(id, parsed);
    if (!org) return reply.code(404).send({ error: 'notfound', message: '기관을 찾을 수 없습니다.' });
    return { org };
  });

  app.delete('/api/orgs/:id', async (req, reply) => {
    if (!(await requireSuperAdmin(req, reply))) return;
    const { id } = req.params as { id: string };
    if (badId(id, reply)) return;
    const ok = await deleteOrg(id);
    if (!ok) return reply.code(503).send({ error: 'db', message: '기관 삭제 실패' });
    return { ok: true };
  });

  app.get('/api/orgs/:id/members', async (req, reply) => {
    if (!(await requireSuperAdmin(req, reply))) return;
    const { id } = req.params as { id: string };
    if (badId(id, reply)) return;
    const org = await getOrg(id);
    if (!org) return reply.code(404).send({ error: 'notfound', message: '기관을 찾을 수 없습니다.' });
    const members = await listOrgMembers(id);
    if (!members) return reply.code(503).send({ error: 'db', message: 'DB 조회 실패' });
    return { org, members };
  });

  // ── org_admin: 내 기관 ──

  app.get('/api/org', async (req, reply) => {
    const ctx = await requireOrgAdmin(req, reply);
    if (!ctx) return;
    const org = await getOrg(ctx.orgId);
    if (!org) return reply.code(404).send({ error: 'notfound', message: '기관을 찾을 수 없습니다.' });
    return { org };
  });

  app.get('/api/org/members', async (req, reply) => {
    const ctx = await requireOrgAdmin(req, reply);
    if (!ctx) return;
    const members = await listOrgMembers(ctx.orgId);
    if (!members) return reply.code(503).send({ error: 'db', message: 'DB 조회 실패' });
    return { members };
  });

  // 화이트리스트 도메인 관리 (전체 치환)
  app.put('/api/org/domains', async (req, reply) => {
    const ctx = await requireOrgAdmin(req, reply);
    if (!ctx) return;
    const body = (req.body ?? {}) as { domains?: unknown };
    if (!Array.isArray(body.domains))
      return reply.code(400).send({ error: 'bad', message: 'domains 배열이 필요합니다.' });
    const domains = [...new Set(body.domains.map((d) => normalizeDomain(String(d))).filter(Boolean))];
    const org = await updateOrg(ctx.orgId, { allowed_domains: domains });
    if (!org) return reply.code(503).send({ error: 'db', message: '도메인 저장 실패' });
    return { org };
  });

  app.get('/api/org/invites', async (req, reply) => {
    const ctx = await requireOrgAdmin(req, reply);
    if (!ctx) return;
    const invites = await listInvites(ctx.orgId);
    if (!invites) return reply.code(503).send({ error: 'db', message: 'DB 조회 실패' });
    return { invites };
  });

  app.post('/api/org/invites', async (req, reply) => {
    const ctx = await requireOrgAdmin(req, reply);
    if (!ctx) return;
    const body = (req.body ?? {}) as { role?: string; maxUses?: number; expiresInDays?: number };
    const role = body.role === 'org_admin' ? 'org_admin' : 'teacher';
    const maxUses = body.maxUses ? Math.max(1, Number(body.maxUses)) : null;
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + Number(body.expiresInDays) * 86400_000).toISOString()
      : null;
    const invite = await createInvite({ orgId: ctx.orgId, role, maxUses, expiresAt, createdBy: ctx.user.id });
    if (!invite) return reply.code(503).send({ error: 'db', message: '초대코드 발급 실패' });
    return reply.code(201).send({ invite });
  });

  app.delete('/api/org/invites/:inviteId', async (req, reply) => {
    const ctx = await requireOrgAdmin(req, reply);
    if (!ctx) return;
    const { inviteId } = req.params as { inviteId: string };
    const ok = await deleteInvite(ctx.orgId, inviteId);
    if (!ok) return reply.code(503).send({ error: 'db', message: '초대코드 삭제 실패' });
    return { ok: true };
  });

  // ── 로그인 사용자 누구나: 초대코드로 합류 ──

  app.post('/api/org/join', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = (req.body ?? {}) as { code?: string };
    if (!body.code?.trim()) return reply.code(400).send({ error: 'bad', message: '초대코드가 필요합니다.' });
    const r = await redeemInvite(user, body.code);
    if (!r.ok) return reply.code(400).send({ error: 'bad', message: r.message });
    return { user: { id: r.user.id, email: r.user.email, role: r.user.role, orgId: r.user.org_id } };
  });
}
