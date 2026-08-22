-- [TASK A — 관리자] axedu_users 계정 활성/비활성 플래그 (additive only)
-- 기존 행은 모두 활성(true)으로 유지된다.
ALTER TABLE axedu_users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
