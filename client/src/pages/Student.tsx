import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { getNickname, getSessionId } from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import QaPanel from '../components/QaPanel';
import { activityDef } from '../activities/registry';

export default function Student() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = (params.get('token') ?? '').toUpperCase();
  const nickname = getNickname();
  const sessionId = getSessionId();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [askOpen, setAskOpen] = useState(false);

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
          <div className="grid h-full place-items-center text-muted-2">강의실에 연결 중… ⏳</div>
        ) : (
          <ActivityArea deck={deck} live={live} token={token} sessionId={sessionId} />
        )}
      </main>

      {/* 언제든 익명으로 질문하기 + 질문 목록·👍 (Q&A 2.0) */}
      <button
        onClick={() => setAskOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-pop hover:scale-105 active:scale-95 transition-all"
        title="질문하기 · 질문 보기"
        data-testid="qa-fab"
      >
        <span className="text-2xl">❓</span>
        {live.questions.length > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-down px-1.5 text-[11px] font-bold text-white ring-2 ring-surface">{live.questions.length}</span>
        )}
      </button>

      {askOpen && (
        <QaPanel
          token={token}
          questions={live.questions}
          moderation={!!live.snapshot?.qa?.moderation}
          onAsk={(text) => live.socket.emit('student:askQuestion', { text })}
          onUpvote={(questionId) => live.socket.emit('student:upvoteQuestion', { questionId })}
          onClose={() => setAskOpen(false)}
        />
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
  // 즉석 활동(OX 퀵 퀴즈)은 덱에 없으므로 서버가 실어 보낸 adhoc 을 우선 사용
  const act = live.activity ? (live.activity.adhoc ?? deck.activities[live.activity.activityId]) : null;

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
