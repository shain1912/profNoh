import type { Deck, Activity } from '../../../shared/types';
import { getDeckSync } from './registry';

export { ensureDeckLoaded, registerDeck } from './registry';

export function getDeck(id: string): Deck | undefined {
  return getDeckSync(id);
}

/** 학생/클라이언트에 보낼 때 퀴즈 정답(correctIndex, explanation)을 제거한 버전 */
export function toPublicDeck(deck: Deck): Deck {
  const activities: Record<string, Activity> = {};
  for (const [key, a] of Object.entries(deck.activities)) {
    if (a.type === 'quiz') {
      activities[key] = {
        ...a,
        questions: a.questions.map((q) => ({
          id: q.id,
          question: q.question,
          options: q.options,
          timeLimitSec: q.timeLimitSec,
        })),
      };
    } else if (a.type === 'chat') {
      // systemPrompt 는 비밀은 아니지만 클라이언트에 굳이 노출하지 않음
      const { systemPrompt, ...rest } = a;
      activities[key] = rest as Activity;
    } else {
      activities[key] = a;
    }
  }
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
