import { useEffect, useState } from 'react';

function useNow(endsAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [endsAt]);
  return now;
}

/**
 * 활동 타이머 — 퀴즈/투표 공통.
 * - 기본: 숫자 + 가로 바 (참가자 폰)
 * - ring: 원형 게이지 (프로젝터, R2 A5-3)
 */
export default function Countdown({
  endsAt,
  total,
  ring = false,
  size = 200,
  label,
}: {
  endsAt: number;
  total: number;
  ring?: boolean;
  size?: number;
  label?: string;
}) {
  const now = useNow(endsAt);
  const remainMs = Math.max(0, endsAt - now);
  const sec = Math.ceil(remainMs / 1000);
  const pct = Math.max(0, Math.min(100, (remainMs / (Math.max(1, total) * 1000)) * 100));
  const urgent = sec <= 5;

  if (ring) {
    const stroke = Math.max(8, Math.round(size / 14));
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    return (
      <div className="inline-flex flex-col items-center" data-testid="countdown-ring" data-remaining={sec}>
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface-3" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct / 100)}
              className={[urgent ? 'text-down' : 'text-brand', 'transition-[stroke-dashoffset] duration-100'].join(' ')}
            />
          </svg>
          <div
            className={[
              'absolute inset-0 grid place-items-center font-extrabold tabular-nums leading-none',
              urgent ? 'text-down' : 'text-strong',
            ].join(' ')}
            style={{ fontSize: size / 3.2 }}
          >
            {sec}
          </div>
        </div>
        {label && <div className="mt-3 text-xl text-muted">{label}</div>}
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="countdown-bar" data-remaining={sec}>
      <div className={['mb-1 text-center text-3xl font-extrabold tabular-nums', urgent ? 'text-down' : 'text-strong'].join(' ')}>
        {sec}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={['h-full rounded-full transition-[width] duration-100', urgent ? 'bg-down' : 'bg-brand'].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <div className="mt-1 text-center text-xs text-muted">{label}</div>}
    </div>
  );
}
