import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import PollView, { AnonBadge, PollHidden } from '../components/PollView';
import Leaderboard from '../components/Leaderboard';
import Countdown from '../components/Countdown';
import { EntryBar, EntryHero } from '../components/EntryBar';

const COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-600'];
const SHAPES = ['▲', '◆', '●', '■'];

// 강당 모드 프로젝터 텍스트 배율 (R2 A4-1: ×1.5). Tailwind 글자 크기는 rem 이라 루트 폰트만 키우면
// 레이아웃(%, vh, grid)은 그대로 두고 텍스트·여백만 커진다.
const AUDITORIUM_FONT_SCALE = '150%';

export default function Projector() {
  const { token = '' } = useParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [lbOpen, setLbOpen] = useState(false);
  // 강당 모드에서 활동이 없을 때: 기본은 대기 화면(초대형 QR). S 키로 슬라이드 보기와 전환.
  const [showSlide, setShowSlide] = useState(false);
  const live = useClassroom((s) => s.emit('viewer:join', { token: token.toUpperCase() }));
  const mode = live.snapshot?.mode ?? 'classroom';
  const auditorium = mode === 'auditorium';

  useEffect(() => {
    const id = live.snapshot?.deckId;
    if (id && !deck) loadDeck(id).then(setDeck).catch(() => {});
  }, [live.snapshot?.deckId, deck]);

  // 강당 모드: 루트 폰트 ×1.5 (페이지를 떠나면 원복)
  useEffect(() => {
    if (!auditorium) return;
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = AUDITORIUM_FONT_SCALE;
    return () => { root.style.fontSize = prev; };
  }, [auditorium]);

  // F 전체화면 / L 리더보드 서랍 / S 대기 화면↔슬라이드 (강당 모드)
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
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        setShowSlide((v) => !v);
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

  const act = live.activity ? deck.activities[live.activity.activityId] : null;
  const code = live.snapshot?.token ?? token.toUpperCase();

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

  // 교실/강당 대형 스크린: 항상 고대비 다크 스코프로 감싼다.
  // 강당 모드에선 하단에 상시 입장 바(QR·코드·URL·접속 n명)를 고정하고 본문은 그만큼 위로 올린다.
  const withDrawer = (node: ReactNode, opts: { entryBar?: boolean } = {}) => {
    const bar = auditorium && opts.entryBar !== false;
    return (
      <div className="theme-dark h-full bg-canvas text-body" data-testid="projector" data-mode={mode}>
        <div className="h-full" style={bar ? { paddingBottom: '14vh' } : undefined}>{node}</div>
        {bar && <EntryBar token={code} count={live.participantCount} />}
        {lbDrawer}
      </div>
    );
  };

  // 퀴즈
  if (act?.type === 'quiz') {
    const showReveal = live.reveal && (!live.question || live.reveal.questionId === live.question.questionId);
    if (showReveal && live.reveal) {
      const correctIdx = live.reveal.correctIndex;
      const dist = live.reveal.distribution;
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      return withDrawer(
        <div className="grid h-full grid-cols-3 gap-6 p-8">
          <div className="col-span-2 flex flex-col justify-center">
            <h1 className="text-4xl font-extrabold text-strong">{live.question?.question ?? '정답 공개'}</h1>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {(live.question?.options ?? []).map((opt, i) => {
                const count = dist[String(i)] ?? 0;
                const pct = total ? Math.round((count / total) * 100) : 0;
                const correct = i === correctIdx;
                return (
                  <div
                    key={i}
                    className={['flex items-center gap-3 rounded-2xl p-5 text-2xl font-bold ring-2', correct ? 'bg-emerald-600 text-white ring-white' : 'bg-surface-2 ring-transparent opacity-60'].join(' ')}
                  >
                    <span className={['grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white', COLORS[i % 4]].join(' ')}>{SHAPES[i % 4]}</span>
                    <span className="min-w-0 flex-1">{opt}</span>
                    {/* 비율 + 응답 수 동시 표기 (R2 A4-6) */}
                    <span className="shrink-0 tabular-nums" data-testid="quiz-reveal-stat">{pct}% · {count}명</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="mb-4 text-3xl font-extrabold text-strong">🏆 순위</h2>
            <Leaderboard entries={live.leaderboard} />
          </div>
        </div>,
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
        </div>,
      );
    }
    return withDrawer(<div className="grid h-full place-items-center text-3xl text-muted">퀴즈 준비 중… 🎮</div>);
  }

  // 투표
  if (act?.type === 'poll') {
    const dist = live.polls[act.id] ?? { counts: {}, total: 0, hidden: !live.activity?.revealResults };
    return withDrawer(
      <div className="flex h-full flex-col justify-center p-10 text-center">
        <h1 className="text-4xl font-extrabold text-strong">🗳️ {act.prompt}</h1>
        {live.activity?.anonymous && (
          <div className="mt-3"><AnonBadge big /></div>
        )}
        <div className="mt-8 text-2xl">
          {dist.hidden ? <PollHidden total={dist.total} big /> : <PollView activity={act} dist={dist} big={auditorium} />}
        </div>
      </div>,
    );
  }

  // 강당 모드 · 활동 없음: 대기 화면 — QR 화면 높이 40% + 코드 + URL + 접속 카운터 (R2 A1-1)
  // (S 키로 슬라이드 보기 전환 가능 — 그때는 하단 입장 바가 붙는다)
  if (auditorium && !showSlide) {
    return withDrawer(
      <EntryHero token={code} count={live.participantCount} title={live.snapshot?.title} />,
      { entryBar: false },
    );
  }

  // 슬라이드
  const slide = deck.slides[live.slideIndex] ?? deck.slides[0];
  return withDrawer(
    <div className="h-full">
      <SlideView slide={slide} big />
    </div>,
  );
}
