import { useEffect, useState } from 'react';
import type { Deck } from '@shared/types';
import { apiPost } from '../lib/api';
import { loadDeck } from '../lib/deck';
import {
  getInstructor,
  setInstructor,
  clearInstructor,
  type InstructorCreds,
} from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import Leaderboard from '../components/Leaderboard';
import PollView from '../components/PollView';

export default function Instructor() {
  const [creds, setCreds] = useState<InstructorCreds | null>(getInstructor());
  if (!creds) return <CreateScreen onCreated={setCreds} />;
  return <Console creds={creds} onReset={() => { clearInstructor(); setCreds(null); }} />;
}

function CreateScreen({ onCreated }: { onCreated: (c: InstructorCreds) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function create() {
    setBusy(true);
    setErr('');
    try {
      const r = await apiPost<InstructorCreds>('/api/classrooms', {});
      setInstructor(r);
      onCreated(r);
    } catch (e: any) {
      setErr(e.message ?? '생성 실패');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-6 text-center">
      <h1 className="text-2xl font-extrabold">강사 콘솔 🧑‍🏫</h1>
      <p className="mt-2 text-white/60">새 강의실을 만들면 학생 입장용 코드가 발급돼요.</p>
      {err && <p className="mt-3 text-down">{err}</p>}
      <button className="btn-primary mt-8 py-4 text-lg" onClick={create} disabled={busy}>
        {busy ? '만드는 중…' : '＋ 새 강의실 만들기'}
      </button>
    </div>
  );
}

function Console({ creds, onReset }: { creds: InstructorCreds; onReset: () => void }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState('');

  const live = useClassroom((s) =>
    s.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret }),
  );

  useEffect(() => {
    loadDeck(creds.deckId).then(setDeck).catch(() => {});
  }, [creds.deckId]);

  if (!deck) return <div className="grid h-full place-items-center text-white/40">불러오는 중…</div>;

  const slide = deck.slides[live.slideIndex] ?? deck.slides[0];
  const total = deck.slides.length;
  const slideAct = slide.activityId ? deck.activities[slide.activityId] : null;
  const openAct = live.activity ? deck.activities[live.activity.activityId] : null;
  const quizState = live.activity?.type === 'quiz' ? live.activity.quiz : undefined;

  const origin = location.origin;
  const studentLink = `${origin}/join?token=${creds.token}`;
  const projectorLink = `${origin}/screen/${creds.token}`;

  const goto = (n: number) => live.socket.emit('instructor:goto', { slide: Math.max(0, Math.min(total - 1, n)) });
  const copy = (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      /* ignore */
    }
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };

  // ── 원버튼 진행: 현재 상태로 "다음에 할 일" 하나를 계산 ──
  const activeHere =
    live.activity && live.activity.activityId === slide.activityId ? live.activity : null;
  const isLast = live.slideIndex >= total - 1;
  const closeAndNext = () => {
    live.socket.emit('instructor:closeActivity');
    if (!isLast) goto(live.slideIndex + 1);
  };
  type Step = { label: string; primary: boolean; run: () => void; disabled?: boolean };
  const nextStep = (): Step => {
    if (activeHere) {
      if (openAct?.type === 'quiz' && quizState) {
        if (quizState.phase === 'idle')
          return { label: '🎬 문제 시작', primary: true, run: () => live.socket.emit('instructor:quizStart') };
        if (quizState.phase === 'question')
          return { label: `✅ 정답 공개 · ${live.answeredCount}명 응답`, primary: true, run: () => live.socket.emit('instructor:quizReveal') };
        if (quizState.index < quizState.total - 1)
          return { label: '➡ 다음 문제', primary: true, run: () => live.socket.emit('instructor:quizNext') };
        return { label: '🏁 퀴즈 끝 · 다음으로', primary: true, run: closeAndNext };
      }
      return { label: isLast ? '활동 닫고 마치기 🎉' : '다음으로 ▶', primary: true, run: closeAndNext };
    }
    if (slideAct)
      return {
        label: `🚀 ${slideAct.title} 시작하기`,
        primary: true,
        run: () => live.socket.emit('instructor:openActivity', { activityId: slide.activityId! }),
      };
    if (!isLast) return { label: '다음 ▶', primary: true, run: () => goto(live.slideIndex + 1) };
    return { label: '수업 끝 🎉', primary: false, run: () => {}, disabled: true };
  };
  const action = nextStep();

  return (
    <div className="flex h-full flex-col">
      {/* 헤더 */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-white/50">강의실 코드</span>
          <button className="rounded-lg bg-brand/20 px-3 py-1 text-2xl font-extrabold tracking-widest text-brand" onClick={() => copy(creds.token, 'code')}>
            {creds.token}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-white/10 px-3 py-1">👥 {live.participantCount}</span>
          <span className={live.connected ? 'text-emerald-400' : 'text-down'}>{live.connected ? '● 연결' : '○ 끊김'}</span>
          <button
            className={['btn px-3 py-1 text-sm', paused ? 'bg-emerald-600 text-white' : 'bg-white/10'].join(' ')}
            onClick={() => {
              const action = paused ? 'resume' : 'pause';
              live.socket.emit('instructor:panic', { action });
              setPaused(!paused);
            }}
          >
            {paused ? '▶ AI 재개' : '⏸ AI 멈춤'}
          </button>
          <button className="btn bg-white/10 px-3 py-1 text-sm" onClick={onReset}>새 강의실</button>
        </div>
      </header>

      {/* 링크 안내 */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2 text-xs text-white/60">
        <button className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => copy(studentLink, 'student')}>
          🔗 학생 링크 {copied === 'student' && '✓복사'}
        </button>
        <button className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => copy(projectorLink, 'proj')}>
          📺 프로젝터 링크 {copied === 'proj' && '✓복사'}
        </button>
        {copied === 'code' && <span className="text-emerald-400">코드 복사됨 ✓</span>}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-3">
        {/* 슬라이드 + 컨트롤 */}
        <section className="lg:col-span-2 flex flex-col gap-3 overflow-hidden">
          <div className="card flex-1 overflow-y-auto">
            <SlideView slide={slide} />
          </div>

          {slide.notes && (
            <div className="rounded-xl bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200/90">
              📝 {slide.notes}
            </div>
          )}

          {/* 진행 상태줄 (활동이 열렸을 때만) */}
          {activeHere && (
            <div className="rounded-xl bg-black/20 px-3 py-2 text-center text-sm">
              {openAct?.type === 'quiz' && quizState?.phase === 'idle' && (
                <span className="text-white/60">준비 완료 — 아래 버튼으로 첫 문제를 띄우세요</span>
              )}
              {openAct?.type === 'quiz' && quizState?.phase === 'question' && (
                <span>응답 <b className="text-brand">{live.answeredCount}</b>명</span>
              )}
              {openAct?.type === 'quiz' && quizState?.phase === 'revealed' && (
                <span className="text-white/60">정답 공개됨 — 아래 버튼으로 계속</span>
              )}
              {openAct?.type === 'poll' && (
                <PollView activity={openAct} dist={live.polls[openAct.id] ?? { counts: {}, total: 0 }} />
              )}
              {(openAct?.type === 'chat' || openAct?.type === 'image' || openAct?.type === 'lab') && (
                <span className="text-white/60">학생들이 실습 중이에요 🧑‍💻</span>
              )}
            </div>
          )}

          {/* 큰 "다음 단계" 버튼 — 강사는 이것만 누르면 수업이 진행됩니다 */}
          <button
            data-testid="next-step"
            className={[
              'w-full rounded-2xl py-5 text-xl font-extrabold shadow-lg transition active:scale-[0.99]',
              action.primary ? 'btn-primary' : 'btn-ghost opacity-60',
            ].join(' ')}
            onClick={action.run}
            disabled={action.disabled}
          >
            {action.label}
          </button>

          {/* 보조 컨트롤 */}
          <div className="flex items-center justify-between text-sm text-white/50">
            <button className="btn-ghost px-3 py-1" onClick={() => goto(live.slideIndex - 1)} disabled={live.slideIndex <= 0}>
              ← 이전
            </button>
            <span>{live.slideIndex + 1} / {total}</span>
            {activeHere ? (
              <button className="btn-ghost px-3 py-1" onClick={() => live.socket.emit('instructor:closeActivity')}>
                활동 닫기
              </button>
            ) : (
              <span className="w-14" />
            )}
          </div>
        </section>

        {/* 리더보드 */}
        <aside className="card overflow-y-auto">
          <h3 className="mb-3 text-lg font-bold">🏆 리더보드</h3>
          <Leaderboard entries={live.leaderboard} compact />
        </aside>
      </div>
    </div>
  );
}
