import { customAlphabet } from 'nanoid';
import type {
  Deck, Slide, Activity, QuizActivity, PollActivity, SlideLayout,
} from '../../../shared/types';

export const makeDeckId = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
export const makePin = customAlphabet('0123456789', 6);
const makeActId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const clamp = (s: unknown, max: number): string =>
  (typeof s === 'string' ? s : '').slice(0, max);

const LAYOUTS: SlideLayout[] = ['title', 'section', 'content', 'big', 'twocol', 'pdf'];

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
    } else if (a.type === 'roleplay') {
      activities[key] = {
        type: 'roleplay',
        id: key,
        title: clamp(a.title, 80) || 'AI 역할극',
        intro: clamp(a.intro, 200) || undefined,
        systemPrompt: clamp(a.systemPrompt, 1000) || '너는 가이드야.',
        missionKeyword: clamp(a.missionKeyword, 100) || '',
        missionDescription: clamp(a.missionDescription, 300) || '',
      };
    } else if (a.type === 'analogy') {
      activities[key] = {
        type: 'analogy',
        id: key,
        title: clamp(a.title, 80) || '눈높이 비유',
        intro: clamp(a.intro, 200) || undefined,
        topicPlaceholder: clamp(a.topicPlaceholder, 100) || undefined,
        personaA: clamp(a.personaA, 300) || '7세 아동 눈높이 비유',
        personaB: clamp(a.personaB, 300) || '고등학생 맞춤 일상 비유',
      };
    } else if (a.type === 'writing') {
      activities[key] = {
        type: 'writing',
        id: key,
        title: clamp(a.title, 80) || '문학 창작',
        intro: clamp(a.intro, 200) || undefined,
        genre: ['poem', 'story', 'essay'].includes(a.genre) ? a.genre : 'poem',
        promptPlaceholder: clamp(a.promptPlaceholder, 100) || undefined,
      };
    } else if (a.type === 'tutor') {
      activities[key] = {
        type: 'tutor',
        id: key,
        title: clamp(a.title, 80) || 'AI 튜터',
        intro: clamp(a.intro, 200) || undefined,
        subject: ['math', 'coding', 'general'].includes(a.subject) ? a.subject : 'general',
        taskDescription: clamp(a.taskDescription, 500) || '문제를 입력해 보세요.',
      };
    } else if (a.type === 'chat') {
      activities[key] = {
        type: 'chat',
        id: key,
        title: clamp(a.title, 80) || 'AI 대화',
        intro: clamp(a.intro, 200) || undefined,
        systemPrompt: clamp(a.systemPrompt, 1000) || undefined,
        missions: Array.isArray(a.missions) ? a.missions.map((m) => clamp(m, 120)) : undefined,
      };
    } else if (a.type === 'image') {
      activities[key] = {
        type: 'image',
        id: key,
        title: clamp(a.title, 80) || '이미지 생성',
        intro: clamp(a.intro, 200) || undefined,
        suggestions: Array.isArray(a.suggestions) ? a.suggestions.map((s) => clamp(s, 100)) : undefined,
      };
    } else if (a.type === 'lab') {
      activities[key] = {
        type: 'lab',
        id: key,
        labType: ['prompt', 'context', 'harness'].includes(a.labType) ? a.labType : 'prompt',
        title: clamp(a.title, 80) || '비교 실습',
        intro: clamp(a.intro, 200) || undefined,
        task: clamp(a.task, 500) || '비교 분석해보세요.',
        inputPlaceholder: clamp(a.inputPlaceholder, 100) || undefined,
        labelA: clamp(a.labelA, 60) || 'A안',
        labelB: clamp(a.labelB, 60) || 'B안',
      };
    }
  }

  let slides: Slide[] = (raw.slides ?? []).slice(0, 200).map((s) => {
    const layout: SlideLayout = LAYOUTS.includes(s.layout as SlideLayout) ? (s.layout as SlideLayout) : 'content';
    const blocks = (s.blocks ?? []).slice(0, 12)
      .map((b) => ({ kind: (['h', 'p', 'bullet', 'note', 'quote', 'callout'].includes(b.kind) ? b.kind : 'p') as NonNullable<Slide['blocks']>[number]['kind'], text: clamp(b.text, 400) }))
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
      pdfUrl: s.pdfUrl ? clamp(s.pdfUrl, 300) : undefined,
      pageNumber: typeof s.pageNumber === 'number' ? s.pageNumber : undefined,
      youtubeUrl: s.youtubeUrl ? clamp(s.youtubeUrl, 300) : undefined,
    };
  });

  if (slides.length === 0) {
    slides = blankDeck(id, clamp(raw.title, 80) || '새 강의').slides;
  }

  return { id, title: clamp(raw.title, 80) || '제목 없는 강의', slides, activities };
}
