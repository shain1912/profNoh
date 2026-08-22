import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // server/src
// 루트(.env) 우선, 없으면 server/.env 도 시도
config({ path: resolve(here, '../../.env') });
config({ path: resolve(here, '../.env') });

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    console.warn(`[env] ${name} 가 비어 있습니다. (.env 확인)`);
    return '';
  }
  return v;
}

// 단일(PREFIX) + 다중(PREFIX1, PREFIX2, ...) 키를 모두 모아 중복 제거
function collectKeys(prefix: string): string[] {
  const keys: string[] = [];
  const single = process.env[prefix];
  if (single) keys.push(single);
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`${prefix}${i}`];
    if (k) keys.push(k);
  }
  return [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
}

export const env = {
  PORT: Number(process.env.PORT ?? 8787),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  SUPABASE_URL: req('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: req('SUPABASE_SERVICE_ROLE_KEY'),

  // 단일/다중 키 모두 지원 (MINIMAX_API_KEY 또는 MINIMAX_API_KEY1..N)
  MINIMAX_API_KEYS: collectKeys('MINIMAX_API_KEY'),
  MINIMAX_GROUP_ID: process.env.MINIMAX_GROUP_ID ?? '',
  MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL ?? 'https://api.minimaxi.chat/v1',
  MINIMAX_MODEL: process.env.MINIMAX_MODEL ?? 'MiniMax-Text-01',

  STABILITY_API_KEYS: collectKeys('STABILITY_API_KEY'),
  STABILITY_BASE_URL: process.env.STABILITY_BASE_URL ?? 'https://api.stability.ai',

  QUOTA_CHAT_PER_ACTIVITY: Number(process.env.QUOTA_CHAT_PER_ACTIVITY ?? 8),
  QUOTA_IMAGE_PER_ACTIVITY: Number(process.env.QUOTA_IMAGE_PER_ACTIVITY ?? 4),
  CLASSROOM_BUDGET_USD: Number(process.env.CLASSROOM_BUDGET_USD ?? 15),

  // ── 인증 (Phase 1: 카카오/구글 원클릭 로그인) ──
  AUTH_JWT_SECRET: req('AUTH_JWT_SECRET'),
  APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  // DEV_LOGIN=1 이면 /api/auth/dev-login 활성화 (로컬 개발 전용 — 프로덕션 금지)
  DEV_LOGIN: process.env.DEV_LOGIN === '1',
  // ── 결제 (TASK C): mock이면 실키 없이 E2E 시뮬레이션, toss면 테스트/실 키 사용 ──
  BILLING_PROVIDER: (process.env.BILLING_PROVIDER === 'toss' ? 'toss' : 'mock') as 'toss' | 'mock',
  TOSS_CLIENT_KEY: process.env.TOSS_CLIENT_KEY ?? '',
  TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY ?? '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  KAKAO_CLIENT_ID: process.env.KAKAO_CLIENT_ID ?? '',
  KAKAO_CLIENT_SECRET: process.env.KAKAO_CLIENT_SECRET ?? '',
  // 콤마 구분 이메일 목록 — 해당 이메일 로그인 시 자동 super_admin 승격 (첫 관리자 부트스트랩)
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
};

export const hasSupabase = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
export const hasMiniMax = env.MINIMAX_API_KEYS.length > 0;
export const hasStability = env.STABILITY_API_KEYS.length > 0;
