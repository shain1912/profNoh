import { dbSafe } from '../db';
import type { Deck, DeckSummary } from '../../../shared/types';

interface DeckRow { id: string; title: string; data: Deck; edit_pin: string; updated_at: string; user_id: string | null; }

export async function loadDeckRow(id: string): Promise<DeckRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_decks').select('id,title,data,edit_pin,updated_at,user_id').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as DeckRow) ?? null;
  });
}

export async function insertDeckRow(deck: Deck, pin: string, userId?: string | null): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').insert({ id: deck.id, title: deck.title, data: deck, edit_pin: pin, user_id: userId || null });
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function updateDeckRow(deck: Deck, userId?: string | null): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const updateData: any = { title: deck.title, data: deck, updated_at: new Date().toISOString() };
    if (userId) {
      updateData.user_id = userId;
    }
    const res = await sb.from('axedu_decks').update(updateData).eq('id', deck.id);
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function listDeckRows(userId?: string | null): Promise<DeckSummary[]> {
  const r = await dbSafe(async (sb) => {
    let query = sb.from('axedu_decks').select('id,title,data,updated_at,user_id').order('updated_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const res = await query.limit(100);
    if (res.error) throw res.error;
    return (res.data ?? []) as { id: string; title: string; data: Deck; updated_at: string }[];
  });
  return (r ?? []).map((row) => ({ id: row.id, title: row.title, slideCount: row.data?.slides?.length ?? 0, updatedAt: row.updated_at }));
}
