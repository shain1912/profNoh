// 익명 시스템 단위 테스트 — node --import tsx --test server/test/anonymity.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnonymous } from '../../shared/types.ts';
import { validateDeck } from '../src/decks/validate.ts';
import { ClassroomState } from '../src/state.ts';
import { buildReport } from '../src/report.ts';

// ── 1. 정책 해석 ──
test('resolveAnonymous: 4모드 × 활동 오버라이드', () => {
  // named_default: 기본 실명, 활동 오버라이드 존중
  assert.equal(resolveAnonymous('named_default', undefined), false);
  assert.equal(resolveAnonymous('named_default', true), true);
  assert.equal(resolveAnonymous('named_default', false), false);
  // anon_default: 기본 익명, 활동 오버라이드 존중
  assert.equal(resolveAnonymous('anon_default', undefined), true);
  assert.equal(resolveAnonymous('anon_default', false), false);
  // always_*: 활동 설정 무시
  assert.equal(resolveAnonymous('always_anon', false), true);
  assert.equal(resolveAnonymous('always_named', true), false);
});

// ── 2. 덱 검증이 anonymous 플래그를 보존 ──
test('validateDeck: 활동 anonymous 불리언 보존 (모든 타입), 비불리언은 제거', () => {
  const raw = {
    title: 't',
    slides: [],
    activities: {
      p1: { type: 'poll', id: 'p1', title: '투표', prompt: '?', mode: 'wordcloud', anonymous: true },
      p2: { type: 'poll', id: 'p2', title: '투표', prompt: '?', mode: 'choice', options: ['a', 'b'], anonymous: false },
      p3: { type: 'poll', id: 'p3', title: '투표', prompt: '?', mode: 'choice', options: ['a', 'b'], anonymous: 'yes' },
      q1: { type: 'quiz', id: 'q1', title: '퀴즈', questions: [], anonymous: true },
      c1: { type: 'chat', id: 'c1', title: '대화', anonymous: true },
    },
  };
  const d = validateDeck(raw, 'DCK001');
  assert.equal(d.activities.p1.anonymous, true);
  assert.equal(d.activities.p2.anonymous, false);
  assert.equal('anonymous' in d.activities.p3, false);
  assert.equal(d.activities.q1.anonymous, true);
  assert.equal(d.activities.c1.anonymous, true);
});

// ── 3. ClassroomState 동작 (내장 샘플 덱 ai-ax-4h: poll-warmup 은 wordcloud) ──
function room(settings = {}) {
  const c = new ClassroomState('ai-ax-4h', '테스트');
  c.updateSettings(settings);
  return c;
}

test('기본 설정: named_default + after_close', () => {
  const c = room();
  const snap = c.snapshot();
  assert.equal(snap.anonymity, 'named_default');
  assert.equal(snap.resultsReveal, 'after_close');
});

test('투표 결과 숨김 → 공개(마감): 학생/프로젝터는 hidden, 강사는 전체 분포', () => {
  const c = room();
  const a = c.upsertParticipant(undefined, '가나');
  const b = c.upsertParticipant(undefined, '다라');
  c.openActivity('poll-warmup', 'poll');
  assert.equal(c.activity.anonymous, false);
  assert.equal(c.activity.revealResults, false);
  assert.equal(c.recordPoll(a.sessionId, 'poll-warmup', '로봇'), true);
  assert.equal(c.recordPoll(b.sessionId, 'poll-warmup', '챗봇'), true);

  const pub = c.pollDistribution('poll-warmup');
  assert.equal(pub.hidden, true);
  assert.deepEqual(pub.counts, {});
  assert.equal(pub.total, 2);
  assert.deepEqual(pub.entries, []);

  const inst = c.pollDistribution('poll-warmup', { forInstructor: true });
  assert.equal(inst.hidden, undefined);
  assert.deepEqual(inst.counts, { 로봇: 1, 챗봇: 1 });
  assert.deepEqual(inst.entries.map((e) => e.nickname).sort(), ['가나', '다라']);

  // 결과 공개 = 마감 + 공개
  assert.equal(c.revealResults(), true);
  assert.equal(c.activity.revealResults, true);
  assert.equal(c.activity.closed, true);
  const after = c.pollDistribution('poll-warmup');
  assert.equal(after.hidden, undefined);
  assert.equal(after.entries.length, 2);
  // 마감 후 응답은 거부
  const late = c.upsertParticipant(undefined, '마바');
  assert.equal(c.recordPoll(late.sessionId, 'poll-warmup', '늦음'), false);
  assert.equal(c.pollDistribution('poll-warmup').total, 2);
});

test('live 정책: 열자마자 공개, 마감 없음', () => {
  const c = room({ resultsReveal: 'live' });
  c.openActivity('poll-warmup', 'poll');
  assert.equal(c.activity.revealResults, true);
  c.revealResults();
  assert.equal(c.activity.closed, false);
});

test('always_anon: 롤링페이퍼 entries 에 nickname 없음, 리더보드/표시 이름은 가명', () => {
  const c = room({ anonymity: 'always_anon' });
  const a = c.upsertParticipant(undefined, '가나');
  const b = c.upsertParticipant(undefined, '다라');
  c.openActivity('poll-warmup', 'poll');
  assert.equal(c.activity.anonymous, true);
  c.recordPoll(a.sessionId, 'poll-warmup', '로봇');
  c.recordPoll(b.sessionId, 'poll-warmup', '로봇');
  c.revealResults();
  const d = c.pollDistribution('poll-warmup');
  assert.equal(d.entries.length, 2);
  for (const e of d.entries) assert.equal('nickname' in e, false);
  assert.deepEqual(d.counts, { 로봇: 2 });
  const lb = c.leaderboard();
  assert.deepEqual(lb.map((e) => e.nickname).sort(), ['익명 1', '익명 2']);
  assert.equal(c.displayName(a), '익명 1');
});

