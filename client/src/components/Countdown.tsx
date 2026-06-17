import { useEffect, useState } from 'react';

export default function Countdown({ endsAt, total }: { endsAt: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [endsAt]);
  const remainMs = Math.max(0, endsAt - now);
  const sec = Math.ceil(remainMs / 1000);
  const pct = Math.max(0, Math.min(100, (remainMs / (total * 1000)) * 100));
  return (
    <div className="w-full">
      <div className="mb-1 text-center text-3xl font-extrabold tabular-nums">{sec}</div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
