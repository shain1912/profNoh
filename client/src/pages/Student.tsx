import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { getNickname, getSessionId } from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import { activityDef } from '../activities/registry';

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

  useEffect(() => {
    const id = live.snapshot?.deckId;
    if (id && !deck) loadDeck(id).then(setDeck).catch(() => {});
  }, [live.snapshot?.deckId, deck]);

  const myScore =
    live.leaderboard.find((e) => e.nickname === nickname)?.score ?? live.joined?.score ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* 상단바 */}
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm">
        <span className="font-bold">{nickname}</span>
        <span className="flex items-center gap-3">
          <span className="rounded-full bg-brand/20 px-3 py-1 font-bold text-brand">⭐ {myScore}</span>
          <span className={live.connected ? 'text-emerald-400' : 'text-down'}>
            {live.connected ? '●' : '○'}
          </span>
        </span>
      </header>

      {live.notice && (
        <div className="bg-brand/30 px-4 py-2 text-center text-sm font-semibold">{live.notice}</div>
      )}
      {live.error && (
        <div className="bg-down/30 px-4 py-2 text-center text-sm">{live.error}</div>
      )}

      <main className="flex-1 overflow-hidden p-3">
        {!deck ? (
          <div className="grid h-full place-items-center text-white/40">강의실에 연결 중… ⏳</div>
        ) : (
          <ActivityArea deck={deck} live={live} token={token} sessionId={sessionId} />
        )}
      </main>

      {/* 언제든 익명으로 질문하기 */}
      <button
        onClick={() => { setAskOpen(true); setAskSent(false); }}
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-xl hover:scale-105 active:scale-95 transition-all"
        title="선생님께 질문하기"
      >
        <span className="text-2xl">❓</span>
      </button>

      {askOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={() => setAskOpen(false)}>
          <div className="card max-w-sm w-full bg-[#1e1e24] ring-1 ring-brand/40 shadow-2xl p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-4 text-white/50 hover:text-white text-lg" onClick={() => setAskOpen(false)}>✕</button>
            <h2 className="text-lg font-bold text-brand">❓ 선생님께 질문하기</h2>
            <p className="mt-1 text-xs text-white/50">닉네임 없이 익명으로 전달돼요. 궁금한 건 뭐든 물어보세요!</p>
            {askSent ? (
              <p className="mt-6 text-center text-emerald-400 font-semibold">질문이 전달됐어요! 🙌</p>
            ) : (
              <>
                <textarea
                  className="input mt-4 w-full resize-none text-sm"
                  rows={3}
                  maxLength={300}
                  placeholder="예) 아까 말씀하신 부분 다시 설명해주실 수 있나요?"
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
                  질문 보내기
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
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
