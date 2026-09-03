import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { registerAuthRoutes } from './auth/authRoutes';
import { registerAdminRoutes } from './admin/adminRoutes';
import { registerOrgRoutes } from './orgs/orgRoutes';
import { registerBillingRoutes } from './billing/billingRoutes';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { env, hasSupabase, hasMiniMax, hasStability } from './env';
import { registerRoutes } from './routes';
import { setupSocket } from './socket';
import { restoreSnapshots, startSnapshotLoop, installShutdownFlush } from './snapshot';

const here = dirname(fileURLToPath(import.meta.url)); // server/src
const clientDist = resolve(here, '../../client/dist');
const uploadsDir = resolve(here, '../../uploads');

// Ensure uploads directory exists
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

async function main() {
  const app = Fastify({
    logger: { level: 'info', transport: undefined },
    bodyLimit: 50 * 1024 * 1024, // 50MB limit to support large PDF uploads
    // Cloudflare → Caddy 뒤에서 req.ip 가 X-Forwarded-For 의 클라이언트 IP 가 되도록 (rate limit 키)
    trustProxy: env.TRUST_PROXY,
  });

  await app.register(fastifyCors, {
    origin: env.CLIENT_ORIGIN ? [env.CLIENT_ORIGIN] : true,
    credentials: true,
  });
  await app.register(fastifyCookie);

  // ── HTTP rate limit (R3 §2.6): IP당 전역 상한 + 비싼 경로(강의실 생성·업로드·AI 덱 생성)는 routes.ts 에서 개별 상한 ──
  // 강당은 400명이 NAT 1개를 공유할 수 있어 전역값은 넉넉히 두고(기본 1200/분), 남용 대상 경로만 엄격히 제한한다.
  if (!env.RATE_LIMIT_DISABLED) {
    await app.register(fastifyRateLimit, {
      global: true,
      max: env.RATE_LIMIT_PER_MIN,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      // 반환 객체가 throw 되므로 statusCode(429/403) 를 실어야 500 이 아닌 429 로 응답한다
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: ctx.statusCode,
        error: 'rate_limited',
        message: `요청이 너무 많아요. ${Math.max(1, Math.ceil(ctx.ttl / 1000))}초 뒤에 다시 시도해 주세요.`,
      }),
    });
  }

  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerOrgRoutes(app);
  await registerBillingRoutes(app);
  // 본문 크기 제한 (이미지 base64 응답은 서버→클라 방향이라 요청 본문은 작음)
  await registerRoutes(app);

  // 프로덕션: 빌드된 SPA 서빙 + 라우터 폴백
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else {
          // Vite hashed assets can be cached for 1 year
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'notfound', message: 'API 경로 없음' });
      }
      return reply.sendFile('index.html');
    });
    app.log.info(`[static] 클라이언트 빌드 서빙: ${clientDist}`);
  } else {
    app.log.info('[static] client/dist 없음 — 개발 모드(Vite 5173)에서 접속하세요.');
  }

  // ── Phase 2 영속화: 소켓을 열기 전에 스냅샷 복원 (재시작 후에도 토큰·슬라이드·점수 유지, 12시간 TTL) ──
  // DB 지연으로 부팅이 막히지 않도록 10초 상한. 못 읽으면 빈 상태로 시작(기존 동작).
  const restored = await Promise.race([
    restoreSnapshots(),
    new Promise<{ restored: number; skipped: number }>((r) => setTimeout(() => r({ restored: -1, skipped: 0 }), 10_000)),
  ]);
  app.log.info(
    restored.restored < 0
      ? '[snapshot] 복원 시간 초과 — 빈 상태로 시작'
      : `[snapshot] 강의실 ${restored.restored}개 복원 (건너뜀 ${restored.skipped})`,
  );

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  const io = new SocketIOServer(app.server, {
    cors: { origin: env.CLIENT_ORIGIN ? [env.CLIENT_ORIGIN] : true, credentials: true },
    // 소켓 페이로드는 전부 수 KB 이하(투표·설문·질문) — 기본 1MB 대신 64KB 로 잘라 대형 프레임 남용 차단
    maxHttpBufferSize: 64 * 1024,
  });
  setupSocket(io as any); // 복원된 강의실의 활동 타이머도 여기서 재장전
  startSnapshotLoop();
  installShutdownFlush();

  app.log.info(
    `[ready] :${env.PORT} | Supabase=${hasSupabase ? 'on' : 'off'} | MiniMax=${hasMiniMax ? 'on' : 'demo'} | Stability=${hasStability ? 'on' : 'demo'}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
