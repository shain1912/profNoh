import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Deck, Slide, QuizActivity, PollActivity } from '@shared/types';
import { openDeckForEdit, saveDeck, getPin, rememberDeck } from '../lib/buildApi';
import { setInstructor } from '../lib/session';
import { apiPost } from '../lib/api';
import {
  pageKind, addPage, deletePage, movePage, updateSlide, updateActivity,
} from '../lib/deckDraft';
import SlideView from '../components/SlideView';

function applyAIPlan(operations: any[], currentDeck: Deck): { deck: Deck; applied: boolean } {
  let updatedDeck = { ...currentDeck };
  let applied = false;

  const sortedOps = [...operations].sort((a, b) => {
    const idxA = typeof a.afterSlideIndex === 'number' ? a.afterSlideIndex : 0;
    const idxB = typeof b.afterSlideIndex === 'number' ? b.afterSlideIndex : 0;
    return idxB - idxA;
  });

  for (const op of sortedOps) {
    if (!op.activity) continue;
    let actId = '';
    let actObj: any = null;
    let slidePartTitle = '';

    if (op.type === 'add_quiz') {
      actId = 'q_' + Math.random().toString(36).slice(2, 10);
      actObj = {
        type: 'quiz',
        id: actId,
        title: op.activity.title || '퀴즈',
        questions: (op.activity.questions || []).map((q: any) => ({
          id: Math.random().toString(36).slice(2, 10),
          question: q.question,
          options: q.options || ['', ''],
          correctIndex: q.correctIndex ?? 0,
          timeLimitSec: q.timeLimitSec ?? 20,
          explanation: q.explanation || '',
        })),
      };
      slidePartTitle = 'AI 퀴즈';
    } else if (op.type === 'add_poll') {
      actId = 'p_' + Math.random().toString(36).slice(2, 10);
      actObj = {
        type: 'poll',
        id: actId,
        title: op.activity.title || '투표',
        prompt: op.activity.prompt || '',
        mode: op.activity.mode || 'wordcloud',
        options: op.activity.options || [],
      };
      slidePartTitle = 'AI 투표';
    } else if (op.type === 'add_roleplay') {
      actId = 'rp_' + Math.random().toString(36).slice(2, 10);
      actObj = {
        type: 'roleplay',
        id: actId,
        title: op.activity.title || 'AI 역할극',
        intro: op.activity.intro,
        systemPrompt: op.activity.systemPrompt || '너는 가이드야.',
        missionKeyword: op.activity.missionKeyword || '',
        missionDescription: op.activity.missionDescription || '',
      };
      slidePartTitle = 'AI 역할극';
    } else if (op.type === 'add_analogy') {
      actId = 'an_' + Math.random().toString(36).slice(2, 10);
      actObj = {
        type: 'analogy',
        id: actId,
        title: op.activity.title || '눈높이 비유',
        intro: op.activity.intro,
        topicPlaceholder: op.activity.topicPlaceholder,
        personaA: op.activity.personaA || '어린이',
        personaB: op.activity.personaB || '전문가',
      };
      slidePartTitle = '눈높이 비유';
    } else if (op.type === 'add_writing') {
      actId = 'wr_' + Math.random().toString(36).slice(2, 10);
      actObj = {
        type: 'writing',
        id: actId,
        title: op.activity.title || '문학 창작',
        intro: op.activity.intro,
        genre: ['poem', 'story', 'essay'].includes(op.activity.genre) ? op.activity.genre : 'poem',
        promptPlaceholder: op.activity.promptPlaceholder,
      };
      slidePartTitle = '문학 창작';
    } else if (op.type === 'add_tutor') {
      actId = 'tu_' + Math.random().toString(36).slice(2, 10);
      actObj = {
        type: 'tutor',
        id: actId,
        title: op.activity.title || 'AI 튜터',
        intro: op.activity.intro,
        subject: ['math', 'coding', 'general'].includes(op.activity.subject) ? op.activity.subject : 'general',
        taskDescription: op.activity.taskDescription || '문제를 해결해 보세요.',
      };
      slidePartTitle = 'AI 튜터';
    }

    if (actId && actObj) {
      updatedDeck.activities[actId] = actObj;
      const newSlideObj = {
        id: 's_' + Math.random().toString(36).slice(2, 10),
        part: 1,
        partTitle: slidePartTitle,
        layout: 'content' as const,
        title: actObj.title,
        activityId: actId,
        blocks: [],
        notes: '',
      };
      const idx = typeof op.afterSlideIndex === 'number' ? op.afterSlideIndex : updatedDeck.slides.length - 1;
      const targetIdx = Math.max(0, Math.min(updatedDeck.slides.length, idx + 1));
      updatedDeck.slides.splice(targetIdx, 0, newSlideObj);
      applied = true;
    }
  }

  return { deck: updatedDeck, applied };
}

