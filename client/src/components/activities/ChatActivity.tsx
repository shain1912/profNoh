import { useState, useRef, useEffect } from 'react';
import type { ChatActivity as ChatAct } from '@shared/types';
import { apiPost } from '../../lib/api';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatActivity({
  activity,
  token,
  sessionId,
}: {
  activity: ChatAct;
  token: string;
  sessionId: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setErr('');
    const next = [...msgs, { role: 'user', content } as Msg];
    setMsgs(next);
    setInput('');
    setLoading(true);
    try {
      const r = await apiPost<{ reply: string }>('/api/ai/chat', {
        token,
        sessionId,
        activityId: activity.id,
        messages: next,
      });
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply }]);
    } catch (e: any) {
      setErr(e.message ?? '오류가 발생했어');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-xl font-bold">{activity.title}</h2>
      {activity.intro && <p className="mt-1 text-sm text-white/60">{activity.intro}</p>}

      {activity.missions && msgs.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activity.missions.map((m, i) => (
            <button key={i} className="rounded-full bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/20" onClick={() => send(m)}>
              ✨ {m}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto rounded-xl bg-black/20 p-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={[
                'inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-left',
                m.role === 'user' ? 'bg-brand text-on-brand' : 'bg-white/10',
              ].join(' ')}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-left text-white/50">AI가 생각하는 중… 🤔</div>}
        <div ref={endRef} />
      </div>

      {err && <p className="mt-2 text-sm text-down">{err}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="input"
          placeholder="AI에게 하고 싶은 말을 입력…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" disabled={loading}>
          보내기
        </button>
      </form>
    </div>
  );
}
