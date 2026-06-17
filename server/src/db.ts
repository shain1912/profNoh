import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env, hasSupabase } from './env';

// Node < 22 는 native WebSocket 이 없어 supabase-js realtime 초기화가 크래시함.
// realtime 은 사용하지 않지만 createClient 가 내부적으로 생성하므로 전역 WebSocket 을 주입.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket as unknown;
}

// service_role 키로 접속 → RLS 우회 (서버 전용). 클라이언트엔 절대 노출 금지.
export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!supabase) {
  console.warn(
    '[db] Supabase 미설정 — DB 기록이 비활성화됩니다(.env 의 SUPABASE_SERVICE_ROLE_KEY 확인). ' +
      '라이브 진행은 메모리 상태로 동작합니다.',
  );
}

/** DB가 없거나 실패해도 라이브 진행은 막지 않도록 안전 래퍼 */
export async function dbSafe<T>(fn: (sb: SupabaseClient) => PromiseLike<T>): Promise<T | null> {
  if (!supabase) return null;
  try {
    return await fn(supabase);
  } catch (e) {
    console.error('[db] 오류:', (e as Error).message);
    return null;
  }
}
