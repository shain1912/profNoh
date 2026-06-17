import type { Deck, Slide, QuizActivity, PollActivity } from '@shared/types';

const rid = () => Math.random().toString(36).slice(2, 10);

export type PageKind = 'slide' | 'quiz' | 'poll';

export function pageKind(deck: Deck, slide: Slide): PageKind {
  if (!slide.activityId) return 'slide';
  const a = deck.activities[slide.activityId];
  return a?.type === 'quiz' ? 'quiz' : a?.type === 'poll' ? 'poll' : 'slide';
}

export function newSlide(): Slide {
  return { id: rid(), part: 0, partTitle: '', layout: 'content', title: '새 슬라이드', subtitle: '', blocks: [], notes: '' };
}

export function addPage(deck: Deck, kind: PageKind, at: number): Deck {
  const slides = [...deck.slides];
  const activities = { ...deck.activities };
  const slide = newSlide();
  if (kind === 'quiz') {
    const id = 'q_' + rid();
    const q: QuizActivity = { type: 'quiz', id, title: '새 퀴즈', questions: [{ id: rid(), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' }] };
    activities[id] = q; slide.activityId = id; slide.title = '퀴즈';
  } else if (kind === 'poll') {
    const id = 'p_' + rid();
    const p: PollActivity = { type: 'poll', id, title: '새 투표', prompt: '', mode: 'wordcloud', options: [] };
    activities[id] = p; slide.activityId = id; slide.title = '투표';
  }
  slides.splice(at + 1, 0, slide);
  return { ...deck, slides, activities };
}

export function deletePage(deck: Deck, index: number): Deck {
  const slides = deck.slides.filter((_, i) => i !== index);
  return { ...deck, slides: slides.length ? slides : deck.slides };
}

export function movePage(deck: Deck, index: number, dir: -1 | 1): Deck {
  const j = index + dir;
  if (j < 0 || j >= deck.slides.length) return deck;
  const slides = [...deck.slides];
  [slides[index], slides[j]] = [slides[j], slides[index]];
  return { ...deck, slides };
}

export function updateSlide(deck: Deck, index: number, patch: Partial<Slide>): Deck {
  const slides = deck.slides.map((s, i) => (i === index ? { ...s, ...patch } : s));
  return { ...deck, slides };
}

export function updateActivity(deck: Deck, activityId: string, next: QuizActivity | PollActivity): Deck {
  return { ...deck, activities: { ...deck.activities, [activityId]: next } };
}
