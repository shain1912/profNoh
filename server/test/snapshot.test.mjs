// ClassroomState 스냅샷 직렬화 왕복 단위 테스트 — node --import tsx --test server/test/snapshot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClassroomState } from '../src/state.ts';

test('exportState → restore 왕복: 토큰·슬라이드·점수·투표·질문·즉석 활동이 유지된다', () => {
  const c = new ClassroomState('ai-ax-4h', '왕복', { mode: 'auditorium' });
  c.ownerId = 'user-1';
  c.updateSettings({ anonymity: 'always_anon', resultsReveal: 'live' });
  const a = c.upsertParticipant('sid-a', '가');
  const b = c.upsertParticipant('sid-b', '나');
  c.gotoSlide(4);
  c.clearRoleplay('sid-a', 'rp1'); // +500
  const ox = c.createQuickOx({ question: '지구는 둥글다', answer: 'O', timeLimitSec: 20 });
  c.openActivity(ox.id, 'ox');
  c.quizStartQuestion();
  c.recordQuizAnswer('sid-b', `${ox.id}:q`, 0);
  c.recordPoll('sid-a', 'poll-x', '복원');
  c.recordPoll('sid-b', 'poll-x', '복원');
  const q = c.askQuestion('스냅샷은 언제 저장되나요');
  c.upvoteQuestion('sid-a', q.id);
  c.countUsage('sid-a', 'chat-1', 'chat');
  c.addCost(0.25);
  c.setQaSettings({ moderation: true });
  a.socketId = 'sock-a'; // 프로세스 종속 값 — 직렬화에서 빠져야 함

  const json = JSON.parse(JSON.stringify(c.exportState()));
  assert.equal(json.v, 1);
  assert.equal(json.participants.find((p) => p.sessionId === 'sid-a').socketId, undefined);

  const r = ClassroomState.restore(json);
  assert.ok(r);
  assert.equal(r.id, c.id);
  assert.equal(r.token, c.token);
  assert.equal(r.instructorSecret, c.instructorSecret);
  assert.equal(r.ownerId, 'user-1');
  assert.equal(r.mode, 'auditorium');
  assert.equal(r.settings.anonymity, 'always_anon');
  assert.equal(r.currentSlide, 4);
  assert.equal(r.status, 'live');
  assert.equal(r.getBySession('sid-a')?.score, 500);
  assert.equal(r.getBySession('sid-a')?.id, a.id);
  assert.equal(r.getBySession('sid-b')?.score, b.score);
  assert.equal(r.getBySession('sid-a')?.socketId, undefined);
  assert.equal(r.participantCount(), 0); // 아무도 연결돼 있지 않음
  assert.equal(r.totalParticipants(), 2);
  // 열린 즉석 OX 활동 + 진행 중 문항 + 응답 수
  assert.equal(r.activity?.activityId, ox.id);
  assert.equal(r.activity?.quiz?.phase, 'question');
  assert.equal(r.resolveActivity(ox.id)?.type, 'ox');
  assert.equal(r.answeredCount(), 1);
  assert.equal(r.recordQuizAnswer('sid-b', `${ox.id}:q`, 1), null); // 이미 응답 → 중복 차단 유지
  // 투표 분포 (익명 세션이라 entries 에 이름 없음)
  const dist = r.pollDistribution('poll-x', { forInstructor: true });
  assert.equal(dist.total, 2);
  assert.equal(dist.counts['복원'], 2);
  // 질문·업보트(1인 1회) 유지
  assert.equal(r.getQuestions()[0]?.text, '스냅샷은 언제 저장되나요');
  assert.equal(r.getQuestions()[0]?.upvotes, 1);
  assert.equal(r.upvoteQuestion('sid-a', q.id), null);
  assert.equal(r.qa.moderation, true);
  // 쿼터·예산
  assert.equal(r.budgetSpent, 0.25);
  assert.equal(r.checkUsage('sid-a', 'chat-1', 'chat').ok, true);
  // 리더보드는 가명(always_anon) — 나(정답 1000점)가 1위, 가(역할극 500점)가 2위
  assert.ok(b.score > 500);
  assert.deepEqual(r.leaderboard().map((e) => [e.nickname, e.score]), [['익명 2', b.score], ['익명 1', 500]]);
});

test('restore: 알 수 없는 형식·필수 값 누락은 null, 종료 상태는 그대로', () => {
  assert.equal(ClassroomState.restore(null), null);
  assert.equal(ClassroomState.restore({ v: 2 }), null);
  assert.equal(ClassroomState.restore({ v: 1, id: 'x' }), null);
  const c = new ClassroomState('ai-ax-4h');
  c.end();
  const r = ClassroomState.restore(JSON.parse(JSON.stringify(c.exportState())));
  assert.equal(r?.status, 'ended');
});

test('upsertParticipant seed: DB 행의 id·점수로 복원, 이미 있으면 seed 무시', () => {
  const c = new ClassroomState('ai-ax-4h');
  const p = c.upsertParticipant('sid-db', '복귀', { id: 'pid-from-db', score: 1200 });
  assert.equal(p.id, 'pid-from-db');
  assert.equal(p.score, 1200);
  const again = c.upsertParticipant('sid-db', '복귀', { id: 'other', score: 1 });
  assert.equal(again.id, 'pid-from-db');
  assert.equal(again.score, 1200);
});

test('end(): 상태 ended + 활동 닫힘, 두 번째는 false', () => {
  const c = new ClassroomState('ai-ax-4h');
  c.openActivity('poll-x', 'poll');
  assert.equal(c.end(), true);
  assert.equal(c.status, 'ended');
  assert.equal(c.activity, null);
  assert.equal(c.end(), false);
});
