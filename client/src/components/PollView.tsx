import type { PollActivity, PollDistribution } from '@shared/types';

export default function PollView({
  activity,
  dist,
}: {
  activity: PollActivity;
  dist: PollDistribution;
}) {
  if (activity.mode === 'wordcloud') {
    const words = Object.entries(dist.counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...words.map(([, c]) => c));
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 p-4">
        {words.length === 0 && <p className="text-white/40">첫 단어를 기다리는 중…</p>}
        {words.map(([w, c]) => (
          <span
            key={w}
            className="font-extrabold text-brand"
            style={{ fontSize: `${1 + (c / max) * 2.4}rem`, opacity: 0.6 + (c / max) * 0.4 }}
          >
            {w}
          </span>
        ))}
      </div>
    );
  }

  // choice
  const options = activity.options ?? [];
  const total = dist.total || 1;
  return (
    <div className="space-y-3 p-2">
      {options.map((opt, i) => {
        const c = dist.counts[String(i)] ?? dist.counts[opt] ?? 0;
        const pct = Math.round((c / total) * 100);
        return (
          <div key={i}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{opt}</span>
              <span className="text-white/60">
                {c}명 · {pct}%
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded-lg bg-white/10">
              <div className="h-full rounded-lg bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
