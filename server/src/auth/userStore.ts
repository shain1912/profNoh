import { dbSafe } from '../db';
import { ensureOrgAssignment } from '../orgs/orgStore';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  provider: string;
  provider_id: string;
  org_id: string | null;
  role: 'super_admin' | 'org_admin' | 'teacher';
}

/** 소셜 프로필로 사용자 조회/생성. 같은 (provider, provider_id)면 로그인 시각만 갱신. */
export async function upsertUser(p: {
  email: string;
  name?: string;
  avatarUrl?: string;
  provider: string;
  providerId: string;
}): Promise<UserRow | null> {
  return dbSafe(async (sb) => {
    const existing = await sb
      .from('axedu_users')
      .select('*')
      .eq('provider', p.provider)
      .eq('provider_id', p.providerId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data) {
      const upd = await sb
        .from('axedu_users')
        .update({ last_login_at: new Date().toISOString(), name: p.name ?? existing.data.name, avatar_url: p.avatarUrl ?? existing.data.avatar_url })
        .eq('id', existing.data.id)
        .select('*')
        .single();
      if (upd.error) throw upd.error;
      return ensureOrgAssignment(upd.data as UserRow); // 도메인 매칭 org 자동 부여 (기존 org는 유지)
    }

    // 같은 이메일 계정이 이미 있으면(다른 provider로 가입) 소셜 정보를 그 계정에 연결.
    // email은 UNIQUE라 INSERT가 불가하고, google 이메일은 검증된 값이라 연결이 안전하다.
    const byEmail = await sb.from('axedu_users').select('*').eq('email', p.email).maybeSingle();
    if (byEmail.error) throw byEmail.error;
    if (byEmail.data) {
      const link = await sb
        .from('axedu_users')
        .update({
          provider: p.provider,
          provider_id: p.providerId,
          last_login_at: new Date().toISOString(),
          name: p.name ?? byEmail.data.name,
          avatar_url: p.avatarUrl ?? byEmail.data.avatar_url,
        })
        .eq('id', byEmail.data.id)
        .select('*')
        .single();
      if (link.error) throw link.error;
      return ensureOrgAssignment(link.data as UserRow);
    }

    const ins = await sb
      .from('axedu_users')
      .insert({
        email: p.email,
        name: p.name ?? null,
        avatar_url: p.avatarUrl ?? null,
        provider: p.provider,
        provider_id: p.providerId,
      })
      .select('*')
      .single();
    if (ins.error) throw ins.error;
    return ensureOrgAssignment(ins.data as UserRow); // 신규 가입 시 도메인 매칭 org 자동 부여
  });
}

export async function getUserById(id: string): Promise<UserRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_users').select('*').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as UserRow) ?? null;
  });
}
