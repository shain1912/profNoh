import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSessionUser } from '../auth/session';
import type { UserRow } from '../auth/userStore';

/**
 * super_admin 전용 가드. 통과하면 사용자 행을 반환하고,
 * 아니면 401/403 응답을 보낸 뒤 null 을 반환한다.
 * 사용처: const admin = await requireSuperAdmin(req, reply); if (!admin) return;
 */
export async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | null> {
  const user = await getSessionUser(req);
  if (!user) {
    reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    return null;
  }
  if (user.role !== 'super_admin') {
    reply.code(403).send({ error: 'forbidden', message: '관리자 권한이 필요합니다.' });
    return null;
  }
  if ((user as UserRow & { is_active?: boolean }).is_active === false) {
    reply.code(403).send({ error: 'forbidden', message: '비활성화된 계정입니다.' });
    return null;
  }
  return user;
}
