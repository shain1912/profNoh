import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// 포트는 환경변수로 제어 — 본 트리(프로덕션 코드)는 기본값 5173/8787,
// commerce 워크트리는 VITE_DEV_PORT=5174, API_PORT=8788로 띄워 동시 실행 가능
const apiTarget = `http://localhost:${process.env.API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT ?? 5173),
    proxy: {
      // 개발 시 API/소켓을 백엔드로 프록시
      '/api': apiTarget,
      '/socket.io': {
        target: apiTarget,
        ws: true,
      },
    },
  },
});
