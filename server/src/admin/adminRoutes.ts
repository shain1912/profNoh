import type { FastifyInstance } from 'fastify';
import { supabase } from '../db';
import { requireSuperAdmin } from './guard';

/**
 * 관리자(super_admin) 전용 API — 회원관리 + 전체 통계.
 * 모든 라우트는 requireSuperAdmin 가드를 통과해야 한다.
 */

const ROLES = ['super_admin', 'org_admin', 'teacher'] as const;
type Role = (typeof ROLES)[number];

const USER_COLS = 'id,email,name,avatar_url,provider,org_id,role,is_active,created_at,last_login_at';

export async function registerAdminRoutes(app: FastifyInstance) {
  // 전체 통계 — 회원 수 · 덱 수 · 최근 7일 가입 수 · 최근 가입 5명
  app.get('/api/admin/stats', async (req, reply) => {
    const admin = await requireSuperAdmin(req, reply);
    if (!admin) return;
    if (!supabase) return reply.code(503).send({ error: 'db', message: 'DB 미설정' });
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [users, decks, recent, latest] = await Promise.all([
        supabase.from('axedu_users').select('id', { count: 'exact', head: true }),
        supabase.from('axedu_decks').select('id', { count: 'exact', head: true }),
        supabase.from('axedu_users').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
        supabase.from('axedu_users').select('id,email,name,role,created_at').order('created_at', { ascending: false }).limit(5),
      ]);
      const err = users.error ?? decks.error ?? recent.error ?? latest.error;
      if (err) throw err;
      return {
        userCount: users.count ?? 0,
        deckCount: decks.count ?? 0,
        signups7d: recent.count ?? 0,
        recentUsers: latest.data ?? [],
      };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'db', message: '통계 조회 실패' });
    }
  });

  // 회원 목록 — 검색(이메일/이름) + 페이지네이션
  app.get('/api/admin/users', async (req, reply) => {
    const admin = await requireSuperAdmin(req, reply);
    if (!admin) return;
    if (!supabase) return reply.code(503).send({ error: 'db', message: 'DB 미설정' });
    const q = req.query as { search?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20) || 20));
    // PostgREST or() 필터 인젝션 방지 — 구분자로 쓰이는 문자는 제거
    const search = (q.search ?? '').trim().replace(/[,()%]/g, '');
    try {
      let query = supabase
        .from('axedu_users')
        .select(USER_COLS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (search) query = query.or(`email.ilike.*${search}*,name.ilike.*${search}*`);
      const r = await query;
      if (r.error) throw r.error;
      return { users: r.data ?? [], total: r.count ?? 0, page, pageSize };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'db', message: '회원 목록 조회 실패' });
    }
  });

  // 회원 상세 — 덱 수 · 최근 로그인 포함
  app.get('/api/admin/users/:id', async (req, reply) => {
    const admin = await requireSuperAdmin(req, reply);
    if (!admin) return;
    if (!supabase) return reply.code(503).send({ error: 'db', message: 'DB 미설정' });
    const { id } = req.params as { id: string };
    try {
      const [u, decks] = await Promise.all([
        supabase.from('axedu_users').select(USER_COLS).eq('id', id).maybeSingle(),
        supabase.from('axedu_decks').select('id', { count: 'exact', head: true }).eq('owner_id', id),
      ]);
      if (u.error) throw u.error;
      if (!u.data) return reply.code(404).send({ error: 'notfound', message: '회원을 찾을 수 없습니다.' });
      if (decks.error) throw decks.error;
      return { user: u.data, deckCount: decks.count ?? 0 };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'db', message: '회원 상세 조회 실패' });
    }
  });

  // role 변경
  app.patch('/api/admin/users/:id/role', async (req, reply) => {
    const admin = await requireSuperAdmin(req, reply);
    if (!admin) return;
    if (!supabase) return reply.code(503).send({ error: 'db', message: 'DB 미설정' });
    const { id } = req.params as { id: string };
    const { role } = (req.body ?? {}) as { role?: Role };
    if (!role || !ROLES.includes(role)) {
      return reply.code(400).send({ error: 'bad', message: `role은 ${ROLES.join('|')} 중 하나여야 합니다.` });
    }
    if (id === admin.id && role !== 'super_admin') {
      return reply.code(400).send({ error: 'bad', message: '자기 자신의 관리자 권한은 해제할 수 없습니다.' });
    }
    try {
      const r = await supabase.from('axedu_users').update({ role }).eq('id', id).select(USER_COLS).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return reply.code(404).send({ error: 'notfound', message: '회원을 찾을 수 없습니다.' });
      return { user: r.data };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'db', message: 'role 변경 실패' });
    }
  });

  // 계정 활성/비활성 토글
  app.patch('/api/admin/users/:id/active', async (req, reply) => {
    const admin = await requireSuperAdmin(req, reply);
    if (!admin) return;
    if (!supabase) return reply.code(503).send({ error: 'db', message: 'DB 미설정' });
    const { id } = req.params as { id: string };
    const { isActive } = (req.body ?? {}) as { isActive?: boolean };
    if (typeof isActive !== 'boolean') {
      return reply.code(400).send({ error: 'bad', message: 'isActive(boolean)가 필요합니다.' });
    }
    if (id === admin.id && !isActive) {
      return reply.code(400).send({ error: 'bad', message: '자기 자신의 계정은 비활성화할 수 없습니다.' });
    }
    try {
      const r = await supabase.from('axedu_users').update({ is_active: isActive }).eq('id', id).select(USER_COLS).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return reply.code(404).send({ error: 'notfound', message: '회원을 찾을 수 없습니다.' });
      return { user: r.data };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({ error: 'db', message: '활성 상태 변경 실패' });
    }
  });
}
