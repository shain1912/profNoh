import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeck, blankDeck, blankSlide, blankQuiz, blankPoll } from '../src/decks/validate.ts';

test('blankDeck: 최소 유효 덱', () => {
  const d = blankDeck('DCK001', '테스트 강의');
  const v = validateDeck(d, 'DCK001');
  assert.equal(v.id, 'DCK001');
  assert.equal(v.title, '테스트 강의');
  assert.ok(Array.isArray(v.slides));
});

test('validateDeck: 슬라이드 제목 길이 제한(120자)', () => {
  const d = blankDeck('DCK002', 't');
  d.slides.push({ ...blankSlide(), title: 'x'.repeat(500) });
  const v = validateDeck(d, 'DCK002');
  assert.ok(v.slides[v.slides.length - 1].title.length <= 120);
});

test('validateDeck: 퀴즈 보기 2~4개 강제, correctIndex 범위 보정', () => {
  const d = blankDeck('DCK003', 't');
  const q = blankQuiz('q1');
  q.questions[0].options = ['a', 'b', 'c', 'd', 'e', 'f'];
  q.questions[0].correctIndex = 99;
  d.activities['q1'] = q;
  d.slides.push({ ...blankSlide(), activityId: 'q1' });
  const v = validateDeck(d, 'DCK003');
  const vq = v.activities['q1'];
  assert.equal(vq.type, 'quiz');
  assert.ok(vq.questions[0].options.length <= 4 && vq.questions[0].options.length >= 2);
  assert.ok(vq.questions[0].correctIndex >= 0 && vq.questions[0].correctIndex < vq.questions[0].options.length);
});

test('validateDeck: 활동 없는 activityId 참조 제거', () => {
  const d = blankDeck('DCK004', 't');
  d.slides.push({ ...blankSlide(), activityId: 'ghost' });
  const v = validateDeck(d, 'DCK004');
  assert.equal(v.slides[v.slides.length - 1].activityId, undefined);
});

test('validateDeck: 빈 슬라이드 0개면 기본 표지 1장 보장', () => {
  const d = blankDeck('DCK005', '강의X');
  d.slides = [];
  const v = validateDeck(d, 'DCK005');
  assert.ok(v.slides.length >= 1);
});

test('blankPoll: wordcloud 기본', () => {
  const p = blankPoll('p1');
  assert.equal(p.type, 'poll');
  assert.equal(p.mode, 'wordcloud');
});
