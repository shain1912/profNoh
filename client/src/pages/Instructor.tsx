import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import QRCode from 'qrcode';
import type { Deck } from '@shared/types';
import { apiPost } from '../lib/api';
import { loadDeck } from '../lib/deck';
import { getMyDecks, listDecks } from '../lib/buildApi';
import { type InstructorCreds } from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import Leaderboard from '../components/Leaderboard';
import PollView from '../components/PollView';

export default function Instructor() {
  const location = useLocation();
  // 강의실 자격은 저장하지 않는다 — 새로 들어올 때마다(새로고침 포함) 항상 강의 선택 화면부터 시작.
  // DeckEditor의 "수업 시작"처럼 같은 내비게이션 안에서 넘어온 경우만 router state로 즉시 콘솔 진입.
  const [creds, setCreds] = useState<InstructorCreds | null>(
    (location.state as { creds?: InstructorCreds } | null)?.creds ?? null,
  );
  if (!creds) return <CreateScreen onCreated={setCreds} />;
  return <Console creds={creds} onReset={() => setCreds(null)} />;
}

function CreateScreen({ onCreated }: { onCreated: (c: InstructorCreds) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [dbDecks, setDbDecks] = useState<Array<{ id: string; title: string; slideCount?: number }>>([]);

  useEffect(() => {
    listDecks().then(setDbDecks).catch(() => {});
  }, []);

  const mine = getMyDecks();
  const mergedDecks = [...dbDecks];
  mine.forEach((m) => {
    if (!mergedDecks.some((d) => d.id === m.deckId)) {
      mergedDecks.push({ id: m.deckId, title: m.title });
    }
  });

  async function launch(deckId?: string) {
    setBusyId(deckId ?? 'sample');
    setErr('');
    try {
      const r = await apiPost<InstructorCreds>('/api/classrooms', deckId ? { deckId } : {});
      onCreated(r);
    } catch (e: any) {
      setErr(e.message ?? '생성 실패');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col p-6 animate-fade-in">
      <div className="text-center">
        <div className="mx-auto w-fit rounded-full bg-brand/10 px-4 py-1.5 text-sm font-bold tracking-widest text-brand">AI · AX 특강</div>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight text-strong">🧑‍🏫 어떤 강의로 시작할까요?</h1>
        <p className="mt-2 text-muted text-sm">강의를 고르면 바로 강의실이 열려요.</p>
      </div>

      {err && <p className="mt-4 text-center text-down text-sm">{err}</p>}

      <div className="mt-8 grid gap-2.5">
        {/* 샘플 강의 — 언제나 바로 시작 가능 */}
        <button
          className="flex items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand/5 p-4 text-left shadow-card hover:bg-brand/10 hover:border-brand/40 transition-all active:scale-[0.99] disabled:opacity-50"
          onClick={() => launch()}
          disabled={busyId !== null}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">🚀</span>
            <div className="min-w-0">
              <div className="font-bold text-strong">기본 샘플 강의</div>
              <div className="text-xs text-muted">준비된 4시간 특강 · 퀴즈·실습 포함</div>
            </div>
          </div>
          <span className="btn btn-primary shrink-0 px-3 py-1.5 text-sm font-semibold">
            {busyId === 'sample' ? '여는 중…' : '시작 ▶'}
          </span>
        </button>

        {/* 내가 만든 강의 목록 */}
        {mergedDecks.map((d) => (
          <button
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-4 text-left shadow-card hover:bg-surface-2 hover:border-muted-2/60 transition-all active:scale-[0.99] disabled:opacity-50"
            onClick={() => launch(d.id)}
            disabled={busyId !== null}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">📘</span>
              <div className="min-w-0">
                <div className="font-bold text-strong truncate">{d.title || '(제목 없음)'}</div>
                <div className="text-xs text-muted-2">내가 만든 강의</div>
              </div>
            </div>
            <span className="btn btn-ghost shrink-0 px-3 py-1.5 text-sm font-semibold">
              {busyId === d.id ? '여는 중…' : '시작 ▶'}
            </span>
          </button>
        ))}

        {/* 새 강의 만들기 — 목록의 일부로 자연스럽게 배치 */}
        <Link
          to="/build"
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-muted-2/60 p-4 text-muted hover:bg-surface hover:border-brand/50 hover:text-brand transition-all"
        >
          <span className="text-xl">🛠️</span>
          <span className="text-sm font-semibold">새 강의 만들기 (AI 생성 · PDF 업로드 · 직접 제작)</span>
        </Link>
      </div>

      <Link to="/" className="mt-8 text-center text-xs text-muted-2 hover:text-muted transition underline">
        메인 화면으로 돌아가기
      </Link>
    </div>
  );
}

function Console({ creds, onReset }: { creds: InstructorCreds; onReset: () => void }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qaOpen, setQaOpen] = useState(false);
  // 발표 모드(F): 화면 100%를 강의자료로 — 모든 UI 숨김 + 브라우저 전체화면
  const [focusMode, setFocusMode] = useState(false);
  // 리더보드 서랍(L): 오른쪽에서 슬라이드되어 화면 위를 덮음
  const [lbOpen, setLbOpen] = useState(false);
  // 발표 모드에서 Space로 "다음 단계" 액션 실행용 (action은 렌더마다 계산되므로 ref로 최신값 유지)
  const actionRef = useRef<{ run: () => void; disabled?: boolean } | null>(null);

  const live = useClassroom((s) =>
    s.emit('instructor:join', { token: creds.token, instructorSecret: creds.instructorSecret }),
  );

  useEffect(() => {
    loadDeck(creds.deckId).then(setDeck).catch(() => {});
  }, [creds.deckId]);

  const studentLink = `${location.origin}/join?token=${creds.token}`;

  useEffect(() => {
    if (!qrOpen) return;
    QRCode.toDataURL(studentLink, { width: 320, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [qrOpen, studentLink]);

  // 활동이 열리면 리더보드 서랍 자동 닫힘 (활동 화면을 가리지 않게)
  useEffect(() => {
    if (live.activity) setLbOpen(false);
  }, [live.activity?.activityId]);

  const enterPresent = () => {
    setFocusMode(true);
    document.documentElement.requestFullscreen().catch(() => {});
  };
  const exitPresent = () => {
    setFocusMode(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  // 키보드 단축키: ←/→ 슬라이드, F 발표 모드(전체화면 포함) 토글, L 리더보드 서랍, Space 다음 단계(발표 모드), Esc 종료
  // e.code 기준이라 한/영 상태와 무관하게 동작
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const totalSlides = deck?.slides.length ?? 0;
      if (e.code === 'ArrowRight' && totalSlides > 0) {
        e.preventDefault();
        live.socket.emit('instructor:goto', { slide: Math.min(totalSlides - 1, live.slideIndex + 1) });
      } else if (e.code === 'ArrowLeft' && totalSlides > 0) {
        e.preventDefault();
        live.socket.emit('instructor:goto', { slide: Math.max(0, live.slideIndex - 1) });
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        if (focusMode) exitPresent();
        else enterPresent();
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        setLbOpen((v) => !v);
      } else if (e.code === 'Space' && focusMode) {
        e.preventDefault();
        const a = actionRef.current;
        if (a && !a.disabled) a.run();
      } else if (e.code === 'Escape') {
        setLbOpen(false);
        exitPresent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck, live.slideIndex, live.socket, focusMode]);

  if (!deck) return <div className="grid h-full place-items-center text-muted-2">불러오는 중…</div>;

  const slide = deck.slides[live.slideIndex] ?? deck.slides[0];
  const total = deck.slides.length;
  const slideAct = slide.activityId ? deck.activities[slide.activityId] : null;
  const openAct = live.activity ? deck.activities[live.activity.activityId] : null;
  const quizState = live.activity?.type === 'quiz' ? live.activity.quiz : undefined;

  const projectorLink = `${location.origin}/screen/${creds.token}`;

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
  actionRef.current = action;

  return (
    <div className="flex h-full flex-col">
      {/* 강의실 만료/오류 배너 — 발표 모드에서도 항상 보임 */}
      {live.error && (
        <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl bg-down px-5 py-3 text-sm font-bold text-white shadow-pop">
          <span>⚠️ {live.error} 서버 업데이트로 강의실이 만료됐을 수 있어요.</span>
          <button className="rounded-lg bg-white/20 px-3 py-1 hover:bg-white/30" onClick={onReset}>
            새 강의실 열기
          </button>
        </div>
      )}

      {/* 헤더 */}
      <header className={[focusMode ? 'hidden' : 'flex', 'flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface px-4 py-2'].join(' ')}>
        <div className="flex items-center gap-3">
          <span className="text-muted">강의실 코드</span>
          <button className="rounded-lg bg-brand/10 px-3 py-1 text-2xl font-extrabold tracking-widest text-brand" onClick={() => copy(creds.token, 'code')}>
            {creds.token}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-surface-2 px-3 py-1 ring-1 ring-hairline">👥 {live.participantCount}</span>
          <span className={live.connected ? 'text-up' : 'text-down'}>{live.connected ? '● 연결' : '○ 끊김'}</span>
          <button
            className={['btn px-3 py-1 text-sm', paused ? 'bg-up text-white' : 'bg-surface-2 ring-1 ring-hairline hover:bg-surface-3'].join(' ')}
            onClick={() => {
              const action = paused ? 'resume' : 'pause';
              live.socket.emit('instructor:panic', { action });
              setPaused(!paused);
            }}
          >
            {paused ? '▶ AI 재개' : '⏸ AI 멈춤'}
          </button>
          <Link
            to="/build"
            target="_blank"
            rel="noopener noreferrer"
            className="btn bg-brand/10 hover:bg-brand/20 text-brand px-3 py-1 text-sm font-bold rounded-lg"
          >
            🛠️ 새 강의 만들기
          </Link>
          <button className="btn bg-surface-2 ring-1 ring-hairline hover:bg-surface-3 px-3 py-1 text-sm" onClick={onReset}>새 강의실</button>
          <button
            className="btn bg-brand/10 hover:bg-brand/20 text-brand px-3 py-1 text-sm font-bold rounded-lg"
            onClick={() => setQaOpen(true)}
          >
            ❓ 질문 {live.questions.length > 0 && `(${live.questions.length})`}
          </button>
          <button
            className="btn bg-surface-2 ring-1 ring-hairline hover:bg-surface-3 px-3 py-1 text-sm"
            title="리더보드 서랍 (L)"
            onClick={() => setLbOpen(!lbOpen)}
          >
            🏆
          </button>
          <button
            className="btn bg-surface-2 ring-1 ring-hairline hover:bg-surface-3 px-3 py-1 text-sm"
            title="발표 모드 — 화면 전체를 강의자료로 (F 토글, Esc 종료)"
            onClick={enterPresent}
          >
            ⛶ 발표
          </button>
          <button
            className="btn bg-brand/10 hover:bg-brand/20 text-brand px-3 py-1 text-sm font-bold rounded-lg"
            onClick={() => window.open(`/report/${creds.classroomId}?secret=${creds.instructorSecret}`, '_blank')}
          >
            📊 리포트
          </button>
        </div>
      </header>

      {/* 링크 안내 */}
      <div className={[focusMode ? 'hidden' : 'flex', 'flex-wrap gap-2 border-b border-hairline bg-surface px-4 py-2 text-xs text-muted'].join(' ')}>
        <button className="rounded bg-surface-2 px-2 py-1 ring-1 ring-hairline hover:bg-surface-3" onClick={() => copy(studentLink, 'student')}>
          🔗 학생 링크 {copied === 'student' && '✓복사'}
        </button>
        <button className="rounded bg-brand/10 text-brand px-2 py-1 hover:bg-brand/20 font-semibold" onClick={() => setQrOpen(true)}>
          📱 QR로 초대
        </button>
        <button className="rounded bg-surface-2 px-2 py-1 ring-1 ring-hairline hover:bg-surface-3" onClick={() => copy(projectorLink, 'proj')}>
          📺 프로젝터 링크 {copied === 'proj' && '✓복사'}
        </button>
        {copied === 'code' && <span className="text-up">코드 복사됨 ✓</span>}
      </div>

      <div className={[
        'grid flex-1 grid-cols-1 overflow-y-auto lg:overflow-hidden',
        focusMode ? 'gap-0 p-0' : 'gap-3 p-3 lg:grid-cols-3',
      ].join(' ')}>
        {/* 슬라이드 + 컨트롤 */}
        <section className={[focusMode ? '' : 'lg:col-span-2', 'flex flex-col gap-3 overflow-hidden'].join(' ')}>
          <div className={focusMode ? 'relative flex-1 overflow-hidden' : 'card flex-1 overflow-y-auto'}>
            <SlideView slide={slide} big={focusMode} />
            {focusMode && (
              <>
                <button
                  className="absolute right-3 top-3 z-10 rounded-full bg-ink/60 px-3 py-1.5 text-sm text-white/90 opacity-0 backdrop-blur-sm transition hover:opacity-100 focus:opacity-100"
                  title="발표 모드 종료 (Esc)"
                  onClick={exitPresent}
                >
                  ✕
                </button>
                {/* 발표 중 유일한 안내 — 반투명 칩. 클릭 또는 Space로 다음 단계 실행 */}
                <button
                  className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/60 px-4 py-1.5 text-sm text-white/90 opacity-30 backdrop-blur-sm transition hover:opacity-100"
                  onClick={() => { if (!action.disabled) action.run(); }}
                >
                  {live.slideIndex + 1}/{total} · {action.label} <span className="text-white/50">(Space)</span>
                </button>
              </>
            )}
          </div>

          {!focusMode && slide.notes && (
            <div className="rounded-xl bg-warn/10 px-4 py-2 text-sm text-warn">
              📝 {slide.notes}
            </div>
          )}

          {/* 진행 상태줄 (활동이 열렸을 때만) */}
          {activeHere && (
            <div className="rounded-xl bg-surface px-3 py-2 text-center text-sm ring-1 ring-hairline shadow-card">
              {openAct?.type === 'quiz' && quizState?.phase === 'idle' && (
                <span className="text-muted">준비 완료 — 아래 버튼으로 첫 문제를 띄우세요</span>
              )}
              {openAct?.type === 'quiz' && quizState?.phase === 'question' && live.question && (
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>문제 {live.question.index + 1} / {live.question.total}</span>
                    <span>응답 <b className="text-brand">{live.answeredCount}</b>명</span>
                  </div>
                  <div className="text-base font-bold text-strong">{live.question.question}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {live.question.options.map((opt, i) => (
                      <div key={i} className="rounded-lg bg-surface-2 px-2 py-1 text-xs">
                        {['▲', '◆', '●', '■'][i % 4]} {opt}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {openAct?.type === 'quiz' && quizState?.phase === 'revealed' && live.reveal && (
                <div className="space-y-2 text-left">
                  <div className="text-xs text-muted">정답 공개됨</div>
                  <div className="text-base font-bold text-strong">{live.question?.question}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(live.question?.options ?? []).map((opt, i) => {
                      const correct = i === live.reveal!.correctIndex;
                      const count = live.reveal!.distribution[String(i)] ?? 0;
                      return (
                        <div
                          key={i}
                          className={[
                            'rounded-lg px-2 py-1 text-xs',
                            correct ? 'bg-up/15 ring-1 ring-up font-bold text-up' : 'bg-surface-2',
                          ].join(' ')}
                        >
                          {['▲', '◆', '●', '■'][i % 4]} {opt} · {count}명
                        </div>
                      );
                    })}
                  </div>
                  {live.reveal.explanation && (
                    <div className="text-xs text-muted">💡 {live.reveal.explanation}</div>
                  )}
                </div>
              )}
              {openAct?.type === 'poll' && (
                <PollView activity={openAct} dist={live.polls[openAct.id] ?? { counts: {}, total: 0 }} />
              )}
              {(openAct?.type === 'chat' || openAct?.type === 'image' || openAct?.type === 'lab') && (
                <span className="text-muted">학생들이 실습 중이에요 🧑‍💻</span>
              )}
            </div>
          )}

          {/* 큰 "다음 단계" 버튼 — 발표 모드에선 완전히 숨김 (Space/칩으로 진행) */}
          {!focusMode && (
            <>
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
              <div className="flex items-center justify-between text-sm text-muted">
                <button className="btn-ghost px-3 py-1" onClick={() => goto(live.slideIndex - 1)} disabled={live.slideIndex <= 0}>
                  ← 이전
                </button>
                <span className="flex items-center gap-3">
                  <span>{live.slideIndex + 1} / {total}</span>
                  <span className="hidden sm:inline text-[11px] text-muted-2">⌨ ←→ 슬라이드 · F 발표 모드 · L 리더보드</span>
                </span>
                {activeHere ? (
                  <button className="btn-ghost px-3 py-1" onClick={() => live.socket.emit('instructor:closeActivity')}>
                    활동 닫기
                  </button>
                ) : (
                  <span className="w-14" />
                )}
              </div>
            </>
          )}
        </section>

        {/* 리더보드 (사이드 패널 — 발표 모드에선 숨김, L 서랍으로 대체) */}
        {!focusMode && (
          <aside className="card overflow-y-auto">
            <h3 className="mb-3 text-lg font-bold">🏆 리더보드</h3>
            <Leaderboard entries={live.leaderboard} compact />
          </aside>
        )}
      </div>

      {/* 리더보드 서랍 — L 키로 오른쪽에서 슬라이드되어 화면 위를 덮음. 활동 열리면 자동 닫힘 */}
      <div
        className={[
          'fixed right-0 top-0 z-40 flex h-full w-96 max-w-[85vw] transform flex-col bg-surface/95 shadow-pop ring-1 ring-hairline backdrop-blur-lg transition-transform duration-300',
          lbOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        data-testid="leaderboard-drawer"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <span className="text-xl font-extrabold text-strong">🏆 리더보드</span>
          <button className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-strong" title="닫기 (L)" onClick={() => setLbOpen(false)}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Leaderboard entries={live.leaderboard} />
        </div>
      </div>

      {qrOpen && (
        <div className="modal-overlay" onClick={() => setQrOpen(false)}>
          <div className="modal-card max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setQrOpen(false)}>✕</button>
            <h2 className="text-lg font-bold text-brand">📱 학생 입장 QR</h2>
            <p className="mt-1 text-xs text-muted">폰 카메라로 스캔하면 바로 강의실에 입장해요.</p>
            <div className="mt-4 rounded-xl bg-white p-3 mx-auto w-fit ring-1 ring-hairline">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="학생 입장 QR 코드" width={240} height={240} />
              ) : (
                <div className="h-[240px] w-[240px] grid place-items-center text-black/40 text-sm">생성 중…</div>
              )}
            </div>
            <div className="mt-3 rounded-lg bg-brand/10 px-3 py-1 text-2xl font-extrabold tracking-widest text-brand">
              {creds.token}
            </div>
            <button
              className="btn-ghost mt-4 w-full text-sm"
              onClick={() => copy(studentLink, 'student')}
            >
              🔗 링크 복사 {copied === 'student' && '✓'}
            </button>
          </div>
        </div>
      )}

      {qaOpen && (
        <div className="modal-overlay" onClick={() => setQaOpen(false)}>
          <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setQaOpen(false)}>✕</button>
            <h2 className="text-lg font-bold text-brand">❓ 학생 질문 ({live.questions.length})</h2>
            <p className="mt-1 text-xs text-muted">닉네임 없이 언제든 도착하는 익명 질문이에요. 최신순으로 보여요.</p>
            <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto custom-scrollbar">
              {live.questions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-2">아직 들어온 질문이 없어요.</p>
              ) : (
                live.questions.map((q) => (
                  <div key={q.id} className="rounded-xl bg-surface-2 px-3 py-2.5 text-left ring-1 ring-hairline">
                    <p className="text-sm leading-relaxed">{q.text}</p>
                    <p className="mt-1 text-[11px] text-muted-2">{timeAgo(q.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 전`;
}
