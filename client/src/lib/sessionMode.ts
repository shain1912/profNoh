// 세션 유형(교실/강당) 읽기 — 참가자 화면 카피 톤 결정에 사용
//
// `settings.mode` 필드 자체는 강당 입장 워커(C)가 정의한다. 여기서는 정의하지 않고
// 스냅샷 / 강의실 정보 응답 어디에 실려 오든 방어적으로 읽기만 한다:
//   - `{ mode: 'auditorium' }` 또는 `{ settings: { mode: 'auditorium' } }` → 강당
//   - 없거나 다른 값 → 교실(기존 고등학생 톤)
import { createContext, useContext, useEffect, useState } from 'react';
import { apiGet } from './api';

export type SessionMode = 'classroom' | 'auditorium';

/** 객체에서 mode 를 찾음. 명시된 값이 없으면 null */
export function detectMode(src: unknown): SessionMode | null {
  if (!src || typeof src !== 'object') return null;
  const o = src as { mode?: unknown; settings?: { mode?: unknown } | null };
  const m = o.mode ?? o.settings?.mode;
  if (m === 'auditorium') return 'auditorium';
  if (m === 'classroom') return 'classroom';
  return null;
}

/** 여러 소스 중 먼저 명시된 값. 전부 없으면 classroom */
export function readMode(...sources: unknown[]): SessionMode {
  for (const s of sources) {
    const m = detectMode(s);
    if (m) return m;
  }
  return 'classroom';
}

export const SessionModeContext = createContext<SessionMode>('classroom');

export function useSessionMode(): SessionMode {
  return useContext(SessionModeContext);
}

/**
 * 토큰 기준으로 mode 를 알아낸다.
 * 소켓 스냅샷에 mode 가 실려 오면 그것을 우선하고, 아니면 /api/classrooms/:token 응답을 사용한다.
 * (소켓 연결 전 입장 화면에서도 쓸 수 있도록 REST 폴백을 둔다)
 */
export function useResolvedSessionMode(token: string, snapshot?: unknown): SessionMode {
  const [fetched, setFetched] = useState<SessionMode | null>(null);
  const t = (token ?? '').trim().toUpperCase();

  useEffect(() => {
    if (t.length < 4) {
      setFetched(null);
      return;
    }
    let alive = true;
    apiGet<unknown>(`/api/classrooms/${t}`)
      .then((info) => {
        if (alive) setFetched(detectMode(info));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [t]);

  return detectMode(snapshot) ?? fetched ?? 'classroom';
}
