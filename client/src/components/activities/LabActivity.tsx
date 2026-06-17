import { useState } from 'react';
import type { LabActivity as LabAct } from '@shared/types';
import { apiPost } from '../../lib/api';
import Thinking from '../Thinking';

interface LabResult {
  outputA: string;
  outputB: string;
  labelA: string;
  labelB: string;
}

export default function LabActivity({
  activity,
  token,
  sessionId,
}: {
  activity: LabAct;
  token: string;
  sessionId: string;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<LabResult | null>(null);

  async function run() {
    const p = input.trim();
    if (!p || loading) return;
    setErr('');
    setLoading(true);
    setRes(null);
    try {
      const r = await apiPost<LabResult>('/api/ai/lab', {
        token,
        sessionId,
        activityId: activity.id,
        input: p,
      });
      setRes(r);
    } catch (e: any) {
      setErr(e.message ?? '오류가 발생했어');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-xl font-bold">🆚 {activity.title}</h2>
      {activity.intro && <p className="mt-1 text-sm text-white/60">{activity.intro}</p>}
      <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">{activity.task}</p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          className="input"
          placeholder={activity.inputPlaceholder ?? '여기에 입력…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" disabled={loading}>
          {loading ? '실험 중…' : '실험!'}
        </button>
      </form>

      {err && <p className="mt-2 text-sm text-down">{err}</p>}

      {loading && <Thinking text="🧪 실험 중… 두 결과를 비교하고 있어요. 잠깐만!" />}

      <div className="mt-4 grid flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
        <Panel label={res?.labelA ?? activity.labelA} text={res?.outputA} loading={loading} tone="a" />
        <Panel label={res?.labelB ?? activity.labelB} text={res?.outputB} loading={loading} tone="b" />
      </div>

      {res && (
        <p className="mt-3 text-center text-sm text-white/60">
          👀 두 결과의 차이가 보이나요? <b>무엇이</b> 결과를 바꿨는지 생각해봐요.
        </p>
      )}
    </div>
  );
}

function Panel({
  label,
  text,
  loading,
  tone,
}: {
  label: string;
  text?: string;
  loading: boolean;
  tone: 'a' | 'b';
}) {
  return (
    <div className={['rounded-xl p-3 ring-1', tone === 'a' ? 'bg-white/5 ring-white/10' : 'bg-brand/10 ring-brand/30'].join(' ')}>
      <div className="mb-2 inline-block rounded-full bg-black/30 px-3 py-1 text-xs font-bold">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">
        {loading ? '…' : text ?? '결과가 여기에 나와요'}
      </div>
    </div>
  );
}
