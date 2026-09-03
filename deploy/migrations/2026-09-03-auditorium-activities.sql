-- 강당A: 설문(survey) 응답 + Q&A 2.0 질문 저장
-- additive only — 기존 테이블/데이터 파괴 없음. 여러 번 실행해도 안전(idempotent).
-- 적용(dev): ssh ... 'docker exec -i supabase-db psql -U postgres -d axedu_dev' < 이 파일

-- 설문 응답: 참가자당 활동 1행 (재제출 시 갱신). answers = {문항id: 값(1~5 | 0~10 | 텍스트)}
CREATE TABLE IF NOT EXISTS public.axedu_survey_responses (
  id bigserial PRIMARY KEY,
  classroom_id text NOT NULL REFERENCES public.axedu_classrooms(id) ON DELETE CASCADE,
  participant_id text NOT NULL REFERENCES public.axedu_participants(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, participant_id, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_axedu_survey_responses_classroom ON public.axedu_survey_responses (classroom_id);

-- 익명 질문: 참가자·닉네임 미기록(익명 보장). 업보트 수·답변완료·승인 상태만 갱신
CREATE TABLE IF NOT EXISTS public.axedu_questions (
  id text PRIMARY KEY,
  classroom_id text NOT NULL REFERENCES public.axedu_classrooms(id) ON DELETE CASCADE,
  text text NOT NULL,
  upvotes integer NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_axedu_questions_classroom ON public.axedu_questions (classroom_id);

-- 기존 axedu_* 표와 동일하게 RLS 활성(정책 없음) → 서버 service_role 만 접근
ALTER TABLE public.axedu_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axedu_questions ENABLE ROW LEVEL SECURITY;

-- PostgREST 롤 권한 (postgres 슈퍼유저로 생성 시 기본 grant가 없어 42501 발생)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.axedu_survey_responses TO service_role, authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.axedu_survey_responses_id_seq TO service_role, authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.axedu_questions TO service_role, authenticated, anon;

-- PostgREST 스키마 캐시 리로드 (self-hosted)
NOTIFY pgrst, 'reload schema';
