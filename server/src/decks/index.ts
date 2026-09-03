import type { Deck, Activity } from '../../../shared/types';
import { getDeckSync } from './registry';

export { ensureDeckLoaded, registerDeck, unregisterDeck } from './registry';

export function getDeck(id: string): Deck | undefined {
  return getDeckSync(id);
}

/** 활동 1개의 공개 버전 — 퀴즈 정답·OX 정답·chat systemPrompt 제거 (즉석 활동 전송에도 사용) */
export function toPublicActivity(a: Activity): Activity {
  if (a.type === 'quiz') {
    return {
      ...a,
      questions: a.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        timeLimitSec: q.timeLimitSec,
      })),
    };
  }
  if (a.type === 'ox') {
    const { answer, explanation, ...rest } = a;
    return rest as Activity;
  }
  if (a.type === 'chat') {
    // systemPrompt 는 비밀은 아니지만 클라이언트에 굳이 노출하지 않음
    const { systemPrompt, ...rest } = a;
    return rest as Activity;
  }
  return a;
}

/** 학생/클라이언트에 보낼 때 퀴즈 정답(correctIndex, explanation)을 제거한 버전 */
export function toPublicDeck(deck: Deck): Deck {
  const activities: Record<string, Activity> = {};
  for (const [key, a] of Object.entries(deck.activities)) activities[key] = toPublicActivity(a);
  return { ...deck, activities };
}

export function getQuizActivity(deckId: string, activityId: string) {
  const deck = getDeck(deckId);
  if (!deck) return undefined;
  const a = deck.activities[activityId];
  return a && a.type === 'quiz' ? a : undefined;
}

export function getActivity(deckId: string, activityId: string): Activity | undefined {
  return getDeck(deckId)?.activities[activityId];
}
