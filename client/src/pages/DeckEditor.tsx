import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Deck, Slide, QuizActivity, PollActivity } from '@shared/types';
import { openDeckForEdit, saveDeck, getPin, rememberDeck } from '../lib/buildApi';
import { setInstructor } from '../lib/session';
import { apiPost } from '../lib/api';
import {
  pageKind, addPage, deletePage, movePage, updateSlide, updateActivity,
} from '../lib/deckDraft';

export default function DeckEditor() {
  const { deckId = '' } = useParams();
  const nav = useNavigate();
  const [pin, setPin] = useState(getPin(deckId));
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [needPin, setNeedPin] = useState(!getPin(deckId));
  const [pinInput, setPinInput] = useState('');
  const [status, setStatus] = useState('');

  async function load(p: string) {
    try {
      const r = await openDeckForEdit(deckId, p);
      setDeck(r.deck); setPin(p); setNeedPin(false);
      rememberDeck({ deckId, title: r.title, pin: p });
    } catch (e: any) { setStatus(e.message ?? '열기 실패'); }
  }
  useEffect(() => { if (pin) load(pin); /* eslint-disable-next-line */ }, []);

  async function save() {
    if (!deck) return;
    setStatus('저장 중…');
    try { await saveDeck(deckId, pin, deck); setStatus('저장됨 ✓'); }
    catch (e: any) { setStatus(e.message ?? '저장 실패'); }
    setTimeout(() => setStatus(''), 2000);
  }

  async function startClass() {
    if (!deck) return;
    await save();
    const r = await apiPost<{ token: string; instructorSecret: string; classroomId: string; deckId: string }>('/api/classrooms', { deckId });
    setInstructor(r);
    nav('/teach');
  }

  if (needPin) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-bold">편집 암호 입력</h1>
        <p className="mt-1 text-sm text-white/50">덱 {deckId} 의 6자리 편집 PIN</p>
        <input className="input mt-4 text-center text-2xl tracking-widest" value={pinInput} maxLength={6} onChange={(e) => setPinInput(e.target.value)} />
        <button className="btn-primary mt-3 w-full" onClick={() => load(pinInput)}>열기</button>
        {status && <p className="mt-2 text-sm text-down">{status}</p>}
      </div>
    );
  }
  if (!deck) return <div className="grid h-full place-items-center text-white/40">불러오는 중… ⏳</div>;

  const slide = deck.slides[sel] ?? deck.slides[0];
  const kind = pageKind(deck, slide);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <input className="input max-w-xs" value={deck.title} maxLength={80} onChange={(e) => setDeck({ ...deck, title: e.target.value })} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-emerald-400">{status}</span>
          <button className="btn-ghost px-3 py-1" onClick={save}>저장</button>
          <button className="btn-primary px-3 py-1" onClick={startClass}>이 덱으로 수업 시작 ▶</button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[220px_1fr] overflow-hidden">
        <aside className="overflow-y-auto border-r border-white/10 p-2">
          {deck.slides.map((s, i) => (
            <button key={s.id} className={['mb-1 block w-full rounded px-2 py-2 text-left text-sm', i === sel ? 'bg-brand/20 text-brand' : 'hover:bg-white/5'].join(' ')} onClick={() => setSel(i)}>
              <span className="text-white/40">{i + 1}.</span> {pageKind(deck, s) === 'quiz' ? '🎮 ' : pageKind(deck, s) === 'poll' ? '🗳️ ' : '📄 '}{s.title || '(빈 슬라이드)'}
            </button>
          ))}
          <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'slide', sel)); setSel(sel + 1); }}>＋장</button>
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'quiz', sel)); setSel(sel + 1); }}>＋퀴즈</button>
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'poll', sel)); setSel(sel + 1); }}>＋투표</button>
          </div>
        </aside>

        <main className="overflow-y-auto p-4">
          <div className="mb-3 flex gap-2 text-sm">
            <button className="btn-ghost px-2 py-1" onClick={() => { setDeck(movePage(deck, sel, -1)); setSel(Math.max(0, sel - 1)); }}>↑ 위로</button>
            <button className="btn-ghost px-2 py-1" onClick={() => { setDeck(movePage(deck, sel, 1)); setSel(Math.min(deck.slides.length - 1, sel + 1)); }}>↓ 아래로</button>
            <button className="btn-ghost px-2 py-1 text-down" onClick={() => { setDeck(deletePage(deck, sel)); setSel(Math.max(0, sel - 1)); }}>🗑 삭제</button>
          </div>

          {kind === 'slide' && <SlideForm slide={slide} onChange={(p) => setDeck(updateSlide(deck, sel, p))} />}
          {kind === 'quiz' && <QuizForm act={deck.activities[slide.activityId!] as QuizActivity} onChange={(a) => setDeck(updateActivity(deck, slide.activityId!, a))} />}
          {kind === 'poll' && <PollForm act={deck.activities[slide.activityId!] as PollActivity} onChange={(a) => setDeck(updateActivity(deck, slide.activityId!, a))} />}
        </main>
      </div>
    </div>
  );
}

