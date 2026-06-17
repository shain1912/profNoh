import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { env, hasSupabase, hasMiniMax, hasStability } from './env';
import { registerRoutes } from './routes';
import { setupSocket } from './socket';

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
  });

  await app.register(fastifyCors, {
    origin: env.CLIENT_ORIGIN ? [env.CLIENT_ORIGIN] : true,
    credentials: true,
  });

  // 본문 크기 제한 (이미지 base64 응답은 서버→클라 방향이라 요청 본문은 작음)
  await registerRoutes(app);

  // 프로덕션: 빌드된 SPA 서빙 + 라우터 폴백
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist, prefix: '/' });
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

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  const io = new SocketIOServer(app.server, {
    cors: { origin: env.CLIENT_ORIGIN ? [env.CLIENT_ORIGIN] : true, credentials: true },
  });
  setupSocket(io as any);

  app.log.info(
    `[ready] :${env.PORT} | Supabase=${hasSupabase ? 'on' : 'off'} | MiniMax=${hasMiniMax ? 'on' : 'demo'} | Stability=${hasStability ? 'on' : 'demo'}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
