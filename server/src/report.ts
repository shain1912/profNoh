import type { Deck } from '../../shared/types';
import { ANONYMITY_POLICIES, resolveAnonymous, type AnonymityPolicy } from '../../shared/types';

// ──────────────────────────────────────────────────────────────
//  강의실 리포트 집계 (순수 함수) — routes.ts 의 /api/classrooms/:id/report 가 사용
//  DB 행을 받아 리포트 DTO 를 만든다. 익명 정책을 여기서 한 번에 적용:
//   - 세션 익명(always_anon): 참가자 이름 전부를 참가 순서 기준 가명("익명 N")으로
//   - 활동 익명: 퀴즈 개별 답변은 이름 없이("익명"), 투표는 개별 응답을 아예 빼고 집계만
// ──────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReportRows {
  classroom: any;
  deck: Deck | undefined;
  participants: any[];
  quizResponses: any[];
  pollResponses: any[];
  aiUsages: any[];
  labRuns: any[];
}

export function classroomAnonymityPolicy(classroom: any): AnonymityPolicy {
  const v = classroom?.settings?.anonymity;
  return ANONYMITY_POLICIES.includes(v) ? v : 'named_default';
}

export function buildReport(rows: ReportRows) {
  const { classroom, deck } = rows;
  const parts = rows.participants ?? [];
  const quizzes = rows.quizResponses ?? [];
  const polls = rows.pollResponses ?? [];
  const usages = rows.aiUsages ?? [];
  const labs = rows.labRuns ?? [];

  const policy = classroomAnonymityPolicy(classroom);
  const sessionAnonymous = policy === 'always_anon';

  const participantMap = new Map(parts.map((p) => [p.id, p]));
  // 세션 익명 가명: 참가 순서(created_at) 기준 "익명 N" — 같은 리포트 안에서는 일관된 가명
  const aliasMap = new Map<string, string>();
  [...parts]
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id)))
    .forEach((p, i) => aliasMap.set(p.id, `익명 ${i + 1}`));
  const nameOf = (participantId: string | null | undefined): string => {
    const part = participantId ? participantMap.get(participantId) : undefined;
    if (!part) return '알 수 없음';
    return sessionAnonymous ? aliasMap.get(part.id)! : part.nickname;
  };

  // 1. AI 사용량 집계
  let totalCost = 0;
  let safetyBlocks = 0;
  const aiTypeCounts: Record<string, number> = {};
  usages.forEach((u) => {
    totalCost += Number(u.est_cost ?? 0);
    if (u.type === 'blocked') safetyBlocks += 1;
    else aiTypeCounts[u.type] = (aiTypeCounts[u.type] || 0) + (u.units || 1);
  });

  const participantAiMap: Record<string, { chat: number; image: number; analogy: number; roleplay: number; writing: number; tutor: number; cost: number }> = {};
  usages.forEach((u) => {
    if (!u.participant_id) return;
    if (!participantMap.has(u.participant_id)) return;
    const name = nameOf(u.participant_id);
    if (!participantAiMap[name]) participantAiMap[name] = { chat: 0, image: 0, analogy: 0, roleplay: 0, writing: 0, tutor: 0, cost: 0 };
    const pData = participantAiMap[name];
    if (u.type === 'chat') pData.chat += u.units;
    else if (u.type === 'image') pData.image += u.units;
    else if (u.type === 'analogy') pData.analogy += u.units;
    else if (u.type === 'roleplay') pData.roleplay += u.units;
    else if (u.type === 'writing') pData.writing += u.units;
    else if (u.type === 'tutor') pData.tutor += u.units;
    pData.cost += Number(u.est_cost ?? 0);
  });

  // 2. 퀴즈 결과 집계
  const quizSummary: Record<string, any> = {};
  if (deck) {
    Object.values(deck.activities).forEach((act: any) => {
      if (act.type !== 'quiz') return;
      const anonymous = resolveAnonymous(policy, act.anonymous);
      act.questions.forEach((q: any) => {
        quizSummary[q.id] = {
          questionText: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          anonymous,
          totalAnswers: 0,
          correctAnswers: 0,
          correctRate: 0,
          answers: {},
          studentDetails: [],
        };
      });
    });
  }

  quizzes.forEach((qr) => {
    let qStat = quizSummary[qr.question_id];
    if (!qStat) {
      qStat = {
        questionText: '삭제된 문제', options: [], correctIndex: -1,
        anonymous: resolveAnonymous(policy, undefined),
        totalAnswers: 0, correctAnswers: 0, correctRate: 0, answers: {}, studentDetails: [],
      };
      quizSummary[qr.question_id] = qStat;
    }
    qStat.totalAnswers += 1;
    if (qr.is_correct) qStat.correctAnswers += 1;
    const ansKey = qr.answer ?? '';
    qStat.answers[ansKey] = (qStat.answers[ansKey] || 0) + 1;
    qStat.studentDetails.push({
      nickname: qStat.anonymous ? '익명' : nameOf(qr.participant_id),
      answer: qr.answer,
      isCorrect: qr.is_correct,
      responseMs: qr.response_ms,
      points: qr.points,
    });
  });
  Object.keys(quizSummary).forEach((qid) => {
    const q = quizSummary[qid];
    if (q.totalAnswers > 0) q.correctRate = Math.round((q.correctAnswers / q.totalAnswers) * 100);
  });

  // 3. 투표 결과 집계
  const pollSummary: Record<string, any> = {};
  if (deck) {
    Object.values(deck.activities).forEach((act: any) => {
      if (act.type !== 'poll') return;
      pollSummary[act.id] = {
        prompt: act.prompt,
        mode: act.mode,
        options: act.options ?? [],
        anonymous: resolveAnonymous(policy, act.anonymous),
        totalVotes: 0,
        votes: {},
        studentDetails: [],
      };
    });
  }

  polls.forEach((pr) => {
    let pStat = pollSummary[pr.activity_id];
    if (!pStat) {
      pStat = {
        prompt: '삭제된 투표', mode: 'choice', options: [],
        anonymous: resolveAnonymous(policy, undefined),
        totalVotes: 0, votes: {}, studentDetails: [],
      };
      pollSummary[pr.activity_id] = pStat;
    }
    pStat.totalVotes += 1;
    const val = pr.value ?? '';
    pStat.votes[val] = (pStat.votes[val] || 0) + 1;
    // 익명 투표는 개별 응답(이름·값 쌍)을 리포트에 싣지 않는다 — 집계(votes)만
    if (!pStat.anonymous) pStat.studentDetails.push({ nickname: nameOf(pr.participant_id), value: val });
  });

  // 4. 비교 실습(Lab) 집계
  const labSummary = labs.map((l) => ({
    nickname: nameOf(l.participant_id),
    labType: l.lab_type,
    input: l.input,
    config: l.config,
    output: l.output,
    createdAt: l.created_at,
  }));

  return {
    classroom: {
      id: classroom.id,
      token: classroom.token,
      deckId: classroom.deck_id,
      title: classroom.title,
      status: classroom.status,
      createdAt: classroom.created_at,
    },
    anonymity: { policy, sessionAnonymous },
    deckSummary: deck ? { id: deck.id, title: deck.title, slideCount: deck.slides.length } : null,
    stats: {
      totalParticipants: parts.length,
      totalCost: Number(totalCost.toFixed(5)),
      safetyBlocks,
      aiTypeCounts,
    },
    participants: parts.map((p) => ({
      id: p.id,
      nickname: nameOf(p.id),
      score: p.score,
      // DB 컬럼은 created_at (joined_at 없음) — 리포트 '참가 일자' Invalid Date 버그 수정
      joinedAt: p.created_at,
    })),
    quizSummary,
    pollSummary,
    labSummary,
    participantAiUsages: Object.entries(participantAiMap).map(([nickname, data]) => ({
      nickname,
      ...data,
      cost: Number(data.cost.toFixed(5)),
    })),
  };
}
