import { useState } from 'react';
import type { OpenActivityState, PollActivity, PollDistribution } from '@shared/types';
import PollView, { CHOICE_COLORS, CHOICE_SHAPES, PollHidden } from '../PollView';

export default function PollStudent({
  activity,
  dist,
  state,
  onVote,
}: {
  activity: PollActivity;
  dist: PollDistribution | null;
  /** 열린 활동 상태 — 익명 여부 / 결과 공개 / 마감 */
  state: OpenActivityState | null;
  onVote: (value: string) => void;
}) {
  const [voted, setVoted] = useState(false);
  const [word, setWord] = useState('');
  const anonymous = state?.anonymous ?? false;
  const closed = state?.closed ?? false;
  const hidden = !!dist?.hidden;

  return (
    <div className="flex h-full flex-col">
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

      {closed && !voted ? (
        <div className="mt-4 flex-1 overflow-y-auto">
          <p className="mb-2 text-center text-sm text-muted" data-testid="poll-closed">응답이 마감됐어요. 결과를 확인해 보세요 👀</p>
          {dist && <PollView activity={activity} dist={dist} />}
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
          {hidden ? (
            <>
              <p className="mb-2 text-center text-sm text-up" data-testid="poll-waiting">참여 완료! 결과는 강사님이 공개하면 보여요 🔒</p>
              <PollHidden total={dist?.total ?? 0} />
            </>
          ) : (
            <>
              <p className="mb-2 text-center text-sm text-up">참여 완료! {anonymous ? '모두의' : '친구들의'} 응답을 봐요 👀</p>
              {dist && <PollView activity={activity} dist={dist} />}
            </>
          )}
          {!closed && (
            <div className="mt-3 text-center">
              <button className="btn-ghost text-sm" onClick={() => setVoted(false)}>
                다시 응답하기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
