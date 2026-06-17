import { useState } from 'react';
import type { AnalogyActivity } from '@shared/types';
import { apiPost } from '../../lib/api';

export default function AnalogyStudent({
  activity,
  token,
  sessionId,
}: {
  activity: AnalogyActivity;
  token: string;
  sessionId: string;
}) {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ explanationA: string; explanationB: string } | null>(null);

  async function generateAnalogy() {
    const term = topic.trim();
    if (!term || loading) return;
    setErr('');
    setLoading(true);

    try {
      const res = await apiPost<{ explanationA: string; explanationB: string }>('/api/ai/analogy', {
        token,
        sessionId,
        activityId: activity.id,
        topic: term,
      });
      setResult(res);
    } catch (e: any) {
      setErr(e.message ?? '비유 설명을 생성하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4 bg-gradient-to-b from-transparent to-black/10 overflow-y-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <span>🔍</span> {activity.title}
      </h2>
      {activity.intro && <p className="text-xs text-white/50 mt-1">{activity.intro}</p>}

      {/* 입력 영역 */}
      <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
        <label className="block text-xs font-semibold text-white/60 mb-2">
          알고 싶은 개념이나 단어를 입력하세요:
        </label>
        <div className="flex gap-2">
          <input
            className="input flex-1 bg-black/30 border-white/10 text-white"
            placeholder={activity.topicPlaceholder ?? '예: 블록체인, 양자역학, 인플레이션'}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') generateAnalogy();
            }}
          />
          <button
            className="btn-primary py-2.5 px-5 flex items-center gap-1.5"
            onClick={generateAnalogy}
            disabled={loading || !topic.trim()}
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span> 생성 중
              </>
            ) : (
              '비교하기'
            )}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-down">{err}</p>}
      </div>

      {/* 결과 영역 */}
      {loading && (
        <div className="mt-6 flex-1 flex flex-col items-center justify-center space-y-3 py-10">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin"></div>
            <div className="absolute inset-2 rounded-full border-4 border-amber-500/20 border-b-amber-500 animate-spin-reverse"></div>
          </div>
          <p className="text-sm text-white/60 animate-pulse">두 캐릭터가 열심히 설명하는 중입니다...</p>
        </div>
      )}

      {!loading && result && (
        <div className="mt-6 flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in pb-6">
          {/* 캐릭터 A 설명 */}
          <div className="p-5 rounded-2xl bg-brand/5 border border-brand/20 flex flex-col justify-between hover:border-brand/40 transition-all duration-300 shadow-lg shadow-brand/5">
            <div>
              <span className="inline-block px-2.5 py-1 rounded-full bg-brand/20 text-brand text-xs font-bold mb-3">
                👤 {activity.personaA}의 눈높이 설명
              </span>
              <p className="text-sm leading-relaxed text-white/90 whitespace-pre-line">
                {result.explanationA}
              </p>
            </div>
            <div className="text-right mt-4 text-xs text-brand/60 font-semibold">
              # {topic} # 비유로 배운다
            </div>
          </div>

          {/* 캐릭터 B 설명 */}
          <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col justify-between hover:border-amber-500/40 transition-all duration-300 shadow-lg shadow-amber-500/5">
            <div>
              <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold mb-3">
                👤 {activity.personaB}의 눈높이 설명
              </span>
              <p className="text-sm leading-relaxed text-white/90 whitespace-pre-line">
                {result.explanationB}
              </p>
            </div>
            <div className="text-right mt-4 text-xs text-amber-400/60 font-semibold">
              # {topic} # 색다른 관점
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
