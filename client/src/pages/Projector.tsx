import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import PollView from '../components/PollView';
import Leaderboard from '../components/Leaderboard';
import Countdown from '../components/Countdown';

const COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-600'];
const SHAPES = ['▲', '◆', '●', '■'];

export default function Projector() {
  const { token = '' } = useParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const live = useClassroom((s) => s.emit('viewer:join', { token: token.toUpperCase() }));

  useEffect(() => {
    const id = live.snapshot?.deckId;
    if (id && !deck) loadDeck(id).then(setDeck).catch(() => {});
  }, [live.snapshot?.deckId, deck]);

  if (!deck)
    return <div className="grid h-full place-items-center text-2xl text-white/40">연결 중… ({token})</div>;

  const act = live.activity ? deck.activities[live.activity.activityId] : null;

  // 퀴즈
  if (act?.type === 'quiz') {
    const showReveal = live.reveal && (!live.question || live.reveal.questionId === live.question.questionId);
    if (showReveal && live.reveal) {
      const correctIdx = live.reveal.correctIndex;
      return (
        <div className="grid h-full grid-cols-3 gap-6 p-8">
          <div className="col-span-2 flex flex-col justify-center">
            <h1 className="text-4xl font-extrabold">{live.question?.question ?? '정답 공개'}</h1>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {(live.question?.options ?? []).map((opt, i) => {
                const count = live.reveal!.distribution[String(i)] ?? 0;
                const correct = i === correctIdx;
                return (
                  <div key={i} className={['rounded-2xl p-5 text-2xl font-bold ring-2', correct ? 'bg-emerald-600 ring-white' : 'bg-white/5 ring-transparent opacity-60'].join(' ')}>
                    {SHAPES[i % 4]} {opt} <span className="float-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="mb-4 text-3xl font-extrabold">🏆 순위</h2>
            <Leaderboard entries={live.leaderboard} />
          </div>
        </div>
      );
    }
    if (live.question) {
      return (
        <div className="flex h-full flex-col justify-center p-10 text-center">
          <h1 className="text-5xl font-extrabold leading-tight">{live.question.question}</h1>
          <div className="mx-auto my-8 w-1/2">
            <Countdown endsAt={live.question.endsAt} total={Math.max(1, Math.round((live.question.endsAt - Date.now()) / 1000))} />
            <p className="mt-2 text-xl text-white/60">응답 {live.answeredCount}명</p>
          </div>
          <div className="grid grid-cols-2 gap-5">
            {live.question.options.map((opt, i) => (
              <div key={i} className={['flex items-center gap-4 rounded-2xl px-8 py-6 text-left text-3xl font-bold text-white', COLORS[i % 4]].join(' ')}>
                <span>{SHAPES[i % 4]}</span>
                <span>{opt}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return <div className="grid h-full place-items-center text-3xl text-white/50">퀴즈 준비 중… 🎮</div>;
  }

  // 투표
  if (act?.type === 'poll') {
    return (
      <div className="flex h-full flex-col justify-center p-10 text-center">
        <h1 className="text-4xl font-extrabold">🗳️ {act.prompt}</h1>
        <div className="mt-8 text-2xl">
          <PollView activity={act} dist={live.polls[act.id] ?? { counts: {}, total: 0 }} />
        </div>
      </div>
    );
  }

  // 슬라이드
  const slide = deck.slides[live.slideIndex] ?? deck.slides[0];
  return (
    <div className="h-full">
      <SlideView slide={slide} big />
    </div>
  );
}
