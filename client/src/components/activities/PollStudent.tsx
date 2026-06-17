import { useState } from 'react';
import type { PollActivity, PollDistribution } from '@shared/types';
import PollView from '../PollView';

export default function PollStudent({
  activity,
  dist,
  onVote,
}: {
  activity: PollActivity;
  dist: PollDistribution | null;
  onVote: (value: string) => void;
}) {
  const [voted, setVoted] = useState(false);
  const [word, setWord] = useState('');

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-center text-xl font-bold sm:text-2xl">🗳️ {activity.prompt}</h2>

      {!voted ? (
        activity.mode === 'choice' ? (
          <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {(activity.options ?? []).map((opt, i) => (
              <button
                key={i}
                className="btn-ghost py-5 text-lg"
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
              placeholder="한 단어로 입력!"
              value={word}
              maxLength={20}
              onChange={(e) => setWord(e.target.value)}
            />
            <button className="btn-primary">제출</button>
          </form>
        )
      ) : (
        <div className="mt-4 flex-1 overflow-y-auto">
          <p className="mb-2 text-center text-sm text-emerald-400">참여 완료! 친구들의 응답을 봐요 👀</p>
          {dist && <PollView activity={activity} dist={dist} />}
          <div className="mt-3 text-center">
            <button className="btn-ghost text-sm" onClick={() => setVoted(false)}>
              다시 응답하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
