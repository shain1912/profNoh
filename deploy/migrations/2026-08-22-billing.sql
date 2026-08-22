-- ─────────────────────────────────────────────────────────────
-- 결제/플랜 (TASK C) — additive 마이그레이션
-- 대상: dev Supabase (supabase-axedu.kodekorea.kr/dev → DB axedu_dev)
-- 적용 경로: ssh ubuntu@156.228.4.156
--   sudo docker exec -i supabase-db psql -U postgres -d axedu_dev < 이 파일
-- 주의: 병렬 워커 3명이 같은 DB를 공유 — CREATE TABLE IF NOT EXISTS 만 사용,
--       기존 테이블/데이터는 절대 건드리지 않는다.
-- ─────────────────────────────────────────────────────────────

-- 구독: 사용자당 1행. plan은 개인 구독만 기록(free/premium).
-- org 여부는 axedu_users.org_id 존재로만 판정하므로 여기에 org를 넣지 않는다.
CREATE TABLE IF NOT EXISTS public.axedu_subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES public.axedu_users(id),
  plan               text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'expired')),
  current_period_end timestamptz,
  provider           text,                          -- 'toss' | 'mock'
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 결제 내역: 체크아웃 시 'ready'로 선기록(금액 위변조 검증 기준) → 승인 시 'confirmed'
CREATE TABLE IF NOT EXISTS public.axedu_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.axedu_users(id),
  order_id    text NOT NULL UNIQUE,                 -- 토스 orderId (서버 발급)
  payment_key text,                                 -- 토스 paymentKey (승인 후 기록)
  plan        text NOT NULL,                        -- 구매 플랜 ('premium')
  amount      integer NOT NULL,                     -- KRW 정수
  currency    text NOT NULL DEFAULT 'KRW',
  status      text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'confirmed', 'failed', 'canceled')),
  provider    text NOT NULL DEFAULT 'toss',         -- 'toss' | 'mock'
  method      text,                                 -- 카드/가상계좌 등 (승인 응답)
  receipt_url text,
  raw         jsonb,                                -- 공급자 원본 응답/웹훅 페이로드
  created_at  timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_axedu_payments_user ON public.axedu_payments (user_id, created_at DESC);

-- 서버는 service_role 키로 접근 (RLS 우회). anon에는 권한을 주지 않는다.
GRANT ALL ON public.axedu_subscriptions TO service_role;
GRANT ALL ON public.axedu_payments TO service_role;
