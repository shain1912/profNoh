import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Deck } from '@shared/types';
import { loadDeck } from '../lib/deck';
import { getNickname, getSessionId } from '../lib/session';
import { useClassroom } from '../lib/useClassroom';
import SlideView from '../components/SlideView';
import QaPanel from '../components/QaPanel';
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
        <span className="flex items-center gap-2">
          <span className="font-bold text-strong">{nickname}</span>
          {/* 세션 전체 익명이거나 현재 열린 활동이 익명이면 뱃지 — 이름이 노출되지 않는다는 신호 */}
          {(live.snapshot?.anonymity === 'always_anon' || live.activity?.anonymous) && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-hairline" data-testid="student-anon-badge">
              🔒 {live.snapshot?.anonymity === 'always_anon' ? '익명 세션' : '익명 활동'}
            </span>
          )}
        </span>
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

      {/* 언제든 익명으로 질문하기 + 질문 목록·👍 (Q&A 2.0) */}
      <button
        onClick={() => setAskOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-pop hover:scale-105 active:scale-95 transition-all"
        title={copy.askButtonTitle}
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
  // 즉석 활동(OX 퀵 퀴즈)은 덱에 없으므로 서버가 실어 보낸 adhoc 을 우선 사용
  const act = live.activity ? (live.activity.adhoc ?? deck.activities[live.activity.activityId]) : null;

  if (!act) {
    // 강당 모드: 청중은 큰 스크린을 보므로 슬라이드를 미러링하지 않는다 (PDF 다운로드 비용 0, R3 결핍 1)
    if (live.snapshot?.mode === 'auditorium') {
      return <AuditoriumWaiting token={token} count={live.participantCount} />;
    }
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

// 강당 참가자 대기 화면 — "지금 할 일" 만. 소리·진동·권한 요청 없음, 개인정보 미수집 1줄 (R2 A8)
function AuditoriumWaiting({ token, count }: { token: string; count: number }) {
  return (
    <div className="card flex h-full flex-col items-center justify-center gap-4 text-center" data-testid="waiting-screen">
      <div className="text-6xl">👀</div>
      <h2 className="text-2xl font-extrabold text-strong">앞 화면을 봐 주세요</h2>
      <p className="text-muted">
        투표·퀴즈가 시작되면
        <br />
        이 화면에 바로 나타나요.
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted">
        <span className="rounded-full bg-surface-2 px-3 py-1 font-bold tracking-widest text-strong ring-1 ring-hairline">{token}</span>
        <span className="rounded-full bg-brand/10 px-3 py-1 font-semibold text-brand tabular-nums">접속 {count}명</span>
      </div>
      <p className="mt-4 text-xs text-muted-2">🔒 개인정보를 수집하지 않습니다</p>
    </div>
  );
}