test('anon_default → 활동 anonymous:false 오버라이드는 실명; always_anon 이면 무시', () => {
  const c = room({ anonymity: 'anon_default' });
  // 샘플 덱 활동엔 오버라이드가 없으므로 기본 익명
  c.openActivity('poll-warmup', 'poll');
  assert.equal(c.activity.anonymous, true);
  // 정책 변경이 열린 활동에 즉시 반영
  c.updateSettings({ anonymity: 'always_named' });
  assert.equal(c.activity.anonymous, false);
  c.updateSettings({ anonymity: 'bogus' });
  assert.equal(c.settings.anonymity, 'always_named', '잘못된 값은 무시');
});

// ── 4. 리포트 익명 집계 ──
const deck = {
  id: 'D', title: '덱', slides: [],
  activities: {
    pollA: { type: 'poll', id: 'pollA', title: '익명투표', prompt: '?', mode: 'wordcloud', anonymous: true },
    pollB: { type: 'poll', id: 'pollB', title: '실명투표', prompt: '?', mode: 'choice', options: ['x', 'y'] },
    quizA: { type: 'quiz', id: 'quizA', title: '퀴즈', anonymous: true, questions: [{ id: 'q1', question: 'Q', options: ['a', 'b'], correctIndex: 0, timeLimitSec: 10 }] },
    quizB: { type: 'quiz', id: 'quizB', title: '퀴즈2', questions: [{ id: 'q2', question: 'Q2', options: ['a', 'b'], correctIndex: 1, timeLimitSec: 10 }] },
  },
};
const rows = (settings) => ({
  classroom: { id: 'C', token: 'ABC123', deck_id: 'D', title: 't', status: 'live', created_at: '2026-09-03T00:00:00Z', settings },
  deck,
  participants: [
    { id: 'P1', nickname: '가나', score: 10, created_at: '2026-09-03T00:00:01Z' },
    { id: 'P2', nickname: '다라', score: 5, created_at: '2026-09-03T00:00:02Z' },
  ],
  quizResponses: [
    { question_id: 'q1', participant_id: 'P1', answer: '0', is_correct: true, response_ms: 100, points: 900 },
    { question_id: 'q2', participant_id: 'P2', answer: '0', is_correct: false, response_ms: 200, points: 0 },
  ],
  pollResponses: [
    { activity_id: 'pollA', participant_id: 'P1', value: '로봇' },
    { activity_id: 'pollB', participant_id: 'P2', value: 'x' },
  ],
  aiUsages: [{ participant_id: 'P1', type: 'chat', units: 2, est_cost: 0.01 }],
  labRuns: [{ participant_id: 'P2', lab_type: 'prompt', input: 'i', config: {}, output: {}, created_at: '2026-09-03T00:00:03Z' }],
});

test('buildReport: 활동 익명 — 익명 투표는 개별 응답 제거·집계만, 익명 퀴즈는 이름 "익명"', () => {
  const r = buildReport(rows({ anonymity: 'named_default' }));
  assert.equal(r.anonymity.policy, 'named_default');
  assert.equal(r.anonymity.sessionAnonymous, false);
  assert.equal(r.pollSummary.pollA.anonymous, true);
  assert.deepEqual(r.pollSummary.pollA.votes, { 로봇: 1 });
  assert.deepEqual(r.pollSummary.pollA.studentDetails, []);
  assert.equal(r.pollSummary.pollB.anonymous, false);
  assert.deepEqual(r.pollSummary.pollB.studentDetails, [{ nickname: '다라', value: 'x' }]);
  assert.equal(r.quizSummary.q1.anonymous, true);
  assert.equal(r.quizSummary.q1.studentDetails[0].nickname, '익명');
  assert.equal(r.quizSummary.q2.studentDetails[0].nickname, '다라');
  assert.equal(r.participants[0].nickname, '가나');
  assert.equal(r.labSummary[0].nickname, '다라');
  assert.equal(r.participantAiUsages[0].nickname, '가나');
  assert.equal(JSON.stringify(r).includes('가나'), true);
});

test('buildReport: 세션 익명(always_anon) — 리포트 어디에도 실명이 없다', () => {
  const r = buildReport(rows({ anonymity: 'always_anon' }));
  assert.equal(r.anonymity.sessionAnonymous, true);
  const json = JSON.stringify(r);
  assert.equal(json.includes('가나'), false);
  assert.equal(json.includes('다라'), false);
  assert.deepEqual(r.participants.map((p) => p.nickname), ['익명 1', '익명 2']);
  assert.equal(r.quizSummary.q2.anonymous, true);
  assert.equal(r.quizSummary.q2.studentDetails[0].nickname, '익명');
  assert.deepEqual(r.pollSummary.pollB.studentDetails, []);
  assert.equal(r.labSummary[0].nickname, '익명 2');
  assert.equal(r.participantAiUsages[0].nickname, '익명 1');
});

test('buildReport: settings 없는 옛 강의실은 named_default 로 취급', () => {
  const r = buildReport(rows(null));
  assert.equal(r.anonymity.policy, 'named_default');
  assert.equal(r.participants[0].nickname, '가나');
});