export default function DeckEditor() {
  const { deckId = '' } = useParams();
  const nav = useNavigate();
  const [pin, setPin] = useState(getPin(deckId));
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [needPin, setNeedPin] = useState(!getPin(deckId));
  const [pinInput, setPinInput] = useState('');
  const [status, setStatus] = useState('');

  // AI 강의 제작 조교 상태
  const [pdfText, setPdfText] = useState('');
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'extracting' | 'ready' | 'error'>('idle');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content:
        '안녕하세요! 강의 자료 편집을 돕는 AI 조교입니다. 💡\n\n' +
        'PDF 내용을 학습하여 퀴즈, 투표, 역할극, 비유 대조, 문학 창작, 튜터링 슬라이드를 원하는 위치에 자동 생성해 드립니다.\n\n' +
        '💬 이런 식으로 요청해보세요:\n' +
        '- "3페이지 뒤에 퀴즈 추가해줘"\n' +
        '- "5페이지 뒤에 역할극 실습 추가해줘"\n' +
        '- "7페이지 뒤에 양자역학 비유 비교 추가해줘"',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 퀵 액션 개수 선택 상태
  const [quickCount, setQuickCount] = useState(3);

  async function load(p: string) {
    try {
      const r = await openDeckForEdit(deckId, p);
      setDeck(r.deck); setPin(p); setNeedPin(false);
      rememberDeck({ deckId, title: r.title, pin: p });
    } catch (e: any) { setStatus(e.message ?? '열기 실패'); }
  }
  useEffect(() => { if (pin) load(pin); /* eslint-disable-next-line */ }, []);

  // PDF 텍스트 추출 (백그라운드)
  useEffect(() => {
    if (!deck) return;
    const firstPdfSlide = deck.slides.find((s) => s.layout === 'pdf' && s.pdfUrl);
    if (!firstPdfSlide || !firstPdfSlide.pdfUrl) {
      setPdfStatus('idle');
      return;
    }

    let active = true;
    const extractText = async () => {
      setPdfStatus('extracting');
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error('PDF.js not loaded');

        const pdf = await pdfjsLib.getDocument(firstPdfSlide.pdfUrl).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          text += `[Page ${i}]\n${strings.join(' ')}\n\n`;
        }
        if (active) {
          setPdfText(text);
          setPdfStatus('ready');
        }
      } catch (e) {
        console.error('Failed to extract PDF text:', e);
        if (active) setPdfStatus('error');
      }
    };

    const checkAndExtract = () => {
      if ((window as any).pdfjsLib) {
        extractText();
      } else {
        setTimeout(checkAndExtract, 500);
      }
    };
    checkAndExtract();

    return () => {
      active = false;
    };
  }, [deck?.id]);

  // 스크롤 동기화
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatBusy]);

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

  // 퀵 일괄 추가 기능
  async function handleQuickCreate(type: 'quiz' | 'poll' | 'roleplay' | 'analogy' | 'writing' | 'tutor') {
    if (!deck || chatBusy || pdfStatus !== 'ready') return;
    setChatBusy(true);

    let userMsg = '';
    let typeLabel = '';
    if (type === 'quiz') {
      userMsg = `이 PDF 전체 내용을 학습해서 내용에 어울리는 퀴즈를 총 ${quickCount}개 생성해줘. 각 퀴즈는 PDF 내용의 흐름에 맞춰 서로 다른 슬라이드 번호(afterSlideIndex) 뒤에 골고루 분산하여 배치해줘.`;
      typeLabel = '퀴즈';
    } else if (type === 'poll') {
      userMsg = `이 PDF 전체 내용을 학습해서 학생들이 흥미를 가질 만한 투표를 총 ${quickCount}개 생성해줘. 각 투표는 PDF 내용 흐름에 맞춰 서로 다른 슬라이드 번호(afterSlideIndex) 뒤에 골고루 분산하여 배치해줘.`;
      typeLabel = '투표';
    } else if (type === 'roleplay') {
      userMsg = `이 PDF 전체 내용을 학습해서 학생들이 참여할 수 있는 AI 역할극(roleplay) 활동을 총 ${quickCount}개 생성해줘. 각 역할극은 PDF 내용 흐름에 맞춰 적절한 슬라이드 번호(afterSlideIndex) 뒤에 배치해줘.`;
      typeLabel = '역할극';
    } else if (type === 'analogy') {
      userMsg = `이 PDF 전체 내용을 학습해서 어려운 용어/개념을 비교 분석하는 비유 대조(analogy) 활동을 총 ${quickCount}개 생성해줘. 각 활동은 PDF 내용 흐름에 맞춰 적절한 슬라이드 번호(afterSlideIndex) 뒤에 배치해줘.`;
      typeLabel = '비유 대조';
    } else if (type === 'writing') {
      userMsg = `이 PDF 전체 내용을 학습해서 영감을 주는 릴레이 문학 창작(writing) 활동을 총 ${quickCount}개 생성해줘. 각 활동은 PDF 내용 흐름에 맞춰 적절한 슬라이드 번호(afterSlideIndex) 뒤에 배치해줘.`;
      typeLabel = '문학 창작';
    } else if (type === 'tutor') {
      userMsg = `이 PDF 전체 내용을 학습해서 문제 해결을 돕는 소크라테스 AI 튜터(tutor) 활동을 총 ${quickCount}개 생성해줘. 각 활동은 PDF 내용 흐름에 맞춰 적절한 슬라이드 번호(afterSlideIndex) 뒤에 배치해줘.`;
      typeLabel = 'AI 튜터';
    }

    const nextMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(nextMessages);

    try {
      const res = await apiPost<{ text: string }>('/api/decks/chat-agent', {
        messages: nextMessages,
        deck,
        pdfText,
      });

      const jsonMatch = res.text.match(/```json\s*([\s\S]*?)\s*```/);
      let updatedDeck = { ...deck };
      let operationsApplied = false;

      if (jsonMatch && jsonMatch[1]) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          if (data.operations && Array.isArray(data.operations)) {
            const planRes = applyAIPlan(data.operations, deck);
            updatedDeck = planRes.deck;
            operationsApplied = planRes.applied;
          }
        } catch (jsonErr) {
          console.error('Failed to parse AI operations JSON:', jsonErr);
        }
      }

      const cleanContent = res.text.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
      setMessages([...nextMessages, { role: 'assistant', content: cleanContent || `총 ${quickCount}개의 ${typeLabel} 활동을 일괄 삽입했습니다.` }]);

      if (operationsApplied) {
        setDeck(updatedDeck);
        setStatus('에이전트 변경사항 적용됨 ✓');
        setTimeout(() => setStatus(''), 2000);
      }
    } catch (err: any) {
      console.error(err);
      setMessages([...nextMessages, { role: 'assistant', content: '⚠️ 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }]);
    } finally {
      setChatBusy(false);
    }
  }

  // AI 대화 전송 및 명령 파싱
  async function handleSend() {
    if (!chatInput.trim() || !deck || chatBusy) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatBusy(true);

    const nextMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(nextMessages);

    try {
      const res = await apiPost<{ text: string }>('/api/decks/chat-agent', {
        messages: nextMessages,
        deck,
        pdfText,
      });

      // JSON 블록 파싱 및 슬라이드 동적 추가
      const jsonMatch = res.text.match(/```json\s*([\s\S]*?)\s*```/);
      let updatedDeck = { ...deck };
      let operationsApplied = false;

      if (jsonMatch && jsonMatch[1]) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          if (data.operations && Array.isArray(data.operations)) {
            const planRes = applyAIPlan(data.operations, deck);
            updatedDeck = planRes.deck;
            operationsApplied = planRes.applied;
          }
        } catch (jsonErr) {
          console.error('Failed to parse AI operations JSON:', jsonErr);
        }
      }

      const cleanContent = res.text.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
      setMessages([...nextMessages, { role: 'assistant', content: cleanContent || '슬라이드 변경을 완료했습니다.' }]);

      if (operationsApplied) {
        setDeck(updatedDeck);
        setStatus('에이전트 변경사항 적용됨 ✓');
        setTimeout(() => setStatus(''), 2000);
      }
    } catch (err: any) {
      console.error(err);
      setMessages([...nextMessages, { role: 'assistant', content: '⚠️ 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }]);
    } finally {
      setChatBusy(false);
    }
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

      <div className="grid flex-1 grid-cols-[220px_1fr_360px] overflow-hidden">
        {/* 좌측 슬라이드 리스트 */}
        <aside className="overflow-y-auto border-r border-white/10 p-2 custom-scrollbar">
          {deck.slides.map((s, i) => {
            const act = s.activityId ? deck.activities[s.activityId] : null;
            let icon = '📄 ';
            if (act) {
              if (act.type === 'quiz') icon = '🎮 ';
              else if (act.type === 'poll') icon = '🗳️ ';
              else if (act.type === 'roleplay') icon = '🎭 ';
              else if (act.type === 'analogy') icon = '🔍 ';
              else if (act.type === 'writing') icon = '✍️ ';
              else if (act.type === 'tutor') icon = '🧮 ';
              else if (act.type === 'chat') icon = '💬 ';
              else if (act.type === 'image') icon = '🎨 ';
              else if (act.type === 'lab') icon = '🔬 ';
            }
            return (
              <button
                key={s.id}
                className={[
                  'mb-1 block w-full rounded px-2 py-2 text-left text-sm',
                  i === sel ? 'bg-brand/20 text-brand' : 'hover:bg-white/5',
                ].join(' ')}
                onClick={() => setSel(i)}
              >
                <span className="text-white/40">{i + 1}.</span> {icon}{s.title || '(빈 슬라이드)'}
              </button>
            );
          })}
          <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'slide', sel)); setSel(sel + 1); }}>＋장</button>
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'quiz', sel)); setSel(sel + 1); }}>＋퀴즈</button>
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'poll', sel)); setSel(sel + 1); }}>＋투표</button>
          </div>
        </aside>

        {/* 중앙 편집 폼 */}
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

        {/* 우측 AI 조교 패널 */}
        <aside className="flex flex-col border-l border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-white/5 bg-gradient-to-r from-brand/5 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h2 className="font-extrabold text-sm text-brand">AI 강의 조교</h2>
            </div>
            {pdfStatus === 'extracting' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full animate-pulse">
                문서 학습 중…
              </span>
            )}
            {pdfStatus === 'ready' && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold" title="PDF 텍스트 내용이 조교에게 제공됩니다.">
                학습 완료 ✓
              </span>
            )}
            {pdfStatus === 'error' && (
              <span className="text-[10px] bg-down/20 text-down px-2 py-0.5 rounded-full font-bold">
                학습 실패 ✕
              </span>
            )}
            {pdfStatus === 'idle' && (
              <span className="text-[10px] bg-white/10 text-white/50 px-2 py-0.5 rounded-full">
                일반 조교
              </span>
            )}
          </div>

          {/* AI 퀵 생성 액션 바 */}
          {pdfStatus === 'ready' && (
            <div className="p-3 border-b border-white/10 bg-white/5 space-y-2">
              <div className="text-[11px] font-bold text-white/60 flex items-center justify-between">
                <span>⚡ AI 슬라이드 자동 일괄 생성</span>
                <span className="text-[10px] text-brand/80 font-normal">PDF 기반</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50 shrink-0">생성할 개수:</span>
                  <select
                    className="bg-black/40 text-white text-xs rounded border border-white/10 px-2 py-1 focus:outline-none"
                    value={quickCount}
                    onChange={(e) => setQuickCount(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}개</option>
                    ))}
                  </select>
                  <div className="flex gap-1 flex-1">
                    <button
                      className="btn-ghost text-[11px] py-1 flex-1 bg-brand/10 hover:bg-brand/20 text-brand font-bold rounded transition active:scale-[0.97]"
                      onClick={() => handleQuickCreate('quiz')}
                      disabled={chatBusy}
                    >
                      🎮 퀴즈
                    </button>
                    <button
                      className="btn-ghost text-[11px] py-1 flex-1 bg-brand/10 hover:bg-brand/20 text-brand font-bold rounded transition active:scale-[0.97]"
                      onClick={() => handleQuickCreate('poll')}
                      disabled={chatBusy}
                    >
                      🗳️ 투표
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    className="btn-ghost text-[10px] py-1 bg-white/5 hover:bg-white/10 text-white/80 font-semibold rounded border border-white/10 transition active:scale-[0.97]"
                    onClick={() => handleQuickCreate('roleplay')}
                    disabled={chatBusy}
                    title="AI 역할극 실습 추가"
                  >
                    🎭 역할극
                  </button>
                  <button
                    className="btn-ghost text-[10px] py-1 bg-white/5 hover:bg-white/10 text-white/80 font-semibold rounded border border-white/10 transition active:scale-[0.97]"
                    onClick={() => handleQuickCreate('analogy')}
                    disabled={chatBusy}
                    title="눈높이 비유 대조 추가"
                  >
                    🔍 비유
                  </button>
                  <button
                    className="btn-ghost text-[10px] py-1 bg-white/5 hover:bg-white/10 text-white/80 font-semibold rounded border border-white/10 transition active:scale-[0.97]"
                    onClick={() => handleQuickCreate('writing')}
                    disabled={chatBusy}
                    title="문학 창작 실습 추가"
                  >
                    ✍️ 창작
                  </button>
                  <button
                    className="btn-ghost text-[10px] py-1 bg-white/5 hover:bg-white/10 text-white/80 font-semibold rounded border border-white/10 transition active:scale-[0.97]"
                    onClick={() => handleQuickCreate('tutor')}
                    disabled={chatBusy}
                    title="AI 튜터 힌트 대화 추가"
                  >
                    🧮 튜터
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 대화 구역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm scroll-smooth custom-scrollbar">
            {messages.map((m, i) => (
              <div
                key={i}
                className={[
                  'flex flex-col max-w-[85%] rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap leading-relaxed shadow-sm',
                  m.role === 'user'
                    ? 'bg-brand text-on-brand self-end ml-auto rounded-tr-none'
                    : 'bg-white/10 text-white/90 self-start mr-auto rounded-tl-none border border-white/5',
                ].join(' ')}
              >
                {m.content}
              </div>
            ))}
            {chatBusy && (
              <div className="bg-white/10 text-white/90 self-start mr-auto rounded-2xl rounded-tl-none border border-white/5 p-4 max-w-[85%] w-full space-y-2 animate-pulse">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-brand animate-ping"></span>
                  <span className="text-[10px] text-brand/80 font-bold uppercase tracking-wider">AI Copilot Thinking</span>
                </div>
                <div className="h-3 bg-white/20 rounded w-5/6"></div>
                <div className="h-3 bg-white/20 rounded w-2/3"></div>
                <div className="h-3 bg-white/10 rounded w-3/4"></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 대화 입력창 */}
          <div className="p-3 border-t border-white/10 bg-black/10">
            <div className="flex gap-2">
              <input
                className="input text-sm flex-1 bg-black/30 border border-white/10 focus:border-brand/40 focus:ring-0"
                placeholder={pdfStatus === 'extracting' ? 'PDF를 파싱하고 있습니다…' : 'AI 조교에게 슬라이드 수정을 지시해보세요…'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                disabled={chatBusy || pdfStatus === 'extracting'}
              />
              <button
                className="btn-primary px-3 py-2 font-bold text-xs shrink-0 transition active:scale-[0.97]"
                onClick={handleSend}
                disabled={chatBusy || !chatInput.trim() || pdfStatus === 'extracting'}
              >
                전송
              </button>
            </div>
            <p className="text-[9px] text-white/30 mt-1.5 text-center">
              조교가 추가한 슬라이드는 목록에 자동 추가됩니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SlideForm({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  if (slide.layout === 'pdf') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-brand">📄 PDF 슬라이드 미리보기</h3>
            <span className="text-xs text-white/40">{slide.pageNumber} 페이지</span>
          </div>
          <div className="border border-white/10 rounded-lg overflow-hidden h-[300px] bg-black/20">
            <SlideView slide={slide} />
          </div>
        </div>
        
        <label className="block text-sm text-white/60">제목 (목록 표시용)
          <input className="input mt-1" value={slide.title ?? ''} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        
        <label className="block text-sm text-white/60">강사 노트 (수업 중 본인에게만 표시)
          <textarea className="input mt-1 h-24" value={slide.notes ?? ''} maxLength={400} onChange={(e) => onChange({ notes: e.target.value })} />
        </label>
      </div>
    );
  }

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
