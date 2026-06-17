import { dbSafe } from '../db';
import type { Deck, DeckSummary } from '../../../shared/types';

interface DeckRow { id: string; title: string; data: Deck; edit_pin: string; updated_at: string; }

export async function loadDeckRow(id: string): Promise<DeckRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_decks').select('id,title,data,edit_pin,updated_at').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as DeckRow) ?? null;
  });
}

export async function insertDeckRow(deck: Deck, pin: string): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').insert({ id: deck.id, title: deck.title, data: deck, edit_pin: pin });
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function updateDeckRow(deck: Deck): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').update({ title: deck.title, data: deck, updated_at: new Date().toISOString() }).eq('id', deck.id);
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function listDeckRows(): Promise<DeckSummary[]> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').select('id,title,data,updated_at').order('updated_at', { ascending: false }).limit(100);
    if (res.error) throw res.error;
    return (res.data ?? []) as { id: string; title: string; data: Deck; updated_at: string }[];
  });
  return (r ?? []).map((row) => ({ id: row.id, title: row.title, slideCount: row.data?.slides?.length ?? 0, updatedAt: row.updated_at }));
}
