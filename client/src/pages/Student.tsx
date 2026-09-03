import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { getNickname, getSessionId } from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import { activityDef } from '../activities/registry';
import { SessionModeContext, useResolvedSessionMode } from '../lib/sessionMode';
import { copyFor } from '../lib/copy';

// 거절 비용 0 (R2 A8-1·2·4): 참가자 페이지는 오디오 재생·진동·Web Push·카메라/위치 등
// 어떤 권한 요청도 하지 않는다. 활동 오픈 알림은 화면 전환뿐이다. (verify-copy.mjs 가 검사)
export default function Student() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = (params.get('token') ?? '').toUpperCase();
  const nickname = getNickname();
  const sessionId = getSessionId();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState('');
  const [askSent, setAskSent] = useState(false);

  useEffect(() => {
    if (!token || !nickname) nav(`/join?token=${token}`);
  }, [token, nickname, nav]);

  const live = useClassroom((s) => s.emit('student:join', { token, nickname, sessionId }));
  // 세션 유형(교실/강당) → 참가자 카피 톤. 스냅샷에 mode 가 없으면 REST 폴백, 그래도 없으면 교실
  const mode = useResolvedSessionMode(token, live.snapshot);
  const copy = copyFor(mode);

  useEffect(() => {
    const id = live.snapshot?.deckId;
    if (id && !deck) loadDeck(id).then(setDeck).catch(() => {});
  }, [live.snapshot?.deckId, deck]);

  const myScore =
    live.leaderboard.find((e) => e.nickname === nickname)?.score ?? live.joined?.score ?? 0;

  return (
    <SessionModeContext.Provider value={mode}>
    <div className="flex h-full flex-col" data-mode={mode}>
      {/* 상단바 */}
      <header className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-2 text-sm">
        <span className="font-bold text-strong">{nickname}</span>
        <span className="flex items-center gap-3">
          <span className="rounded-full bg-brand/10 px-3 py-1 font-bold text-brand">⭐ {myScore}</span>
          <span className={live.connected ? 'text-up' : 'text-down'}>
            {live.connected ? '●' : '○'}
          </span>
        </span>
      </header>

      {live.notice && (
        <div className="bg-brand/10 px-4 py-2 text-center text-sm font-semibold text-brand">{live.notice}</div>
      )}
      {live.error && (
        <div className="bg-down/10 px-4 py-2 text-center text-sm text-down">{live.error}</div>
      )}

      <main className="flex-1 overflow-hidden p-3">
        {!deck ? (
          <div className="grid h-full place-items-center text-muted-2">{copy.connecting}</div>
        ) : (
          <ActivityArea deck={deck} live={live} token={token} sessionId={sessionId} />
        )}
      </main>

      {/* 언제든 익명으로 질문하기 */}
      <button
        onClick={() => { setAskOpen(true); setAskSent(false); }}
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-pop hover:scale-105 active:scale-95 transition-all"
        title={copy.askButtonTitle}
      >
        <span className="text-2xl">❓</span>
      </button>

      {askOpen && (
        <div className="modal-overlay" onClick={() => setAskOpen(false)}>
          <div className="modal-card max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAskOpen(false)}>✕</button>
            <h2 className="text-lg font-bold text-brand">{copy.askTitle}</h2>
            <p className="mt-1 text-xs text-muted">{copy.askHint}</p>
            {askSent ? (
              <p className="mt-6 text-center text-up font-semibold">{copy.askSent}</p>
            ) : (
              <>
                <textarea
                  className="input mt-4 w-full resize-none text-sm"
                  rows={3}
                  maxLength={300}
                  placeholder={copy.askPlaceholder}
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                />
                <button
                  className="btn-primary mt-3 w-full py-2.5 font-bold disabled:opacity-40"
                  disabled={!askText.trim()}
                  onClick={() => {
                    live.socket.emit('student:askQuestion', { text: askText.trim() });
                    setAskText('');
                    setAskSent(true);
                    setTimeout(() => setAskOpen(false), 1400);
                  }}
                >
                  {copy.askSend}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </SessionModeContext.Provider>
  );
}

function ActivityArea({
  deck,
  live,
  token,
  sessionId,
}: {
  deck: Deck;
  live: ReturnType<typeof useClassroom>;
  token: string;
  sessionId: string;
}) {
  const act = live.activity ? deck.activities[live.activity.activityId] : null;

  if (!act) {
    const slide = deck.slides[live.slideIndex] ?? deck.slides[0];
    return (
      <div className="card h-full overflow-y-auto">
        <SlideView slide={slide} />
      </div>
    );
  }

  // 학생 렌더러는 활동 레지스트리(activities/registry.ts)에서 타입별로 가져온다 — 기존 컴포넌트 재사용 래퍼
  const def = activityDef(act.type);
  if (!def) return null;
  const StudentView = def.Student;
  return (
    <div className="card h-full overflow-hidden">
      <StudentView activity={act} ctx={{ token, sessionId, live }} />
    </div>
  );
}
