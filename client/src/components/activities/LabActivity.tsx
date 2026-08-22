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

  // 고정 예시가 있는 활동(하네스 랩)은 실시간 AI 호출 없이 미리 정해둔 결과를 그대로 보여준다.
  // AI 응답 편차 때문에 두 결과 차이가 매번 크게 나지 않는 문제를 없애기 위함.
  const cannedOnly = !!activity.cannedResults;

  async function run(promptOverride?: string) {
    const p = (promptOverride ?? input).trim();
    if (!p || loading) return;
    setErr('');
    setLoading(true);
    setRes(null);

    const canned = activity.cannedResults?.[p];
    if (canned) {
      await new Promise((r) => setTimeout(r, 900));
      setRes({ outputA: canned.outputA, outputB: canned.outputB, labelA: activity.labelA, labelB: activity.labelB });
      setLoading(false);
      return;
    }

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
      <h2 className="text-xl font-bold text-strong">🆚 {activity.title}</h2>
      {activity.intro && <p className="mt-1 text-sm text-muted">{activity.intro}</p>}
      <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-body ring-1 ring-hairline">{activity.task}</p>

      {activity.examplePrompts && activity.examplePrompts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {activity.examplePrompts.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={loading}
              className="rounded-full bg-brand/10 border border-brand/20 px-3 py-1 text-xs text-brand hover:bg-brand/20 transition disabled:opacity-40"
              onClick={() => (cannedOnly ? run(ex) : setInput(ex))}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {!cannedOnly && (
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
      )}

      {cannedOnly && !res && !loading && (
        <p className="mt-3 text-center text-xs text-muted-2">위 예시 중 하나를 눌러보세요 ☝️</p>
      )}

      {err && <p className="mt-2 text-sm text-down">{err}</p>}

      {loading && <Thinking text="🧪 실험 중… 두 결과를 비교하고 있어요. 잠깐만!" />}

      <div className="mt-4 grid flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
        <Panel label={res?.labelA ?? activity.labelA} text={res?.outputA} loading={loading} tone="a" />
        <Panel label={res?.labelB ?? activity.labelB} text={res?.outputB} loading={loading} tone="b" />
      </div>

      {res && (
        <p className="mt-3 text-center text-sm text-muted">
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
    <div className={['rounded-xl p-3 ring-1', tone === 'a' ? 'bg-surface-2 ring-hairline' : 'bg-brand/5 ring-brand/30'].join(' ')}>
      <div className="mb-2 inline-block rounded-full bg-surface px-3 py-1 text-xs font-bold ring-1 ring-hairline">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-body">
        {loading ? '…' : text ?? '결과가 여기에 나와요'}
      </div>
    </div>
  );
}
