import type { LeaderboardEntry } from '@shared/types';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard({
  entries,
  highlight,
  compact = false,
}: {
  entries: LeaderboardEntry[];
  highlight?: string;
  compact?: boolean;
}) {
  if (!entries.length)
    return <p className="text-center text-white/40">아직 점수가 없어요.</p>;
  return (
    <ol className="space-y-2">
      {entries.map((e) => {
        const me = highlight && e.nickname === highlight;
        return (
          <li
            key={e.nickname + e.rank}
            className={[
              'flex items-center justify-between rounded-xl px-4 py-2',
              me ? 'bg-brand/30 ring-1 ring-brand' : 'bg-white/5',
              compact ? 'text-sm' : 'text-lg',
            ].join(' ')}
          >
            <span className="flex items-center gap-3">
              <span className="w-7 text-center font-bold">{MEDAL[e.rank - 1] ?? e.rank}</span>
              <span className="font-semibold">{e.nickname}</span>
            </span>
            <span className="font-extrabold tabular-nums text-brand">{e.score}</span>
          </li>
        );
      })}
    </ol>
  );
}
