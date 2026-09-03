import type { ScaleActivity, PollDistribution } from '@shared/types';

// 1~5 척도 결과 — 분포 막대 + 평균. 학생(응답 후)·강사 콘솔·프로젝터(big) 공용
const BAR_COLORS = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'];
const VALUES = [1, 2, 3, 4, 5];

export function scaleAvg(dist: PollDistribution): number | null {
  let sum = 0;
  let n = 0;
  for (const v of VALUES) {
    const c = dist.counts[String(v)] ?? 0;
    sum += v * c;
    n += c;
  }
  return n ? Math.round((sum / n) * 100) / 100 : null;
}

export default function ScaleView({
  activity,
  dist,
  big = false,
}: {
  activity: ScaleActivity;
  dist: PollDistribution;
  big?: boolean;
}) {
  const counts = VALUES.map((v) => dist.counts[String(v)] ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  const avg = scaleAvg(dist);

  return (
    <div className={big ? 'mx-auto w-full max-w-4xl' : 'w-full'}>
      <div className="mb-3 flex items-end justify-between">
        <span className={big ? 'text-2xl text-muted' : 'text-sm text-muted'}>응답 {total}명</span>
        <span className={['font-extrabold tabular-nums text-brand', big ? 'text-6xl' : 'text-3xl'].join(' ')}>
          {avg === null ? '–' : avg.toFixed(2)}
          <span className={['ml-1 font-semibold text-muted', big ? 'text-2xl' : 'text-sm'].join(' ')}>/ 5 평균</span>
        </span>
      </div>
      <div className={big ? 'space-y-3' : 'space-y-2'}>
        {VALUES.map((v, i) => {
          const c = counts[i];
          const pct = total ? Math.round((c / total) * 100) : 0;
          const w = Math.round((c / max) * 100);
          return (
            <div key={v} className="flex items-center gap-3">
              <span className={['w-8 shrink-0 text-center font-extrabold tabular-nums text-strong', big ? 'text-3xl' : 'text-lg'].join(' ')}>{v}</span>
              <div className={['flex-1 overflow-hidden rounded-lg bg-surface-3', big ? 'h-10' : 'h-6'].join(' ')}>
                <div className={['h-full rounded-lg transition-all duration-300', BAR_COLORS[i]].join(' ')} style={{ width: `${w}%` }} />
              </div>
              <span className={['shrink-0 whitespace-nowrap text-right tabular-nums text-muted', big ? 'w-40 text-2xl' : 'w-24 text-sm'].join(' ')}>
                {c}명 · {pct}%
              </span>
            </div>
          );
        })}
      </div>
      {(activity.lowLabel || activity.highLabel) && (
        <div className={['mt-2 flex justify-between pl-11 pr-24 text-muted-2', big ? 'text-xl' : 'text-xs'].join(' ')}>
          <span>1 = {activity.lowLabel ?? ''}</span>
          <span>5 = {activity.highLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}
