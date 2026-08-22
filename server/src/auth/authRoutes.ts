import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env } from '../env';
import { upsertUser } from './userStore';
import { setSessionCookie, clearSessionCookie, getSessionUser } from './session';
import { processLogin } from '../admin/bootstrap';

/**
 * 카카오/구글 OAuth2 인가코드 플로우 직접 구현 (외부 인증 서버 의존 없음).
 * 학생은 로그인 없이 코드 입장 유지 — 이 라우트들은 강사 전용.
 */

interface ProviderConf {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: () => string;
  clientSecret: () => string;
  scope: string;
  profile: (accessToken: string) => Promise<{ providerId: string; email: string; name?: string; avatarUrl?: string }>;
}

const PROVIDERS: Record<string, ProviderConf> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: () => env.GOOGLE_CLIENT_ID,
    clientSecret: () => env.GOOGLE_CLIENT_SECRET,
    scope: 'openid email profile',
    profile: async (token) => {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('google userinfo ' + r.status);
      const j: any = await r.json();
      return { providerId: j.sub, email: j.email, name: j.name, avatarUrl: j.picture };
    },
  },
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    clientId: () => env.KAKAO_CLIENT_ID,
    clientSecret: () => env.KAKAO_CLIENT_SECRET,
    scope: 'account_email profile_nickname profile_image',
    profile: async (token) => {
      const r = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('kakao userinfo ' + r.status);
      const j: any = await r.json();
      const acc = j.kakao_account ?? {};
      if (!acc.email) throw new Error('kakao 계정에 이메일 제공 동의가 필요합니다');
      return {
        providerId: String(j.id),
        email: acc.email,
        name: acc.profile?.nickname,
        avatarUrl: acc.profile?.profile_image_url,
      };
    },
  },
};

export async function registerAuthRoutes(app: FastifyInstance) {
  const callbackUrl = (provider: string) => {
    // 콜백은 API 서버 오리진 기준. 개발에선 vite 프록시를 거치지 않고 직접 콜백 받는다.
    const base = env.APP_ORIGIN.startsWith('https') ? env.APP_ORIGIN : `http://localhost:${env.PORT}`;
    return `${base}/api/auth/${provider}/callback`;
  };

  // 로그인 시작 → 공급자 인가 화면으로
  app.get('/api/auth/:provider/start', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const conf = PROVIDERS[provider];
    if (!conf) return reply.code(404).send({ error: 'bad', message: '지원하지 않는 로그인 방식입니다.' });
    if (!conf.clientId()) return reply.code(503).send({ error: 'bad', message: `${provider} 로그인이 아직 설정되지 않았습니다.` });

    const state = randomUUID();
    reply.setCookie('axedu_oauth_state', state, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 });

    const u = new URL(conf.authorizeUrl);
    u.searchParams.set('client_id', conf.clientId());
    u.searchParams.set('redirect_uri', callbackUrl(provider));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', conf.scope);
    u.searchParams.set('state', state);
    return reply.redirect(u.toString());
  });

  // 공급자 콜백 → 토큰 교환 → 프로필 → 세션 발급
  app.get('/api/auth/:provider/callback', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    const conf = PROVIDERS[provider];
    if (!conf) return reply.code(404).send({ error: 'bad' });
    if (error || !code) return reply.redirect(`${env.APP_ORIGIN}/login?error=${encodeURIComponent(error ?? 'cancelled')}`);

    const saved = (req.cookies ?? {})['axedu_oauth_state'];
    if (!saved || saved !== state) {
      return reply.redirect(`${env.APP_ORIGIN}/login?error=state_mismatch`);
    }
    reply.clearCookie('axedu_oauth_state', { path: '/' });

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: conf.clientId(),
        client_secret: conf.clientSecret(),
        redirect_uri: callbackUrl(provider),
        code,
      });
      const tr = await fetch(conf.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!tr.ok) throw new Error('token exchange ' + tr.status + ': ' + (await tr.text()).slice(0, 200));
      const tokens: any = await tr.json();

      const profile = await conf.profile(tokens.access_token);
      const upserted = await upsertUser({ ...profile, provider });
      if (!upserted) throw new Error('사용자 저장 실패');
      const { user, blocked } = await processLogin(upserted);
      if (blocked) return reply.redirect(`${env.APP_ORIGIN}/login?error=deactivated`);

      setSessionCookie(reply, user.id);
      return reply.redirect(`${env.APP_ORIGIN}/build`);
    } catch (e) {
      app.log.error(e);
      return reply.redirect(`${env.APP_ORIGIN}/login?error=auth_failed`);
    }
  });

  // 로컬 개발 전용 로그인 (DEV_LOGIN=1일 때만) — OAuth 콘솔 등록 없이 전체 플로우 테스트용
  app.post('/api/auth/dev-login', async (req, reply) => {
    if (!env.DEV_LOGIN) return reply.code(404).send({ error: 'notfound' });
    const body = (req.body ?? {}) as { email?: string; name?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) return reply.code(400).send({ error: 'bad', message: '이메일이 필요합니다.' });
    const upserted = await upsertUser({ email, name: body.name ?? email.split('@')[0], provider: 'dev', providerId: email });
    if (!upserted) return reply.code(503).send({ error: 'bad', message: '사용자 저장 실패 (DB 확인)' });
    const { user, blocked } = await processLogin(upserted);
    if (blocked) return reply.code(403).send({ error: 'forbidden', message: '비활성화된 계정입니다.' });
    setSessionCookie(reply, user.id);
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  // 내 정보
  app.get('/api/auth/me', async (req) => {
    const user = await getSessionUser(req);
    if (!user) return { user: null };
    return { user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url, role: user.role, orgId: user.org_id } };
  });

  // 로그아웃
  app.post('/api/auth/logout', async (_req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });
}
