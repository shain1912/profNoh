import { useState } from 'react';
import type { ScaleActivity, PollDistribution } from '@shared/types';
import ScaleView from '../ScaleView';

// 1~5 척도 투표 — 큰 버튼 5개 1탭. 응답 후 분포 막대+평균, 다시 응답 가능(마지막 값이 유효)
const BTN_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-600', 'bg-emerald-600'];

export default function ScaleStudent({
  activity,
  dist,
  onVote,
}: {
  activity: ScaleActivity;
  dist: PollDistribution | null;
  onVote: (value: string) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-center text-xl font-bold text-strong sm:text-2xl">📏 {activity.prompt}</h2>

      {picked === null ? (
        <div className="mt-4 flex flex-1 flex-col justify-center">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n, i) => (
              <button
                key={n}
                className={[
                  'flex min-h-[110px] items-center justify-center rounded-2xl text-4xl font-extrabold text-white shadow-lg transition active:scale-95 sm:min-h-[140px] sm:text-5xl',
                  BTN_COLORS[i],
                ].join(' ')}
                onClick={() => {
                  setPicked(n);
                  onVote(String(n));
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between px-1 text-xs text-muted sm:text-sm">
            <span>1 = {activity.lowLabel ?? '전혀 아니다'}</span>
            <span>5 = {activity.highLabel ?? '매우 그렇다'}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex-1 overflow-y-auto">
          <p className="mb-3 text-center text-sm text-up">
            <b className="text-lg">{picked}</b>점으로 참여 완료! 🔒 익명으로 집계돼요
          </p>
          <ScaleView activity={activity} dist={dist ?? { counts: {}, total: 0 }} />
          <div className="mt-3 text-center">
            <button className="btn-ghost text-sm" onClick={() => setPicked(null)}>다시 응답하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
