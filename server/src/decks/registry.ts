import type { Deck } from '../../../shared/types';
import { aiAx4h } from './ai-ax-4h';
import { loadDeckRow } from './store';

const registry = new Map<string, Deck>();
registry.set(aiAx4h.id, aiAx4h); // built-in

export function registerDeck(deck: Deck): void {
  registry.set(deck.id, deck);
}

/** 동기: 레지스트리에 있는 덱만 반환 (런타임 socket.ts 용) */
export function getDeckSync(id: string): Deck | undefined {
  return registry.get(id);
}

/** 비동기: 없으면 DB에서 로드해 등록 후 반환 (강의실 생성/편집 진입점 용) */
export async function ensureDeckLoaded(id: string): Promise<Deck | null> {
  const cached = registry.get(id);
  if (cached) return cached;
  const row = await loadDeckRow(id);
  if (!row?.data) return null;
  registry.set(id, row.data);
  return row.data;
}
