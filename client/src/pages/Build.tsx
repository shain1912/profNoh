import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDeck, generateDeck, getMyDecks, rememberDeck } from '../lib/buildApi';

const TOPIC_CHIPS = ['생성형 AI 입문', 'AI 윤리와 안전', '프롬프트 기초', 'AI와 진로', '딥러닝 쉽게 이해하기'];
const AUDIENCE_CHIPS = ['중학교 1학년', '고등학교 1학년', '고등학교 2학년', '일반 성인'];

export default function Build() {
  const nav = useNavigate();
  const mine = getMyDecks();

  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function makeBlank() {
    setBusy(true); setErr('');
    try {
      const r = await createDeck(title.trim() || '새 강의');
      rememberDeck({ deckId: r.deckId, title: title.trim() || '새 강의', pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setErr(e.message ?? '생성 실패'); } finally { setBusy(false); }
  }

  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('고등학교 1학년');
  const [parts, setParts] = useState(3);
  const [quizPerPart, setQuizPerPart] = useState(1);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  async function makeAi() {
    setGenBusy(true); setGenErr('');
    try {
      const r = await generateDeck({ topic: topic.trim(), audience, parts, quizPerPart });
      rememberDeck({ deckId: r.deckId, title: topic.trim(), pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setGenErr(e.message ?? '생성 실패'); } finally { setGenBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-extrabold">강의 만들기 🛠️</h1>

      <div className="card mt-4 space-y-3 ring-1 ring-brand/30">
        <div className="text-sm font-bold text-brand">✨ AI로 만들기</div>
        {step === 1 ? (
          <>
            <input className="input" placeholder="강의 주제를 적어줘" value={topic} maxLength={80} onChange={(e) => setTopic(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {TOPIC_CHIPS.map((c) => (
                <button key={c} className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setTopic(c)}>{c}</button>
              ))}
            </div>
            <button className="btn-primary w-full" disabled={!topic.trim()} onClick={() => setStep(2)}>다음 ▶</button>
          </>
        ) : (
          <>
            <div className="text-sm text-white/70">주제: <b>{topic}</b></div>
            <div>
              <div className="mb-1 text-sm text-white/60">대상</div>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_CHIPS.map((c) => (
                  <button key={c} className={['rounded-full px-3 py-1 text-sm', audience === c ? 'bg-brand text-on-brand' : 'bg-white/10 hover:bg-white/20'].join(' ')} onClick={() => setAudience(c)}>{c}</button>
                ))}
              </div>
            </div>
            <label className="block text-sm text-white/60">파트 수: {parts}
              <input type="range" min={2} max={6} value={parts} className="w-full" onChange={(e) => setParts(Number(e.target.value))} />
            </label>
            <label className="block text-sm text-white/60">파트당 퀴즈: {quizPerPart}
              <input type="range" min={0} max={3} value={quizPerPart} className="w-full" onChange={(e) => setQuizPerPart(Number(e.target.value))} />
            </label>
            {genBusy ? (
              <div className="rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
                <div className="text-sm text-white/80">✨ AI가 강의를 만드는 중… 최대 30초 정도 걸려요</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" /></div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="btn-ghost px-4" onClick={() => setStep(1)}>← 이전</button>
                <button className="btn-primary flex-1" onClick={makeAi}>✨ 강의 만들기</button>
              </div>
            )}
            {genErr && <p className="text-sm text-down">{genErr}</p>}
          </>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-white/50">또는 빈 강의로 직접 만들기</summary>
        <div className="card mt-2 space-y-3">
          <input className="input" placeholder="강의 제목" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-ghost w-full" onClick={makeBlank} disabled={busy}>{busy ? '만드는 중…' : '＋ 빈 강의 만들기'}</button>
          {err && <p className="text-sm text-down">{err}</p>}
        </div>
      </details>

      <h2 className="mt-8 text-lg font-bold">내 강의</h2>
      {mine.length === 0 ? (
        <p className="mt-2 text-white/50">아직 만든 강의가 없어요.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {mine.map((d) => (
            <button key={d.deckId} className="btn-ghost justify-between" onClick={() => nav(`/build/${d.deckId}`)}>
              <span>{d.title}</span><span className="text-xs text-white/40">{d.deckId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
