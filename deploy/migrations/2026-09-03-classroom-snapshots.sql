-- Phase 2 영속화: 라이브 강의실 상태 스냅샷 + 강의실 owner(강사 계정) 귀속
-- additive only — 기존 테이블/데이터 파괴 없음. 여러 번 실행해도 안전(idempotent).
-- 적용(dev): ssh ... 'docker exec -i supabase-db psql -U postgres -d axedu_dev' < 이 파일
-- 근거: docs/research/2026-09-03-current-capabilities.md 리스크 2 (라이브 상태가 프로세스 메모리에만 존재)

-- 1) 강의실 owner — 로그인한 강사 계정. /teach 의 "진행 중인 내 강의실" 목록·재접속 근거
ALTER TABLE public.axedu_classrooms
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.axedu_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_axedu_classrooms_owner ON public.axedu_classrooms (owner_id);

-- 2) ClassroomState 스냅샷 — 강의실당 1행(upsert). 변경 debounce(2~5초) + 주기(30초)로 갱신.
--    부팅 시 updated_at 이 12시간 이내이고 status <> 'ended' 인 행을 메모리로 복원한다.
--    state 는 서버 내부 직렬화(server/src/state.ts exportState, v=1) — 클라이언트에 노출하지 않는다(instructor_secret 포함).
CREATE TABLE IF NOT EXISTS public.axedu_classroom_snapshots (
  classroom_id text PRIMARY KEY REFERENCES public.axedu_classrooms(id) ON DELETE CASCADE,
  token text NOT NULL,
  owner_id uuid,
  status text NOT NULL DEFAULT 'waiting',
  version integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_axedu_classroom_snapshots_updated ON public.axedu_classroom_snapshots (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_axedu_classroom_snapshots_owner ON public.axedu_classroom_snapshots (owner_id);

-- 기존 axedu_* 표와 동일하게 RLS 활성(정책 없음) → 서버 service_role 만 접근
ALTER TABLE public.axedu_classroom_snapshots ENABLE ROW LEVEL SECURITY;

-- PostgREST 롤 권한 (postgres 슈퍼유저로 생성 시 기본 grant 가 없어 42501 발생)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.axedu_classroom_snapshots TO service_role, authenticated, anon;

-- PostgREST 스키마 캐시 리로드 (self-hosted)
NOTIFY pgrst, 'reload schema';
