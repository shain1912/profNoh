import type { Activity, ActivityType, Deck, Slide } from '@shared/types';
import { ACTIVITY_DEFS } from '../activities/registry';

const rid = () => Math.random().toString(36).slice(2, 10);

export type PageKind = ActivityType | 'slide';

export function pageKind(deck: Deck, slide: Slide): PageKind {
  if (!slide.activityId) return 'slide';
  const a = deck.activities[slide.activityId];
  return a ? a.type : 'slide';
}

export function newSlide(): Slide {
  return { id: rid(), part: 0, partTitle: '', layout: 'content', title: '새 슬라이드', subtitle: '', blocks: [], notes: '' };
}

export function addPage(deck: Deck, kind: PageKind, at: number): Deck {
  const slides = [...deck.slides];
  const activities = { ...deck.activities };
  const slide = newSlide();
  if (kind !== 'slide') {
    const def = ACTIVITY_DEFS[kind];
    const id = kind.slice(0, 2) + '_' + rid();
    const act = def.blank(id);
    activities[id] = act;
    slide.activityId = id;
    slide.title = act.title;
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

export function updateActivity(deck: Deck, activityId: string, next: Activity): Deck {
  return { ...deck, activities: { ...deck.activities, [activityId]: next } };
}
