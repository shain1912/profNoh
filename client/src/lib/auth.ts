export interface Me {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  role: 'super_admin' | 'org_admin' | 'teacher';
  orgId?: string | null;
}

export async function fetchMe(): Promise<Me | null> {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}

export function loginStartUrl(provider: 'google'): string {
  return `/api/auth/${provider}/start`;
}

/** 로컬 개발 전용 — 서버 DEV_LOGIN=1일 때만 동작 */
export async function devLogin(email: string, name?: string): Promise<Me> {
  const r = await fetch('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, name }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message ?? '로그인 실패');
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
}
