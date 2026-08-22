-- TASK B: 기관(교육청/학교/기업) 관리 + 화이트리스트 도메인
-- additive only — 기존 테이블/데이터 파괴 없음. 여러 번 실행해도 안전(idempotent).

CREATE TABLE IF NOT EXISTS public.axedu_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_type text NOT NULL DEFAULT '학교' CHECK (org_type IN ('교육청', '학교', '기업')),
  allowed_domains text[] NOT NULL DEFAULT '{}',
  seat_limit integer,
  contract_start date,
  contract_end date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 초대코드: 도메인 화이트리스트에 없는 사용자를 기관에 초대
CREATE TABLE IF NOT EXISTS public.axedu_org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.axedu_orgs(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'org_admin')),
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_axedu_org_invites_org ON public.axedu_org_invites (org_id);
CREATE INDEX IF NOT EXISTS idx_axedu_users_org ON public.axedu_users (org_id);

-- PostgREST 롤 권한 (postgres 슈퍼유저로 생성 시 기본 grant가 없어 42501 발생)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.axedu_orgs TO service_role, authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.axedu_org_invites TO service_role, authenticated, anon;

-- PostgREST 스키마 캐시 리로드 (self-hosted)
NOTIFY pgrst, 'reload schema';
