import { useState, useRef, useEffect } from 'react';
import type { RoleplayActivity as RoleplayAct } from '@shared/types';
import { apiPost } from '../../lib/api';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export default function RoleplayStudent({
  activity,
  token,
  sessionId,
  socket,
}: {
  activity: RoleplayAct;
  token: string;
  sessionId: string;
  socket: any;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: `역할극에 오신 것을 환영합니다! 아래 미션을 완수해 주세요.\n\n🎯 미션: ${activity.missionDescription}` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [cleared, setCleared] = useState(false);
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
      const r = await apiPost<{ reply: string; missionClear: boolean }>('/api/ai/roleplay', {
        token,
        sessionId,
        activityId: activity.id,
        messages: next,
      });

      setMsgs((m) => [...m, { role: 'assistant', content: r.reply }]);

      if (r.missionClear && !cleared) {
        setCleared(true);
        // Emit socket event to claim points on backend
        if (socket) {
          socket.emit('student:roleplayClear', { activityId: activity.id });
        }
      }
    } catch (e: any) {
      setErr(e.message ?? '오류가 발생했어');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4 bg-gradient-to-b from-transparent to-black/10">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <span>🎭</span> {activity.title}
      </h2>
      {activity.intro && <p className="text-xs text-white/50 mt-1">{activity.intro}</p>}

      {/* 미션 정보 카드 */}
      <div className={['mt-3 rounded-xl p-3 border text-sm transition-all duration-500', 
        cleared 
          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 ring-2 ring-emerald-500/30' 
          : 'bg-brand/10 border-brand/20 text-brand'
      ].join(' ')}>
        <div className="font-extrabold flex items-center gap-1.5">
          <span>{cleared ? '🎉 MISSION CLEAR' : '🎯 TARGET MISSION'}</span>
        </div>
        <p className="mt-1 text-white/80">{activity.missionDescription}</p>
        {cleared && (
          <p className="mt-2 text-xs text-emerald-400 font-semibold animate-pulse">
            ★ 미션 성공 보너스 500점이 리더보드에 가산되었습니다!
          </p>
        )}
      </div>

      {/* 채팅 내역 */}
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
          <div className="text-left text-white/40 text-xs flex items-center gap-2">
            <span>AI가 응답을 생각하고 있습니다…</span>
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
          send(input);
        }}
      >
        <input
          className="input flex-1 bg-black/30 border-white/10"
          placeholder={cleared ? '미션에 성공했습니다! 대화를 계속 나눌 수 있습니다.' : 'AI에게 알맞은 대화를 입력…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button className="btn-primary py-2.5" disabled={loading || !input.trim()}>
          전송
        </button>
      </form>
    </div>
  );
}
