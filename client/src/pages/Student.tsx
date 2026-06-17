import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { getNickname, getSessionId } from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import ChatActivity from '../components/activities/ChatActivity';
import ImageActivity from '../components/activities/ImageActivity';
import LabActivity from '../components/activities/LabActivity';
import QuizStudent from '../components/activities/QuizStudent';
import PollStudent from '../components/activities/PollStudent';
import RoleplayStudent from '../components/activities/RoleplayStudent';
import AnalogyStudent from '../components/activities/AnalogyStudent';
import WritingStudent from '../components/activities/WritingStudent';
import TutorStudent from '../components/activities/TutorStudent';

export default function Student() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = (params.get('token') ?? '').toUpperCase();
  const nickname = getNickname();
  const sessionId = getSessionId();
  const [deck, setDeck] = useState<Deck | null>(null);

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

  const wrap = (node: React.ReactNode) => <div className="card h-full overflow-hidden">{node}</div>;

  switch (act.type) {
    case 'chat':
      return wrap(<ChatActivity activity={act} token={token} sessionId={sessionId} />);
    case 'image':
      return wrap(<ImageActivity activity={act} token={token} sessionId={sessionId} />);
    case 'lab':
      return wrap(<LabActivity activity={act} token={token} sessionId={sessionId} />);
    case 'quiz':
      return wrap(
        <QuizStudent
          question={live.question}
          reveal={live.reveal}
          onAnswer={(i) =>
            live.question && live.socket.emit('student:quizAnswer', { questionId: live.question.questionId, optionIndex: i })
          }
        />,
      );
    case 'poll':
      return wrap(
        <PollStudent
          activity={act}
          dist={live.polls[act.id] ?? null}
          onVote={(v) => live.socket.emit('student:pollVote', { activityId: act.id, value: v })}
        />,
      );
    case 'roleplay':
      return wrap(
        <RoleplayStudent
          activity={act}
          token={token}
          sessionId={sessionId}
          socket={live.socket}
        />,
      );
    case 'analogy':
      return wrap(
        <AnalogyStudent
          activity={act}
          token={token}
          sessionId={sessionId}
        />,
      );
    case 'writing':
      return wrap(
        <WritingStudent
          activity={act}
          token={token}
          sessionId={sessionId}
        />,
      );
    case 'tutor':
      return wrap(
        <TutorStudent
          activity={act}
          token={token}
          sessionId={sessionId}
        />,
      );
    default:
      return null;
  }
}
