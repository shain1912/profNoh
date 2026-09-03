// 토큰 버킷 · 브로드캐스트 배치 단위 테스트 — node --import tsx --test server/test/ratelimit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucketSet, Batcher } from '../src/ratelimit.ts';
import { ClassroomState } from '../src/state.ts';

test('TokenBucketSet: burst 만큼 허용 후 거부, 첫 거부에만 warn, 시간 경과로 충전', () => {
  const b = new TokenBucketSet();
  const rule = { rate: 1, burst: 3 };
  let now = 1_000_000;
  assert.deepEqual(b.take('k', rule, now), { ok: true, warn: false });
  assert.deepEqual(b.take('k', rule, now), { ok: true, warn: false });
  assert.deepEqual(b.take('k', rule, now), { ok: true, warn: false });
  assert.deepEqual(b.take('k', rule, now), { ok: false, warn: true });
  assert.deepEqual(b.take('k', rule, now), { ok: false, warn: false }); // 두 번째 거부는 조용히
  now += 1000; // 1초 → 1토큰
  assert.deepEqual(b.take('k', rule, now), { ok: true, warn: false });
  assert.deepEqual(b.take('k', rule, now), { ok: false, warn: true }); // 다시 첫 거부
  now += 60_000; // 오래 지나도 burst 를 넘지 않음
  assert.equal(b.take('k', rule, now).ok, true);
  assert.equal(b.take('k', rule, now).ok, true);
  assert.equal(b.take('k', rule, now).ok, true);
  assert.equal(b.take('k', rule, now).ok, false);
});

test('TokenBucketSet: 키별 독립', () => {
  const b = new TokenBucketSet();
  const rule = { rate: 1, burst: 1 };
  assert.equal(b.take('a', rule, 0).ok, true);
  assert.equal(b.take('a', rule, 0).ok, false);
  assert.equal(b.take('b', rule, 0).ok, true);
});

test('Batcher: 창 안의 요청은 마지막 1건으로 합쳐져 1회 실행', async () => {
  const b = new Batcher();
  const calls = [];
  for (let i = 0; i < 20; i++) b.schedule('k', 30, () => calls.push(i));
  assert.equal(b.pending('k'), true);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, [19]);
  assert.equal(b.pending('k'), false);
});

test('Batcher: flush 는 예약을 취소하고 즉시 실행, cancelPrefix 는 접두사 예약 취소', async () => {
  const b = new Batcher();
  const calls = [];
  b.schedule('c1|poll|a', 30, () => calls.push('late'));
  b.flush('c1|poll|a', () => calls.push('now'));
  b.schedule('c1|poll|b', 30, () => calls.push('b'));
  b.schedule('c2|poll|a', 30, () => calls.push('c2'));
  b.cancelPrefix('c1|');
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, ['now', 'c2']);
});

test('pollDistribution 캐시: 같은 상태면 같은 객체, 표·정책·공개가 바뀌면 재계산', () => {
  const c = new ClassroomState('ai-ax-4h');
  c.updateSettings({ resultsReveal: 'live' });
  const a = c.upsertParticipant(undefined, '가나');
  const b = c.upsertParticipant(undefined, '다라');
  c.openActivity('poll-warmup', 'poll');
  c.recordPoll(a.sessionId, 'poll-warmup', '로봇');
  const d1 = c.pollDistribution('poll-warmup');
  const d2 = c.pollDistribution('poll-warmup');
  assert.equal(d1, d2, '캐시 히트 시 동일 객체');
  c.recordPoll(b.sessionId, 'poll-warmup', '챗봇');
  const d3 = c.pollDistribution('poll-warmup');
  assert.notEqual(d1, d3);
  assert.equal(d3.total, 2);
  // 익명 정책 변경 → entries 에서 닉네임이 빠져야 하므로 재계산
  c.updateSettings({ anonymity: 'always_anon' });
  const d4 = c.pollDistribution('poll-warmup');
  assert.notEqual(d3, d4);
  assert.ok(d4.entries.every((e) => !('nickname' in e)));
  // 닉네임 변경도 무효화
  c.updateSettings({ anonymity: 'named_default' });
  const d5 = c.pollDistribution('poll-warmup');
  c.upsertParticipant(a.sessionId, '가나2');
  const d6 = c.pollDistribution('poll-warmup');
  assert.notEqual(d5, d6);
  assert.ok(d6.entries.some((e) => e.nickname === '가나2'));
  // 참가자용 집계에는 entries 가 없다
  const agg = c.pollAggregate('poll-warmup');
  assert.equal(agg.total, 2);
  assert.equal('entries' in agg, false);
  assert.deepEqual(agg.counts, { 로봇: 1, 챗봇: 1 });
});

test('pollAggregate: 미공개면 hidden 그대로', () => {
  const c = new ClassroomState('ai-ax-4h'); // 기본 after_close
  const a = c.upsertParticipant(undefined, '가나');
  c.openActivity('poll-warmup', 'poll');
  c.recordPoll(a.sessionId, 'poll-warmup', '로봇');
  const agg = c.pollAggregate('poll-warmup');
  assert.equal(agg.hidden, true);
  assert.equal(agg.total, 1);
  assert.deepEqual(agg.counts, {});
});

test('rankBySession: 점수순 순위', () => {
  const c = new ClassroomState('ai-ax-4h');
  const a = c.upsertParticipant(undefined, '가나');
  const b = c.upsertParticipant(undefined, '다라');
  b.score = 700;
  a.score = 300;
  const r = c.rankBySession();
  assert.deepEqual(r.get(b.sessionId), { score: 700, rank: 1 });
  assert.deepEqual(r.get(a.sessionId), { score: 300, rank: 2 });
});