function SlideForm({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  const bulletsText = (slide.blocks ?? []).map((b) => b.text).join('\n');
  return (
    <div className="space-y-3">
      <label className="block text-sm text-white/60">제목<input className="input mt-1" value={slide.title ?? ''} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} /></label>
      <label className="block text-sm text-white/60">소제목<input className="input mt-1" value={slide.subtitle ?? ''} maxLength={160} onChange={(e) => onChange({ subtitle: e.target.value })} /></label>
      <label className="block text-sm text-white/60">내용(줄마다 하나)
        <textarea className="input mt-1 h-40" value={bulletsText} onChange={(e) => onChange({ blocks: e.target.value.split('\n').filter(Boolean).map((t) => ({ kind: 'bullet', text: t })) })} />
      </label>
      <label className="block text-sm text-white/60">강사 노트<input className="input mt-1" value={slide.notes ?? ''} maxLength={400} onChange={(e) => onChange({ notes: e.target.value })} /></label>
    </div>
  );
}

function QuizForm({ act, onChange }: { act: QuizActivity; onChange: (a: QuizActivity) => void }) {
  const setQ = (qi: number, patch: Partial<QuizActivity['questions'][number]>) =>
    onChange({ ...act, questions: act.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-4">
      <input className="input" value={act.title} maxLength={80} onChange={(e) => onChange({ ...act, title: e.target.value })} />
      {act.questions.map((q, qi) => (
        <div key={q.id} className="card space-y-2">
          <input className="input" placeholder="문제" value={q.question} maxLength={200} onChange={(e) => setQ(qi, { question: e.target.value })} />
          {q.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input type="radio" checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} title="정답" />
              <input className="input" placeholder={`보기 ${oi + 1}`} value={o} maxLength={120} onChange={(e) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })} />
              {q.options.length > 2 && <button className="text-down" onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi), correctIndex: 0 })}>✕</button>}
            </div>
          ))}
          {q.options.length < 4 && <button className="btn-ghost px-2 py-1 text-sm" onClick={() => setQ(qi, { options: [...q.options, ''] })}>＋ 보기</button>}
          <input className="input" placeholder="해설(정답 공개 시 표시)" value={q.explanation ?? ''} maxLength={300} onChange={(e) => setQ(qi, { explanation: e.target.value })} />
          {act.questions.length > 1 && <button className="text-sm text-down" onClick={() => onChange({ ...act, questions: act.questions.filter((_, i) => i !== qi) })}>문제 삭제</button>}
        </div>
      ))}
      <button className="btn-ghost" onClick={() => onChange({ ...act, questions: [...act.questions, { id: Math.random().toString(36).slice(2, 10), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' }] })}>＋ 문제 추가</button>
    </div>
  );
}

function PollForm({ act, onChange }: { act: PollActivity; onChange: (a: PollActivity) => void }) {
  return (
    <div className="space-y-3">
      <input className="input" placeholder="투표 질문" value={act.prompt} maxLength={200} onChange={(e) => onChange({ ...act, prompt: e.target.value })} />
      <div className="flex gap-2 text-sm">
        <button className={['btn-ghost px-3 py-1', act.mode === 'wordcloud' ? 'text-brand' : ''].join(' ')} onClick={() => onChange({ ...act, mode: 'wordcloud' })}>워드클라우드</button>
        <button className={['btn-ghost px-3 py-1', act.mode === 'choice' ? 'text-brand' : ''].join(' ')} onClick={() => onChange({ ...act, mode: 'choice' })}>객관식</button>
      </div>
      {act.mode === 'choice' && (
        <div className="space-y-2">
          {(act.options ?? []).map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" placeholder={`보기 ${i + 1}`} value={o} maxLength={60} onChange={(e) => onChange({ ...act, options: (act.options ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
              <button className="text-down" onClick={() => onChange({ ...act, options: (act.options ?? []).filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn-ghost px-2 py-1 text-sm" onClick={() => onChange({ ...act, options: [...(act.options ?? []), ''] })}>＋ 보기</button>
        </div>
      )}
    </div>
  );
}
