import { dbSafe } from './db';
import type { ClassroomState, Participant } from './state';
import type { QuestionItem } from '../../shared/types';

// 모든 기록은 best-effort. 실패해도 라이브 진행은 막지 않는다.

export function persistClassroom(c: ClassroomState) {
  return dbSafe((sb) =>
    sb.from('axedu_classrooms').insert({
      id: c.id,
      token: c.token,
      deck_id: c.deckId,
      title: c.title ?? null,
      status: c.status,
      current_slide: c.currentSlide,
      instructor_secret: c.instructorSecret,
      settings: c.settings,
    }).then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function updateClassroomSettings(c: ClassroomState) {
  return dbSafe((sb) =>
    sb.from('axedu_classrooms')
      .update({ settings: c.settings })
      .eq('id', c.id)
      .then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function updateClassroomProgress(c: ClassroomState) {
  return dbSafe((sb) =>
    sb.from('axedu_classrooms')
      .update({ status: c.status, current_slide: c.currentSlide })
      .eq('id', c.id)
      .then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function persistParticipant(c: ClassroomState, p: Participant) {
  return dbSafe((sb) =>
    sb.from('axedu_participants')
      .upsert(
        { id: p.id, classroom_id: c.id, nickname: p.nickname, session_id: p.sessionId, score: p.score },
        { onConflict: 'classroom_id,session_id' },
      )
      .then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function persistScore(c: ClassroomState, p: Participant) {
  return dbSafe((sb) =>
    sb.from('axedu_participants').update({ score: p.score }).eq('id', p.id)
      .then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function persistQuizResponse(
  c: ClassroomState, p: Participant, questionId: string,
  answer: string, correct: boolean, ms: number, points: number,
) {
  return dbSafe((sb) =>
    sb.from('axedu_quiz_responses').upsert(
      { classroom_id: c.id, participant_id: p.id, question_id: questionId, answer, is_correct: correct, response_ms: ms, points },
      { onConflict: 'classroom_id,participant_id,question_id' },
    ).then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function persistPoll(c: ClassroomState, p: Participant, activityId: string, value: string) {
  return dbSafe((sb) =>
    sb.from('axedu_poll_responses').insert(
      { classroom_id: c.id, participant_id: p.id, activity_id: activityId, value },
    ).then((r) => { if (r.error) throw r.error; return true; }),
  );
}

/** 설문 응답 — 참가자당 활동 1행(재제출 시 덮어씀). answers 는 {문항id: 값} */
export function persistSurvey(c: ClassroomState, p: Participant, activityId: string, answers: Record<string, number | string>) {
  return dbSafe((sb) =>
    sb.from('axedu_survey_responses').upsert(
      { classroom_id: c.id, participant_id: p.id, activity_id: activityId, answers, updated_at: new Date().toISOString() },
      { onConflict: 'classroom_id,participant_id,activity_id' },
    ).then((r) => { if (r.error) throw r.error; return true; }),
  );
}

/** 익명 질문 — 닉네임/참가자 미기록. 업보트·답변완료·승인 변경 시 같은 행 갱신 */
export function persistQuestion(c: ClassroomState, q: QuestionItem) {
  return dbSafe((sb) =>
    sb.from('axedu_questions').upsert(
      {
        id: q.id, classroom_id: c.id, text: q.text, upvotes: q.upvotes, answered: q.answered, approved: q.approved,
        created_at: new Date(q.createdAt).toISOString(), updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    ).then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function deleteQuestionRow(c: ClassroomState, questionId: string) {
  return dbSafe((sb) =>
    sb.from('axedu_questions').delete().eq('id', questionId).eq('classroom_id', c.id)
      .then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function persistUsage(
  c: ClassroomState, participantId: string | null, type: string, units: number, cost: number,
) {
  return dbSafe((sb) =>
    sb.from('axedu_ai_usage').insert(
      { classroom_id: c.id, participant_id: participantId, type, units, est_cost: cost },
    ).then((r) => { if (r.error) throw r.error; return true; }),
  );
}

export function persistLabRun(
  c: ClassroomState, participantId: string | null, labType: string,
  input: string, config: unknown, output: unknown,
) {
  return dbSafe((sb) =>
    sb.from('axedu_lab_runs').insert(
      { classroom_id: c.id, participant_id: participantId, lab_type: labType, input, config, output },
    ).then((r) => { if (r.error) throw r.error; return true; }),
  );
}
