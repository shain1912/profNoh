import type { Deck, DeckSummary, CreateDeckResponse, DeckEditResponse, GenerateDeckRequest } from '@shared/types';
import { apiGet, apiPost, apiPut, apiDelete } from './api';

const MINE = 'axedu_my_decks';
export interface MyDeck { deckId: string; title: string; pin: string; }

export function getMyDecks(): MyDeck[] {
  try { return JSON.parse(localStorage.getItem(MINE) ?? '[]'); } catch { return []; }
}
export function rememberDeck(d: MyDeck) {
  const list = getMyDecks().filter((x) => x.deckId !== d.deckId);
  list.unshift(d);
  localStorage.setItem(MINE, JSON.stringify(list.slice(0, 50)));
}
export function getPin(deckId: string): string {
  return getMyDecks().find((d) => d.deckId === deckId)?.pin ?? '';
}
export function forgetDeck(deckId: string) {
  localStorage.setItem(MINE, JSON.stringify(getMyDecks().filter((d) => d.deckId !== deckId)));
}

export const createDeck = (title: string) => apiPost<CreateDeckResponse>('/api/decks', { title });
export const listDecks = () => apiGet<DeckSummary[]>('/api/decks');
export const openDeckForEdit = (deckId: string, editPin: string) =>
  apiPost<DeckEditResponse>(`/api/decks/${deckId}/edit`, { editPin });
export const saveDeck = (deckId: string, editPin: string, deck: Deck) =>
  apiPut<{ ok: boolean }>(`/api/decks/${deckId}`, { deckId, editPin, deck });
export const deleteDeck = (deckId: string, editPin: string) =>
  apiDelete<{ ok: boolean }>(`/api/decks/${deckId}`, { editPin });

export const generateDeck = (body: GenerateDeckRequest) =>
  apiPost<CreateDeckResponse>('/api/decks/generate', body);
