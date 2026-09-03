import { useState } from 'react';
import type { PollActivity, PollDistribution } from '@shared/types';
import PollView, { CHOICE_COLORS, CHOICE_SHAPES } from '../PollView';

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
      <h2 className="text-center text-xl font-bold sm:text-2xl text-strong">🗳️ {activity.prompt}</h2>

      {!voted ? (
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
          <p className="mb-2 text-center text-sm text-up">참여 완료! 친구들의 응답을 봐요 👀</p>
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
