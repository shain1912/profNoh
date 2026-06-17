import { useState } from 'react';
import type { WritingActivity } from '@shared/types';
import { apiPost } from '../../lib/api';
import { getNickname } from '../../lib/session';

export default function WritingStudent({
  activity,
  token,
  sessionId,
}: {
  activity: WritingActivity;
  token: string;
  sessionId: string;
}) {
  const nickname = getNickname() || '학생';
  const [input, setInput] = useState('');
  const [genre, setGenre] = useState<'poem' | 'story' | 'essay'>(activity.genre || 'poem');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function generateWriting() {
    const text = input.trim();
    if (!text || loading) return;
    setErr('');
    setLoading(true);

    try {
      const res = await apiPost<{ output: string }>('/api/ai/writing', {
        token,
        sessionId,
        activityId: activity.id,
        input: text,
        genre,
      });
      setResult(res.output);
    } catch (e: any) {
      setErr(e.message ?? '창작 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const genreLabels = {
    poem: '시 📝',
    story: '초단편 소설 📚',
    essay: '에세이 수필 🖋️',
  };

  return (
    <div className="flex h-full flex-col p-4 bg-gradient-to-b from-transparent to-black/10 overflow-y-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <span>✍️</span> {activity.title}
      </h2>
      {activity.intro && <p className="text-xs text-white/50 mt-1">{activity.intro}</p>}

      {/* 설정 및 입력란 */}
      <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-white/60">창작 장르 선택:</span>
          {/* 강사가 덱에 고정한 장르가 있다면 선택 비활성화 또는 고정 표기 */}
          {activity.genre ? (
            <span className="px-3 py-1 text-xs rounded-full bg-brand/20 text-brand font-bold">
              {genreLabels[activity.genre]}
            </span>
          ) : (
            <div className="flex gap-1">
              {(['poem', 'story', 'essay'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={[
                    'px-2.5 py-1 text-xs rounded-lg transition-all',
                    genre === g
                      ? 'bg-brand text-on-brand font-bold'
                      : 'bg-white/10 text-white/60 hover:bg-white/15',
                  ].join(' ')}
                >
                  {genreLabels[g].split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block text-xs font-semibold text-white/60 mb-2">
          영감을 줄 수 있는 키워드나 첫 문장을 입력해 보세요:
        </label>
        <textarea
          className="w-full h-20 p-3 rounded-xl bg-black/30 border border-white/10 text-sm focus:border-brand/40 focus:ring-1 focus:ring-brand/40 outline-none resize-none text-white"
          placeholder={activity.promptPlaceholder ?? '예: 차가운 겨울 바람과 따뜻한 코코아'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        
        <div className="mt-3 flex justify-end">
          <button
            className="btn-primary py-2 px-6 flex items-center gap-2 text-sm font-semibold"
            onClick={generateWriting}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span> 창작 중
              </>
            ) : (
              '작품 생성하기'
            )}
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-down">{err}</p>}
      </div>

      {/* 결과 영역: 감성 엽서/원고지 스타일 */}
      {loading && (
        <div className="mt-6 flex-1 flex flex-col items-center justify-center space-y-3 py-10">
          <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-white/60 animate-pulse">AI 작가가 감성을 담아 글을 쓰는 중입니다...</p>
        </div>
      )}

      {!loading && result && (
        <div className="mt-6 flex-1 flex justify-center animate-fade-in pb-8">
          <div className="relative w-full max-w-lg p-6 rounded-2xl bg-[#faf6ee] text-[#2c2c2a] border border-[#e6dfd3] shadow-2xl flex flex-col justify-between font-serif min-h-[300px]">
            {/* 엽서 우표 영역 */}
            <div className="absolute top-4 right-4 w-12 h-16 border-2 border-dashed border-[#8d7c66] flex flex-col items-center justify-center text-[10px] text-[#8d7c66] select-none">
              <span className="text-xs">📮</span>
              <span>POST</span>
            </div>

            {/* 본문 */}
            <div className="mt-6 flex-1">
              <div className="text-[11px] uppercase tracking-widest text-[#8d7c66] font-sans font-bold border-b border-[#ebdcb9] pb-1 mb-4">
                {genreLabels[genre]}
              </div>
              <p className="text-base leading-loose whitespace-pre-wrap font-medium tracking-wide text-[#3a352d] px-1 italic">
                {result}
              </p>
            </div>

            {/* 푸터 (To/From) */}
            <div className="mt-8 border-t border-[#ebdcb9] pt-4 flex justify-between items-center text-xs text-[#8d7c66] font-sans font-semibold">
              <div>
                <span>To. {nickname} 님에게</span>
              </div>
              <div className="italic">
                <span>Created by AI Writer</span>
              </div>
            </div>

            {/* 원고지 느낌 격자 데코 (배경 효과) */}
            <div className="absolute inset-0 pointer-events-none rounded-2xl opacity-10 bg-[radial-gradient(#8d7c66_1px,transparent_1px)] [background-size:16px_16px]"></div>
          </div>
        </div>
      )}
    </div>
  );
}
