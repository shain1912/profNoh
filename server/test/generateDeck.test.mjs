import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeckJson } from '../src/ai/generateDeck.ts';

const SAMPLE = JSON.stringify({
  title: '생성형 AI 입문',
  sections: [
    { partTitle: 'AI란?', slides: [{ title: 'AI 정의', subtitle: '', bullets: ['컴퓨터가 학습', '예측한다'], notes: '천천히' }],
      quiz: [{ question: 'AI는 검색인가?', options: ['그렇다', '아니다', '가끔', '모름'], correctIndex: 1, explanation: '예측이다' }] },
  ],
});

test('parseDeckJson: 정상 JSON → 슬라이드+퀴즈+표지+투표', () => {
  const d = parseDeckJson(SAMPLE, 'DCKAI1', '생성형 AI 입문');
  assert.equal(d.id, 'DCKAI1');
  assert.ok(d.slides.length >= 4, 'slides=' + d.slides.length);
  const hasPoll = Object.values(d.activities).some((a) => a.type === 'poll');
  const hasQuiz = Object.values(d.activities).some((a) => a.type === 'quiz');
  assert.ok(hasPoll, 'poll 있어야');
  assert.ok(hasQuiz, 'quiz 있어야');
});

test('parseDeckJson: 코드펜스로 감싼 JSON도 파싱', () => {
  const fenced = '```json\n' + SAMPLE + '\n```';
  const d = parseDeckJson(fenced, 'DCKAI2', '제목');
  assert.ok(d.slides.length >= 4);
});

test('parseDeckJson: 쓰레기 입력 → 폴백(표지+투표 보장, 크래시 없음)', () => {
  const d = parseDeckJson('이건 JSON이 아니야 미안', 'DCKAI3', '안전강의');
  assert.ok(d.slides.length >= 1);
  assert.equal(d.id, 'DCKAI3');
});

test('parseDeckJson: 퀴즈 correctIndex 범위 밖 → validateDeck가 보정', () => {
  const bad = JSON.stringify({ title: 't', sections: [{ partTitle: 'p', slides: [], quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 9, explanation: '' }] }] });
  const d = parseDeckJson(bad, 'DCKAI4', 't');
  const q = Object.values(d.activities).find((a) => a.type === 'quiz');
  assert.ok(q && q.questions[0].correctIndex >= 0 && q.questions[0].correctIndex < q.questions[0].options.length);
});
