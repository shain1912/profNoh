import { useState, useRef, useEffect } from 'react';
import type { TutorActivity } from '@shared/types';
import { apiPost } from '../../lib/api';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export default function TutorStudent({
  activity,
  token,
  sessionId,
}: {
  activity: TutorActivity;
  token: string;
  sessionId: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content: `안녕하세요! 여러분의 학습을 돕는 AI 소크라테스 튜터입니다. 
주어진 문제를 해결하다가 막힌 부분이나 막 작성한 풀이/코드를 입력해주시면, 스스로 해답을 찾을 수 있도록 힌트를 드릴게요! 💡`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  async function askTutor() {
    const content = input.trim();
    if (!content || loading) return;
    setErr('');

    const nextMsgs = [...msgs, { role: 'user', content } as Msg];
    setMsgs(nextMsgs);
    setInput('');
    setLoading(true);

    try {
      const res = await apiPost<{ hint: string }>('/api/ai/tutor', {
        token,
        sessionId,
        activityId: activity.id,
        input: content,
      });

      setMsgs((prev) => [...prev, { role: 'assistant', content: res.hint }]);
    } catch (e: any) {
      setErr(e.message ?? '튜터 응답을 가져오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const subjectBadges = {
    math: { label: '수학 🧮', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    coding: { label: '코딩 💻', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    general: { label: '일반 학습 💡', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  };

  const badge = subjectBadges[activity.subject || 'general'];

  return (
    <div className="flex h-full flex-col p-4 bg-gradient-to-b from-transparent to-black/10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span>🧮</span> {activity.title}
        </h2>
        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${badge.color}`}>
          {badge.label}
        </span>
      </div>
      {activity.intro && <p className="text-xs text-white/50 mt-1">{activity.intro}</p>}

      {/* 문제 설명 카드 */}
      <div className="mt-3 rounded-xl p-3 border bg-white/5 border-white/10 text-sm">
        <div className="font-extrabold text-white/60 mb-1 flex items-center gap-1.5">
          <span>📝 실습 과제 설명</span>
        </div>
        <p className="text-white/80 whitespace-pre-wrap leading-relaxed">
          {activity.taskDescription}
        </p>
      </div>

      {/* 대화창 */}
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto rounded-xl bg-black/20 p-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={[
                'inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm shadow-sm',
                m.role === 'user'
                  ? 'bg-brand text-on-brand rounded-tr-none'
                  : 'bg-white/10 rounded-tl-none border border-white/5',
              ].join(' ')}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-left text-white/40 text-xs flex items-center gap-2 animate-pulse">
            <span>튜터가 힌트를 생각하고 있습니다…</span>
            <span className="animate-spin text-brand">⏳</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {err && <p className="mt-2 text-xs text-down">{err}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          askTutor();
        }}
      >
        <input
          className="input flex-1 bg-black/30 border-white/10 text-white"
          placeholder="막힌 부분, 질문, 또는 풀이를 입력해 보세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button className="btn-primary py-2.5" disabled={loading || !input.trim()}>
          질문하기
        </button>
      </form>
    </div>
  );
}
