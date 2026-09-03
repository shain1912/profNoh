import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import PollView from '../components/PollView';
import Leaderboard from '../components/Leaderboard';
import Countdown from '../components/Countdown';
import ScaleView from '../components/ScaleView';
import SurveyResultView from '../components/SurveyResultView';
import OxProjectorView from '../components/OxProjectorView';
import QaProjectorView from '../components/QaProjectorView';

const COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-600'];
const SHAPES = ['▲', '◆', '●', '■'];

export default function Projector() {
  const { token = '' } = useParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [lbOpen, setLbOpen] = useState(false);
  const live = useClassroom((s) => s.emit('viewer:join', { token: token.toUpperCase() }));

  useEffect(() => {
    const id = live.snapshot?.deckId;
    if (id && !deck) loadDeck(id).then(setDeck).catch(() => {});
  }, [live.snapshot?.deckId, deck]);

  // F 전체화면 / L 리더보드 서랍 (프로젝터 화면)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyF') {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        setLbOpen((v) => !v);
      } else if (e.code === 'Escape') {
        setLbOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 활동이 열리면 리더보드 서랍 자동 닫힘
  useEffect(() => {
    if (live.activity) setLbOpen(false);
  }, [live.activity?.activityId]);

  if (!deck)
    return (
      <div className="theme-dark h-full bg-canvas text-body">
        <div className="grid h-full place-items-center text-2xl text-muted">연결 중… ({token})</div>
      </div>
    );

  // 즉석 활동(OX 퀵 퀴즈)은 덱에 없으므로 서버가 실어 보낸 adhoc 을 우선 사용
  const act = live.activity ? (live.activity.adhoc ?? deck.activities[live.activity.activityId]) : null;

  // 리더보드 서랍 (L) — 어떤 화면 상태에서도 오른쪽에서 슬라이드 인
  const lbDrawer = (
    <div
      className={[
        'fixed right-0 top-0 z-40 flex h-full w-96 max-w-[85vw] transform flex-col bg-surface/90 shadow-pop ring-1 ring-hairline backdrop-blur-lg transition-transform duration-300',
        lbOpen ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <span className="text-xl font-extrabold text-strong">🏆 리더보드</span>
        <button className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-strong" onClick={() => setLbOpen(false)}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <Leaderboard entries={live.leaderboard} />
      </div>
    </div>
  );

  // 교실 대형 스크린: 항상 고대비 다크 스코프로 감싼다
  const withDrawer = (node: ReactNode) => (
    <div className="theme-dark h-full bg-canvas text-body">
      {node}
      {lbDrawer}
    </div>
  );

  // OX 퀵 퀴즈 — 2지선다 대형 타일 (채점·리더보드는 quiz 이벤트 공용)
  if (act?.type === 'ox') {
    return withDrawer(
      <OxProjectorView question={live.question} reveal={live.reveal} answeredCount={live.answeredCount} leaderboard={live.leaderboard} />,
    );
  }

  // 척도 투표 — 분포 막대 + 평균
  if (act?.type === 'scale') {
    return withDrawer(
      <div className="flex h-full flex-col justify-center p-10 text-center">
        <h1 className="text-4xl font-extrabold text-strong">📏 {act.prompt}</h1>
        <div className="mt-8">
          <ScaleView activity={act} dist={live.polls[act.id] ?? { counts: {}, total: 0 }} big />
        </div>
      </div>,
    );
  }

  // 설문 — 응답 중엔 응답 수만, 마감 후 문항별 평균·분포
  if (act?.type === 'survey') {
    const summary = live.surveys[act.id] ?? null;
    const closed = live.activity?.survey?.phase === 'closed';
    return withDrawer(
      <div className="flex h-full flex-col p-10">
        <div className="flex items-end justify-between">
          <h1 className="text-4xl font-extrabold text-strong">📝 {act.title}</h1>
          <span className="text-3xl text-muted">
            응답 <b className="text-6xl font-extrabold tabular-nums text-brand">{summary?.total ?? 0}</b> / {live.participantCount}명
          </span>
        </div>
        {closed ? (
          <div className="mt-6 flex-1 overflow-hidden">
            <SurveyResultView activity={act} summary={summary} big maxTexts={6} />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <div className="text-8xl">📱</div>
              <p className="mt-4 text-3xl text-muted">폰에서 설문에 응답해 주세요 · 익명으로 집계됩니다</p>
              <p className="mt-2 text-2xl text-muted-2">마감 후 결과가 여기에 공개돼요</p>
            </div>
          </div>
        )}
      </div>,
    );
  }

  // 퀴즈
  if (act?.type === 'quiz') {
    const showReveal = live.reveal && (!live.question || live.reveal.questionId === live.question.questionId);
    if (showReveal && live.reveal) {
      const correctIdx = live.reveal.correctIndex;
      return withDrawer(
        <div className="grid h-full grid-cols-3 gap-6 p-8">
          <div className="col-span-2 flex flex-col justify-center">
            <h1 className="text-4xl font-extrabold text-strong">{live.question?.question ?? '정답 공개'}</h1>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {(live.question?.options ?? []).map((opt, i) => {
                const count = live.reveal!.distribution[String(i)] ?? 0;
                const correct = i === correctIdx;
                return (
                  <div key={i} className={['rounded-2xl p-5 text-2xl font-bold ring-2', correct ? 'bg-emerald-600 text-white ring-white' : 'bg-surface-2 ring-transparent opacity-60'].join(' ')}>
                    {SHAPES[i % 4]} {opt} <span className="float-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="mb-4 text-3xl font-extrabold text-strong">🏆 순위</h2>
            <Leaderboard entries={live.leaderboard} />
          </div>
        </div>
      );
    }
    if (live.question) {
      return withDrawer(
        <div className="flex h-full flex-col justify-center p-10 text-center">
          <h1 className="text-5xl font-extrabold leading-tight text-strong">{live.question.question}</h1>
          <div className="mx-auto my-8 w-1/2">
            <Countdown endsAt={live.question.endsAt} total={Math.max(1, Math.round((live.question.endsAt - Date.now()) / 1000))} />
            <p className="mt-2 text-xl text-muted">응답 {live.answeredCount}명</p>
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
    return withDrawer(<div className="grid h-full place-items-center text-3xl text-muted">퀴즈 준비 중… 🎮</div>);
  }

  // 투표
  if (act?.type === 'poll') {
    return withDrawer(
      <div className="flex h-full flex-col justify-center p-10 text-center">
        <h1 className="text-4xl font-extrabold text-strong">🗳️ {act.prompt}</h1>
        <div className="mt-8 text-2xl">
          <PollView activity={act} dist={live.polls[act.id] ?? { counts: {}, total: 0 }} />
        </div>
      </div>
    );
  }

  // Q&A 카드 뷰 — 강사가 "프로젝터에 질문 카드" 를 켜면 슬라이드 대신 업보트순 질문 카드
  if (live.snapshot?.qa?.onScreen) {
    return withDrawer(<QaProjectorView questions={live.questions} />);
  }

  // 슬라이드
  const slide = deck.slides[live.slideIndex] ?? deck.slides[0];
  return withDrawer(
    <div className="h-full">
      <SlideView slide={slide} big />
    </div>,
  );
}
