import { customAlphabet } from 'nanoid';
import type {
  Deck, Slide, Activity, QuizActivity, PollActivity, SlideLayout,
} from '../../../shared/types';

export const makeDeckId = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
export const makePin = customAlphabet('0123456789', 6);
const makeActId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const clamp = (s: unknown, max: number): string =>
  (typeof s === 'string' ? s : '').slice(0, max);

const LAYOUTS: SlideLayout[] = ['title', 'section', 'content', 'big', 'twocol'];

export function blankSlide(): Slide {
  return { id: makeActId(), part: 0, partTitle: '', layout: 'content', title: '', subtitle: '', blocks: [], notes: '' };
}

export function blankQuiz(id: string): QuizActivity {
  return {
    type: 'quiz', id, title: '새 퀴즈',
    questions: [{ id: makeActId(), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' }],
  };
}

export function blankPoll(id: string): PollActivity {
  return { type: 'poll', id, title: '새 투표', prompt: '', mode: 'wordcloud', options: [] };
}

export function blankDeck(id: string, title: string): Deck {
  return {
    id, title: clamp(title, 80) || '제목 없는 강의',
    slides: [{ ...blankSlide(), layout: 'title', title: clamp(title, 80) || '새 강의', partTitle: '시작' }],
    activities: {},
  };
}

/** 신뢰할 수 없는 덱을 안전한 Deck 으로 정규화. 절대 throw 하지 않음. */
export function validateDeck(input: unknown, id: string): Deck {
  const raw = (input ?? {}) as Partial<Deck>;
  const activities: Record<string, Activity> = {};

  for (const [key, a0] of Object.entries(raw.activities ?? {})) {
    const a = a0 as Activity;
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'quiz') {
      const questions = (a.questions ?? []).slice(0, 30).map((q) => {
        let options = (q.options ?? []).map((o) => clamp(o, 120)).filter((o, i) => i < 4);
        while (options.length < 2) options.push('');
        let ci = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
        if (ci < 0 || ci >= options.length) ci = 0;
        let t = typeof q.timeLimitSec === 'number' ? q.timeLimitSec : 20;
        t = Math.min(120, Math.max(5, t));
        return { id: clamp(q.id, 40) || makeActId(), question: clamp(q.question, 200), options, correctIndex: ci, timeLimitSec: t, explanation: clamp(q.explanation, 300) };
      });
      activities[key] = { type: 'quiz', id: key, title: clamp(a.title, 80) || '퀴즈', intro: clamp(a.intro, 200) || undefined, questions: questions.length ? questions : blankQuiz(key).questions };
    } else if (a.type === 'poll') {
      const mode = a.mode === 'choice' ? 'choice' : 'wordcloud';
      const options = mode === 'choice' ? (a.options ?? []).slice(0, 8).map((o) => clamp(o, 60)).filter(Boolean) : [];
      activities[key] = { type: 'poll', id: key, title: clamp(a.title, 80) || '투표', prompt: clamp(a.prompt, 200), mode, options };
    }
    // chat/image/lab 은 v1 저작 대상 아님 → built-in 덱에만 존재. 들어오면 무시.
  }

  let slides: Slide[] = (raw.slides ?? []).slice(0, 200).map((s) => {
    const layout: SlideLayout = LAYOUTS.includes(s.layout as SlideLayout) ? (s.layout as SlideLayout) : 'content';
    const blocks = (s.blocks ?? []).slice(0, 12)
      .map((b) => ({ kind: (['h', 'p', 'bullet', 'note', 'quote', 'callout'].includes(b.kind) ? b.kind : 'p') as Slide['blocks'][number]['kind'], text: clamp(b.text, 400) }))
      .filter((b) => b.text);
    const activityId = s.activityId && activities[s.activityId] ? s.activityId : undefined;
    return {
      id: clamp(s.id, 40) || makeActId(),
      part: typeof s.part === 'number' ? s.part : 0,
      partTitle: clamp(s.partTitle, 60),
      layout,
      title: clamp(s.title, 120) || undefined,
      subtitle: clamp(s.subtitle, 160) || undefined,
      blocks,
      notes: clamp(s.notes, 400) || undefined,
      activityId,
    };
  });

  if (slides.length === 0) {
    slides = blankDeck(id, clamp(raw.title, 80) || '새 강의').slides;
  }

  return { id, title: clamp(raw.title, 80) || '제목 없는 강의', slides, activities };
}
