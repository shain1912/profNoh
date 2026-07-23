import { useEffect, useRef, useState } from 'react';
import WordCloudLib from 'wordcloud';
import type { PollActivity, PollDistribution } from '@shared/types';

const NOTE_COLORS = ['#fef08a', '#fca5a5', '#93c5fd', '#86efac', '#fdba74', '#c4b5fd', '#f9a8d4'];
const CLOUD_COLORS = ['#f2b705', '#fde68a', '#fca5a5', '#93c5fd', '#86efac', '#fdba74', '#c4b5fd'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function RollingPaper({ entries }: { entries: Array<{ nickname: string; value: string }> }) {
  if (entries.length === 0) {
    return <p className="p-6 text-center text-white/40">첫 답변을 기다리는 중…</p>;
  }
  const cols = Math.max(3, Math.ceil(Math.sqrt(entries.length * 1.5)));
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const height = Math.max(260, rows * 120);

  return (
    <div className="relative w-full" style={{ height }}>
      {entries.map((e, i) => {
        const seed = hashStr(`${e.nickname}|${e.value}|${i}`);
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
            <span className="mt-0.5 w-full truncate border-t border-black/15 pt-1 text-[11px] font-bold text-black/70">
              – {e.nickname}
            </span>
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
    return <p className="p-6 text-center text-white/40">첫 단어를 기다리는 중…</p>;
  }
  return <canvas ref={canvasRef} className="w-full" style={{ height: Math.max(260, Math.min(420, 80 + entries.length * 28)) }} />;
}

export default function PollView({
  activity,
  dist,
}: {
  activity: PollActivity;
  dist: PollDistribution;
}) {
  const [view, setView] = useState<'paper' | 'cloud'>('paper');

  if (activity.mode === 'wordcloud') {
    const entries = dist.entries ?? [];
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <button
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 hover:bg-white/20"
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
