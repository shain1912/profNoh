import { dbSafe } from '../db';
import { env } from '../env';
import type { UserRow } from '../auth/userStore';

/**
 * 로그인 직후 후처리 (첫 super_admin 부트스트랩 + 비활성 계정 차단).
 * - env ADMIN_EMAILS(콤마 구분)에 포함된 이메일이면 자동으로 super_admin 승격.
 * - is_active=false 인 계정은 로그인 거부.
 * 반환: 허용 시 (승격이 반영된) 사용자 행, 거부 시 { blocked: true }.
 */
export async function processLogin(user: UserRow): Promise<{ user: UserRow; blocked: boolean }> {
  const u = user as UserRow & { is_active?: boolean };
  if (u.is_active === false) return { user, blocked: true };

  const email = (user.email ?? '').trim().toLowerCase();
  if (user.role !== 'super_admin' && email && env.ADMIN_EMAILS.includes(email)) {
    const promoted = await dbSafe(async (sb) => {
      const r = await sb.from('axedu_users').update({ role: 'super_admin' }).eq('id', user.id).select('*').single();
      if (r.error) throw r.error;
      return r.data as UserRow;
    });
    if (promoted) return { user: promoted, blocked: false };
  }
  return { user, blocked: false };
}
