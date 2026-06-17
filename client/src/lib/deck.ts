import type { Deck } from '@shared/types';
import { apiGet } from './api';

const cache: Record<string, Deck> = {};

export async function loadDeck(id: string): Promise<Deck> {
  if (cache[id]) return cache[id];
  const d = await apiGet<Deck>(`/api/decks/${id}`);
  cache[id] = d;
  return d;
}
