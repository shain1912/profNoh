import { useEffect, useState } from 'react';
import type { OpenActivityState, PollActivity, PollDistribution } from '@shared/types';
import PollView from '../PollView';
import Countdown from '../Countdown';
import { useCopy } from '../../lib/copy';

export default function PollStudent({
  activity,
  dist,
  poll,
  onVote,
}: {
  activity: PollActivity;
  dist: PollDistribution | null;
  /** 서버의 투표 타이머/마감/공개 상태 (없으면 타이머 없는 기존 투표) */
  poll?: OpenActivityState['poll'];
  onVote: (value: string) => void;
}) {
  const copy = useCopy();
  const [voted, setVoted] = useState(false);
  const [word, setWord] = useState('');

  const closed = poll?.closed ?? false;
  const revealed = poll?.revealed ?? true;
  const endsAt = !closed ? poll?.endsAt : undefined;

  // 활동이 새로 열리면 응답 상태 초기화
  useEffect(() => {
    setVoted(false);
    setWord('');
  }, [activity.id]);

  const results = revealed && dist ? <PollView activity={activity} dist={dist} /> : null;

  return (
    <div className="flex h-full flex-col" data-poll-closed={closed} data-poll-revealed={revealed}>
      <h2 className="text-center text-xl font-bold sm:text-2xl text-strong">🗳️ {activity.prompt}</h2>

      {endsAt && (
        <div className="mx-auto my-3 w-full max-w-xs">
          <Countdown endsAt={endsAt} total={poll?.timerSec ?? 1} label={copy.pollRemaining} />
        </div>
      )}

      {closed && !voted ? (
        <div className="mt-4 flex-1 overflow-y-auto">
          <p className="mb-2 text-center text-sm text-muted">{copy.pollClosedNoVote}</p>
          {results}
        </div>
      ) : !voted ? (
        activity.mode === 'choice' ? (
          <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {(activity.options ?? []).map((opt, i) => (
              <button
                key={i}
                className="btn-ghost min-h-[56px] py-5 text-lg"
                onClick={() => {
                  onVote(String(i));
                  setVoted(true);
                }}
              >
                {opt}
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
          {revealed ? (
            <p className="mb-2 text-center text-sm text-up">{copy.pollDone}</p>
          ) : (
            <p className="mb-2 text-center text-sm text-up">{closed ? copy.pollClosedWait : copy.pollDoneHidden}</p>
          )}
          {results}
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
