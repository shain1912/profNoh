-- Phase 1 인증 베이스 — axedu_users 테이블 + 덱 소유권 (additive, idempotent)
-- 이전 세션에서 dev DB에 직접 적용했던 DDL을 파일화 (프로덕션 승격용). is_active 는 별도 파일에도 있으나 여기 포함.

CREATE TABLE IF NOT EXISTS public.axedu_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  avatar_url text,
  provider text NOT NULL,
  provider_id text NOT NULL,
  org_id uuid,
  role text NOT NULL DEFAULT 'teacher',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_axedu_users_org ON public.axedu_users (org_id);

-- 덱 소유권: 로그인 강사 계정에 귀속 (기존 덱은 NULL → super_admin 백필 대상)
ALTER TABLE public.axedu_decks ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.axedu_users(id);

NOTIFY pgrst, 'reload schema';
