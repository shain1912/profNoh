// 코드로 관리하는 덱을 DB(axedu_decks)에 올리는 스크립트 — 강사 계정 소유로 등록해 /build 에서 편집할 수 있게 한다.
// 사용: npx tsx server/src/decks/seed.ts <deckExport> <ownerEmail>
//   예: npx tsx server/src/decks/seed.ts gyeongnamAviation3h shain1912@gmail.com
// 이미 있으면 내용만 덮어쓴다(편집 PIN·소유자 유지).
import { supabase } from '../db';
import { validateDeck, makePin } from './validate';
import { loadDeckRow, insertDeckRow, updateDeckRow } from './store';
import { gyeongnamAviation3h } from './gyeongnam-aviation-3h';
import type { Deck } from '../../../shared/types';

const DECKS: Record<string, Deck> = { gyeongnamAviation3h };

async function main() {
  const [name, email] = process.argv.slice(2);
  const src = DECKS[name ?? ''];
  if (!src || !email) {
    console.error(`사용: seed.ts <${Object.keys(DECKS).join('|')}> <ownerEmail>`);
    process.exit(1);
  }
  if (!supabase) throw new Error('Supabase 설정 없음 (.env)');
  const u = await supabase.from('axedu_users').select('id,email').eq('email', email.toLowerCase()).maybeSingle();
  if (u.error || !u.data) throw new Error(`axedu_users 에서 ${email} 을 찾지 못함 — 먼저 한 번 로그인해야 함`);

  const deck = validateDeck(src, src.id);
  const existing = await loadDeckRow(deck.id);
  if (existing) {
    if (!(await updateDeckRow(deck))) throw new Error('덱 갱신 실패');
    console.log(`[seed] 갱신 ${deck.id} "${deck.title}" — 슬라이드 ${deck.slides.length}, 활동 ${Object.keys(deck.activities).length}`);
  } else {
    const pin = makePin();
    if (!(await insertDeckRow(deck, pin, u.data.id))) throw new Error('덱 등록 실패');
    console.log(`[seed] 등록 ${deck.id} "${deck.title}" — 슬라이드 ${deck.slides.length}, 활동 ${Object.keys(deck.activities).length}, 편집 PIN ${pin}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
