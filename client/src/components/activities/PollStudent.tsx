import { useEffect, useState } from 'react';
import type { OpenActivityState, PollActivity, PollDistribution } from '@shared/types';
import PollView, { CHOICE_COLORS, CHOICE_SHAPES, PollHidden } from '../PollView';
import Countdown from '../Countdown';
import { useCopy } from '../../lib/copy';

export default function PollStudent({
  activity,
  dist,
  state,
  poll,
  onVote,
}: {
  activity: PollActivity;
  dist: PollDistribution | null;
  /** 열린 활동 상태 — 익명 여부 / 결과 공개 / 마감 */
  state: OpenActivityState | null;
  /** 서버의 투표 타이머/마감/공개 상태 (없으면 타이머 없는 기존 투표) */
  poll?: OpenActivityState['poll'];
  onVote: (value: string) => void;
}) {
  const copy = useCopy();
  const [voted, setVoted] = useState(false);
  const [word, setWord] = useState('');
  const anonymous = state?.anonymous ?? false;
  // 투표 타이머 상태: 명시 prop 우선, 없으면 활동 상태에서 읽는다
  const ps = poll ?? state?.poll;
  // 마감/공개는 익명 정책(state.closed/revealResults)과 타이머(poll.closed/revealed) 양쪽 신호를 합친다 (서버에서 동기화됨)
  const closed = (state?.closed ?? false) || (ps?.closed ?? false);
  const revealed = !dist?.hidden && (state?.revealResults ?? ps?.revealed ?? true);
  const hidden = !revealed;
  const endsAt = !closed ? ps?.endsAt : undefined;

  // 활동이 새로 열리면 응답 상태 초기화
  useEffect(() => {
    setVoted(false);
    setWord('');
  }, [activity.id]);

  const results = revealed && dist ? <PollView activity={activity} dist={dist} /> : null;

  return (
    <div className="flex h-full flex-col" data-poll-closed={closed} data-poll-revealed={revealed}>
      <h2 className="text-center text-xl font-bold sm:text-2xl text-strong">🗳️ {activity.prompt}</h2>
      <div className="mt-2 flex justify-center gap-2 text-xs">
        {anonymous ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold text-muted ring-1 ring-hairline" data-testid="anon-badge">
            🔒 익명으로 제출됩니다
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold text-muted ring-1 ring-hairline" data-testid="named-badge">
            🙂 닉네임과 함께 제출됩니다
          </span>
        )}
      </div>

      {endsAt && (
        <div className="mx-auto my-3 w-full max-w-xs">
          <Countdown endsAt={endsAt} total={ps?.timerSec ?? 1} label={copy.pollRemaining} />
        </div>
      )}

      {closed && !voted ? (
        <div className="mt-4 flex-1 overflow-y-auto">
          <p className="mb-2 text-center text-sm text-muted" data-testid="poll-closed">{copy.pollClosedNoVote}</p>
          {hidden ? <PollHidden total={dist?.total ?? 0} /> : results}
        </div>
      ) : !voted ? (
        activity.mode === 'choice' ? (
          // 프로젝터와 같은 색·도형 코드 — 스크린의 막대와 내 폰의 버튼을 바로 대응시킬 수 있다 (R2 A4-3)
          <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2" data-testid="poll-choice-buttons">
            {(activity.options ?? []).map((opt, i) => (
              <button
                key={i}
                className={['flex min-h-[64px] items-center gap-3 rounded-xl px-5 py-4 text-left text-lg font-bold text-white shadow-lg transition active:scale-95', CHOICE_COLORS[i % 4]].join(' ')}
                onClick={() => {
                  onVote(String(i));
                  setVoted(true);
                }}
              >
                <span className="text-2xl">{CHOICE_SHAPES[i % 4]}</span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="mt-6 flex flex-col items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!word.trim()) return;
              onVote(word.trim());
              setVoted(true);
            }}
          >
            <input
              className="input max-w-sm text-center text-xl"
              placeholder={copy.pollWordPlaceholder}
              value={word}
              maxLength={20}
              onChange={(e) => setWord(e.target.value)}
            />
            <button className="btn-primary min-h-[48px]">{copy.pollSubmit}</button>
          </form>
        )
      ) : (
        <div className="mt-4 flex-1 overflow-y-auto">
          {hidden ? (
            <>
              <p className="mb-2 text-center text-sm text-up" data-testid="poll-waiting">{closed ? copy.pollClosedWait : copy.pollDoneHidden}</p>
              <PollHidden total={dist?.total ?? 0} />
            </>
          ) : (
            <>
              <p className="mb-2 text-center text-sm text-up">{anonymous ? copy.pollDoneAnon : copy.pollDone}</p>
              {results}
            </>
          )}
          {!closed && (
            <div className="mt-3 text-center">
              <button className="btn-ghost text-sm" onClick={() => setVoted(false)}>
                {copy.pollAgain}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
