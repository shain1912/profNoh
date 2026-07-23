const SID = 'axedu_session_id';
const NICK = 'axedu_nick';

// crypto.randomUUID 는 보안 컨텍스트(HTTPS/localhost)에서만 동작.
// 배포가 HTTP(IP)일 수 있으므로 폴백을 둔다.
export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getSessionId(): string {
  let v = localStorage.getItem(SID);
  if (!v) {
    v = uuid();
    localStorage.setItem(SID, v);
  }
  return v;
}

export function getNickname(): string {
  return localStorage.getItem(NICK) ?? '';
}
export function setNickname(n: string) {
  localStorage.setItem(NICK, n);
}

// 강사 자격은 브라우저에 저장하지 않음 — 페이지를 새로 열 때마다 강의 선택부터 다시 시작한다.
// (DeckEditor → Instructor 이동처럼 같은 내비게이션 안에서는 router state로 전달됨)
export interface InstructorCreds {
  token: string;
  instructorSecret: string;
  classroomId: string;
  deckId: string;
}
