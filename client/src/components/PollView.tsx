import { useEffect, useRef, useState } from 'react';
import WordCloudLib from 'wordcloud';
import type { PollActivity, PollDistribution } from '@shared/types';

const NOTE_COLORS = ['#fef08a', '#fca5a5', '#93c5fd', '#86efac', '#fdba74', '#c4b5fd', '#f9a8d4'];
const CLOUD_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#818cf8'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function RollingPaper({ entries }: { entries: Array<{ nickname?: string; value: string }> }) {
  if (entries.length === 0) {
    return <p className="p-6 text-center text-muted-2">첫 답변을 기다리는 중…</p>;
  }
  const cols = Math.max(3, Math.ceil(Math.sqrt(entries.length * 1.5)));
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const height = Math.max(260, rows * 120);

  return (
    <div className="relative w-full" style={{ height }}>
      {entries.map((e, i) => {
        const seed = hashStr(`${e.nickname ?? ''}|${e.value}|${i}`);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (seededRandom(seed) - 0.5) * (100 / cols) * 0.7;
        const jitterY = (seededRandom(seed + 1) - 0.5) * (100 / rows) * 0.7;
        const left = Math.min(96, Math.max(4, (col + 0.5) * (100 / cols) + jitterX));
        const top = Math.min(94, Math.max(6, (row + 0.5) * (100 / rows) + jitterY));
        const rotate = (seededRandom(seed + 2) - 0.5) * 24;
        const color = NOTE_COLORS[Math.floor(seededRandom(seed + 3) * NOTE_COLORS.length)];
        return (
          <div
            key={i}
            className="absolute flex max-w-[9rem] flex-col items-center gap-1 rounded-md px-3 py-2.5 text-center shadow-lg"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
              background: color,
            }}
          >
            <span className="break-words text-sm font-extrabold leading-snug text-black/85">{e.value}</span>
            {/* 익명 활동이면 서버가 nickname 을 빼고 보내므로 서명 줄 자체가 없다 */}
            {e.nickname && (
              <span className="mt-0.5 w-full truncate border-t border-black/15 pt-1 text-[11px] font-bold text-black/70" data-testid="paper-signature">
                – {e.nickname}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WordCloud({ counts }: { counts: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entries = Object.entries(counts);
  const key = entries.map(([w, c]) => `${w}:${c}`).join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || entries.length === 0) return;

    const width = canvas.parentElement?.clientWidth ?? 560;
    const height = Math.max(260, Math.min(420, 80 + entries.length * 28));
    canvas.width = width;
    canvas.height = height;

    const max = Math.max(1, ...entries.map(([, c]) => c));

    WordCloudLib(canvas, {
      list: entries,
      backgroundColor: 'transparent',
      color: () => CLOUD_COLORS[Math.floor(Math.random() * CLOUD_COLORS.length)],
      fontFamily: '-apple-system, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
      fontWeight: '800',
      gridSize: Math.round(Math.max(8, width / 60)),
      weightFactor: (size) => 16 + (size / max) * (width / 8),
      // 한글은 세로/회전 배치 시 글자가 뭉개져 보여 가독성이 떨어지므로 가로 배치만 사용
      rotateRatio: 0,
      shrinkToFit: true,
      drawOutOfBound: false,
    });

    return () => WordCloudLib.stop();
  }, [key]);

  if (entries.length === 0) {
    return <p className="p-6 text-center text-muted-2">첫 단어를 기다리는 중…</p>;
  }
  return <canvas ref={canvasRef} className="w-full" style={{ height: Math.max(260, Math.min(420, 80 + entries.length * 28)) }} />;
}

/** 결과 미공개 상태 — 참여 인원만 보여준다 (밴드왜건 방지) */
export function PollHidden({ total, big = false }: { total: number; big?: boolean }) {
  return (
    <div className={['grid place-items-center rounded-2xl bg-surface-2 text-center ring-1 ring-hairline', big ? 'py-14' : 'py-8'].join(' ')} data-testid="poll-hidden">
      <div className={big ? 'text-5xl' : 'text-3xl'}>🔒</div>
      <p className={['mt-2 font-bold text-strong', big ? 'text-2xl' : 'text-sm'].join(' ')}>결과는 마감 후 공개돼요</p>
      <p className={['mt-1 text-muted', big ? 'text-xl' : 'text-xs'].join(' ')}>
        지금까지 <b className="text-brand">{total}</b>명 참여
      </p>
    </div>
  );
}

/** 익명 활동 표시 뱃지 */
export function AnonBadge({ big = false }: { big?: boolean }) {
  return (
    <span
      className={['inline-flex items-center gap-1 rounded-full bg-surface-2 font-semibold text-muted ring-1 ring-hairline', big ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-0.5 text-xs'].join(' ')}
      data-testid="anon-badge"
    >
      🔒 익명
    </span>
  );
}

export default function PollView({
  activity,
  dist,
}: {
  activity: PollActivity;
  dist: PollDistribution;
}) {
  const [view, setView] = useState<'paper' | 'cloud'>('paper');

  if (dist.hidden) return <PollHidden total={dist.total} />;

  if (activity.mode === 'wordcloud') {
    const entries = dist.entries ?? [];
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <button
            className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted ring-1 ring-hairline hover:bg-surface-3"
            onClick={() => setView(view === 'paper' ? 'cloud' : 'paper')}
          >
            {view === 'paper' ? '☁️ 워드클라우드로 보기' : '📝 롤링페이퍼로 보기'}
          </button>
        </div>
        {view === 'paper' ? <RollingPaper entries={entries} /> : <WordCloud counts={dist.counts} />}
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
              <span className="text-muted">
                {c}명 · {pct}%
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded-lg bg-surface-3">
              <div className="h-full rounded-lg bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
