import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Deck, Slide } from '@shared/types';
import { openDeckForEdit, saveDeck, getPin, rememberDeck, deleteDeck, forgetDeck } from '../lib/buildApi';
import { apiPost } from '../lib/api';
import {
  pageKind, addPage, deletePage, movePage, updateSlide, updateActivity,
} from '../lib/deckDraft';
import SlideView from '../components/SlideView';
import { ACTIVITY_TYPES, AI_QUICK_TYPES, ACTIVITY_DEFS, activityDef } from '../activities/registry';
import EmbedSlideForm from '../components/EmbedSlideForm';

function applyAIPlan(operations: any[], currentDeck: Deck): { deck: Deck; applied: boolean } {
  let updatedDeck = { ...currentDeck };
  let applied = false;

  const sortedOps = [...operations].sort((a, b) => {
    const idxA = typeof a.afterSlideIndex === 'number' ? a.afterSlideIndex : 0;
    const idxB = typeof b.afterSlideIndex === 'number' ? b.afterSlideIndex : 0;
    return idxB - idxA;
  });

  for (const op of sortedOps) {
    if (!op.activity || typeof op.type !== 'string' || !op.type.startsWith('add_')) continue;
    // 활동 생성은 레지스트리(activities/registry.ts)의 fromAI 로 일원화 — 새 활동 타입은 def 등록만으로 적용됨
    const def = activityDef(op.type.slice(4));
    if (!def) continue;
    const actId = def.type.slice(0, 2) + '_' + Math.random().toString(36).slice(2, 10);
    const actObj = def.fromAI(op.activity, actId);
    const slidePartTitle = `AI ${def.label}`;

    {
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
  const [activeTab, setActiveTab] = useState<'slides' | 'edit' | 'ai'>('edit');

  // AI 강의 제작 조교 상태
  const [pdfText, setPdfText] = useState('');
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'extracting' | 'ready' | 'error'>('idle');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content:
        '안녕하세요! 강의 자료 편집을 돕는 AI 조교입니다. 💡\n\n' +
        'PDF 내용을 학습하여 퀴즈, 투표, 역할극, 비유 대조, 문학 창작, AI 튜터, AI 자유 대화, 이미지 생성, 비교 실습 랩 슬라이드를 원하는 위치에 자동 생성해 드립니다.\n\n' +
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

  // 강의 삭제 상태
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  async function handleDelete() {
    setDeleteBusy(true);
    setDeleteErr('');
    try {
      await deleteDeck(deckId, pin);
      forgetDeck(deckId);
      nav('/build');
    } catch (e: any) {
      setDeleteErr(e.message ?? '삭제 실패');
      setDeleteBusy(false);
    }
  }

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
    nav('/teach', { state: { creds: r } });
  }

  // 퀵 일괄 추가 기능 — 위치 계획과 항목별 생성을 서버에서 단계적으로 처리하는 전용 엔드포인트 사용
  // 생성 가능한 타입/라벨은 레지스트리(activities/registry.ts)에서 가져온다
  async function handleQuickCreate(type: (typeof AI_QUICK_TYPES)[number]) {
    if (!deck || chatBusy || pdfStatus !== 'ready') return;
    setChatBusy(true);

    const typeLabel = ACTIVITY_DEFS[type].label;
    const userMsg = `이 PDF 전체 내용을 학습해서 내용 흐름에 맞는 ${typeLabel} 활동을 총 ${quickCount}개 생성하고, 적절한 위치에 골고루 분산 배치해줘.`;
    const nextMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(nextMessages);

    try {
      const res = await apiPost<{ operations: any[]; message: string }>('/api/decks/quick-generate', {
        deck, pdfText, type, count: quickCount,
      });

      const planRes = applyAIPlan(res.operations ?? [], deck);
      setMessages([...nextMessages, { role: 'assistant', content: res.message }]);

      if (planRes.applied) {
        setDeck(planRes.deck);
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
      const res = await apiPost<{ text: string; operations: any[] }>('/api/decks/chat-agent', {
        messages: nextMessages,
        deck,
        pdfText,
      });

      const planRes = applyAIPlan(res.operations ?? [], deck);
      setMessages([...nextMessages, { role: 'assistant', content: res.text || '슬라이드 변경을 완료했습니다.' }]);

      if (planRes.applied) {
        setDeck(planRes.deck);
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
        <h1 className="text-xl font-bold text-strong">편집 암호 입력</h1>
        <p className="mt-1 text-sm text-muted">덱 {deckId} 의 6자리 편집 PIN</p>
        <input className="input mt-4 text-center text-2xl tracking-widest" value={pinInput} maxLength={6} onChange={(e) => setPinInput(e.target.value)} />
        <button className="btn-primary mt-3 w-full" onClick={() => load(pinInput)}>열기</button>
        {status && <p className="mt-2 text-sm text-down">{status}</p>}
      </div>
    );
  }
  if (!deck) return <div className="grid h-full place-items-center text-muted-2">불러오는 중… ⏳</div>;

  const slide = deck.slides[sel] ?? deck.slides[0];
  const kind = pageKind(deck, slide);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline px-4 py-3 bg-surface">
        <div className="flex items-center gap-2 w-full sm:max-w-xs">
          <span className="text-lg">🛠️</span>
          <input className="input py-2 text-sm flex-1" value={deck.title} maxLength={80} onChange={(e) => setDeck({ ...deck, title: e.target.value })} placeholder="강의 제목" />
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          <span className="text-xs text-up">{status}</span>
          <div className="flex gap-2">
            <button className="btn bg-surface-2 hover:bg-surface-3 text-sm px-4 py-2 ring-1 ring-hairline rounded-lg" onClick={save}>저장</button>
            <button className="btn-primary text-sm px-4 py-2 rounded-lg" onClick={startClass}>수업 시작 ▶</button>
            <button
              className="btn text-sm px-3 py-2 ring-1 ring-hairline rounded-lg text-muted-2 hover:text-down hover:ring-down/40"
              title="강의 삭제"
              onClick={() => setDeleteConfirm(true)}
            >
              🗑
            </button>
          </div>
        </div>
      </header>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleteBusy && setDeleteConfirm(false)}>
          <div className="modal-card max-w-sm ring-down/40" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-down">🗑 강의 삭제</h2>
            <p className="mt-2 text-sm text-body">
              "{deck.title}" 강의를 정말 삭제할까요? 저장된 슬라이드와 업로드한 PDF가 모두 삭제되며, 되돌릴 수 없습니다.
            </p>
            {deleteErr && <p className="mt-2 text-sm text-down">{deleteErr}</p>}
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteConfirm(false)} disabled={deleteBusy}>취소</button>
              <button className="btn bg-down text-white flex-1 font-bold rounded-lg disabled:opacity-40" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? '삭제 중…' : '삭제할게요'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 전용 탭 바 (lg 미만에서 노출) */}
      <div className="flex lg:hidden border-b border-hairline bg-surface shrink-0">
        <button
          className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
            activeTab === 'slides' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-muted hover:text-strong'
          }`}
          onClick={() => setActiveTab('slides')}
        >
          📄 목록 ({deck.slides.length})
        </button>
        <button
          className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
            activeTab === 'edit' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-muted hover:text-strong'
          }`}
          onClick={() => setActiveTab('edit')}
        >
          ✍️ 편집
        </button>
        <button
          className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
            activeTab === 'ai' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-muted hover:text-strong'
          }`}
          onClick={() => setActiveTab('ai')}
        >
          ✨ AI 조교
          {pdfStatus === 'ready' && <span className="ml-1 text-[8px] bg-up/10 text-up px-1 py-0.5 rounded font-bold">ON</span>}
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_360px] overflow-hidden">
        {/* 좌측 슬라이드 리스트 */}
        <aside className={`${activeTab === 'slides' ? 'block' : 'hidden'} lg:block overflow-y-auto border-r border-hairline bg-surface p-2 custom-scrollbar`}>
          {deck.slides.map((s, i) => {
            const act = s.activityId ? deck.activities[s.activityId] : null;
            let icon = '📄 ';
            if (s.layout === 'embed') icon = '🔗 ';
            else if (s.layout === 'image') icon = '🖼 ';
            if (act) icon = `${activityDef(act.type)?.icon ?? '📄'} `;
            return (
              <button
                key={s.id}
                className={[
                  'mb-1 block w-full rounded-lg px-2 py-2 text-left text-sm',
                  i === sel ? 'bg-brand/10 text-brand font-semibold' : 'hover:bg-surface-2',
                ].join(' ')}
                onClick={() => {
                  setSel(i);
                  setActiveTab('edit');
                }}
              >
                <span className="text-muted-2">{i + 1}.</span> {icon}{s.title || '(빈 슬라이드)'}
              </button>
            );
          })}
          <div className="mt-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'slide', sel)); setSel(sel + 1); setActiveTab('edit'); }}>＋ 슬라이드</button>
              <button className="btn-ghost py-1" title="Google Slides·Canva 등 외부 슬라이드 임베드" onClick={() => { setDeck(addPage(deck, 'embed', sel)); setSel(sel + 1); setActiveTab('edit'); }}>🔗 임베드</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t}
                  className="btn-ghost py-1"
                  title={`${ACTIVITY_DEFS[t].label} 추가`}
                  onClick={() => { setDeck(addPage(deck, t, sel)); setSel(sel + 1); setActiveTab('edit'); }}
                >
                  {ACTIVITY_DEFS[t].icon} {ACTIVITY_DEFS[t].label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 중앙 편집 폼 */}
        <main className={`${activeTab === 'edit' ? 'block' : 'hidden'} lg:block overflow-y-auto p-4`}>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <button className="btn-ghost px-2 py-1" onClick={() => { setDeck(movePage(deck, sel, -1)); setSel(Math.max(0, sel - 1)); }}>↑ 위로</button>
            <button className="btn-ghost px-2 py-1" onClick={() => { setDeck(movePage(deck, sel, 1)); setSel(Math.min(deck.slides.length - 1, sel + 1)); }}>↓ 아래로</button>
            <button className="btn-ghost px-2 py-1 text-down" onClick={() => { setDeck(deletePage(deck, sel)); setSel(Math.max(0, sel - 1)); }}>🗑 삭제</button>
          </div>

          {kind === 'slide' ? (
            <SlideForm slide={slide} onChange={(p) => setDeck(updateSlide(deck, sel, p))} />
          ) : (() => {
            // 활동 편집 폼은 레지스트리(activities/defs/*.tsx)에서 타입별로 가져온다
            const def = ACTIVITY_DEFS[kind];
            const ActEditor = def.Editor;
            const act = deck.activities[slide.activityId!];
            const anonValue: 'default' | 'anon' | 'named' =
              act.anonymous === true ? 'anon' : act.anonymous === false ? 'named' : 'default';
            const setAnon = (v: 'default' | 'anon' | 'named') => {
              const { anonymous: _drop, ...rest } = act as any;
              const next = v === 'default' ? rest : { ...rest, anonymous: v === 'anon' };
              setDeck(updateActivity(deck, slide.activityId!, next));
            };
            return (
              <div className="space-y-3">
                <div className="text-sm font-bold text-brand">{def.icon} {def.label} 편집</div>
                <ActEditor act={act} onChange={(a: any) => setDeck(updateActivity(deck, slide.activityId!, a))} />
                {/* 활동 단위 익명 오버라이드 — 세션 정책(강의 시작 시 선택)보다 우선. "항상 익명/항상 닉네임" 세션에서는 무시됨 */}
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="mb-1 text-sm text-white/60">🔒 참가자 이름 표시</div>
                  <div className="flex flex-wrap gap-2 text-sm" data-testid="activity-anon">
                    {([
                      ['default', '세션 기본값'],
                      ['anon', '🔒 익명'],
                      ['named', '🙂 닉네임'],
                    ] as const).map(([v, label]) => (
                      <button
                        key={v}
                        data-testid={`activity-anon-${v}`}
                        className={['btn-ghost px-3 py-1', anonValue === v ? 'text-brand ring-1 ring-brand/40' : ''].join(' ')}
                        onClick={() => setAnon(v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    익명이면 롤링페이퍼 서명·투표 응답자 이름·리포트 개별 응답이 감춰집니다. 세션이 "항상 익명/항상 닉네임"이면 이 설정은 무시돼요.
                  </p>
                </div>
              </div>
            );
          })()}
        </main>

        {/* 우측 AI 조교 패널 */}
        <aside className={`${activeTab === 'ai' ? 'flex' : 'hidden'} lg:flex flex-col border-l border-hairline bg-surface overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3 bg-gradient-to-r from-brand/5 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <h2 className="font-extrabold text-sm text-brand">AI 강의 조교</h2>
            </div>
            {pdfStatus === 'extracting' && (
              <span className="text-[10px] bg-warn/10 text-warn px-2 py-0.5 rounded-full animate-pulse">
                문서 학습 중…
              </span>
            )}
            {pdfStatus === 'ready' && (
              <span className="text-[10px] bg-up/10 text-up px-2 py-0.5 rounded-full font-bold" title="PDF 텍스트 내용이 조교에게 제공됩니다.">
                학습 완료 ✓
              </span>
            )}
            {pdfStatus === 'error' && (
              <span className="text-[10px] bg-down/10 text-down px-2 py-0.5 rounded-full font-bold">
                학습 실패 ✕
              </span>
            )}
            {pdfStatus === 'idle' && (
              <span className="text-[10px] bg-surface-2 text-muted px-2 py-0.5 rounded-full ring-1 ring-hairline">
                일반 조교
              </span>
            )}
          </div>

          {/* AI 퀵 생성 액션 바 */}
          {pdfStatus === 'ready' && (
            <div className="p-3 border-b border-hairline bg-surface-2/60 space-y-2">
              <div className="text-[11px] font-bold text-muted flex items-center justify-between">
                <span>⚡ AI 슬라이드 자동 일괄 생성</span>
                <span className="text-[10px] text-brand/80 font-normal">PDF 기반</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted shrink-0">생성할 개수:</span>
                  <select
                    className="bg-surface text-body text-xs rounded-lg border border-hairline px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/40"
                    value={quickCount}
                    onChange={(e) => setQuickCount(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}개</option>
                    ))}
                  </select>
                  <div className="flex gap-1 flex-1">
                    <button
                      className="btn text-[11px] py-1 flex-1 bg-brand/10 hover:bg-brand/20 text-brand font-bold rounded-lg transition active:scale-[0.97]"
                      onClick={() => handleQuickCreate('quiz')}
                      disabled={chatBusy}
                    >
                      🎮 퀴즈
                    </button>
                    <button
                      className="btn text-[11px] py-1 flex-1 bg-brand/10 hover:bg-brand/20 text-brand font-bold rounded-lg transition active:scale-[0.97]"
                      onClick={() => handleQuickCreate('poll')}
                      disabled={chatBusy}
                    >
                      🗳️ 투표
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {AI_QUICK_TYPES.filter((t) => t !== 'quiz' && t !== 'poll').map((t) => (
                    <button
                      key={t}
                      className="btn-ghost text-[10px] py-1 font-semibold rounded-lg transition active:scale-[0.97]"
                      onClick={() => handleQuickCreate(t)}
                      disabled={chatBusy}
                      title={`${ACTIVITY_DEFS[t].label} 추가`}
                    >
                      {ACTIVITY_DEFS[t].icon} {ACTIVITY_DEFS[t].label}
                    </button>
                  ))}
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
                    : 'bg-surface-2 text-body self-start mr-auto rounded-tl-none ring-1 ring-hairline',
                ].join(' ')}
              >
                {m.content}
              </div>
            ))}
            {chatBusy && (
              <div className="bg-surface-2 text-body self-start mr-auto rounded-2xl rounded-tl-none ring-1 ring-hairline p-4 max-w-[85%] w-full space-y-2 animate-pulse">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-brand animate-ping"></span>
                  <span className="text-[10px] text-brand/80 font-bold uppercase tracking-wider">AI Copilot Thinking</span>
                </div>
                <div className="h-3 bg-surface-3 rounded w-5/6"></div>
                <div className="h-3 bg-surface-3 rounded w-2/3"></div>
                <div className="h-3 bg-surface-3/60 rounded w-3/4"></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 대화 입력창 */}
          <div className="p-3 border-t border-hairline bg-surface">
            <div className="flex gap-2">
              <input
                className="input text-sm flex-1"
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
            <p className="text-[9px] text-muted-2 mt-1.5 text-center">
              조교가 추가한 슬라이드는 목록에 자동 추가됩니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SlideForm({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  if (slide.layout === 'embed') {
    return <EmbedSlideForm slide={slide} onChange={onChange} />;
  }

  if (slide.layout === 'image') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-brand">🖼 이미지 슬라이드 미리보기</h3>
            <span className="text-xs text-white/40">원본 화질 그대로 표시</span>
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

  if (slide.layout === 'pdf') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-hairline bg-surface-2 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-brand">📄 PDF 슬라이드 미리보기</h3>
            <span className="text-xs text-muted-2">{slide.pageNumber} 페이지</span>
          </div>
          <div className="border border-hairline rounded-lg overflow-hidden h-[300px] bg-surface">
            <SlideView slide={slide} />
          </div>
        </div>
        
        <label className="block text-sm text-muted">제목 (목록 표시용)
          <input className="input mt-1" value={slide.title ?? ''} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
        </label>

        <label className="block text-sm text-muted">유튜브 동영상 링크 (선택)
          <input className="input mt-1" placeholder="예: https://www.youtube.com/watch?v=..." value={slide.youtubeUrl ?? ''} onChange={(e) => onChange({ youtubeUrl: e.target.value })} />
        </label>
        
        <label className="block text-sm text-muted">강사 노트 (수업 중 본인에게만 표시)
          <textarea className="input mt-1 h-24" value={slide.notes ?? ''} maxLength={400} onChange={(e) => onChange({ notes: e.target.value })} />
        </label>
      </div>
    );
  }

  const bulletsText = (slide.blocks ?? []).map((b) => b.text).join('\n');
  return (
    <div className="space-y-3">
      <label className="block text-sm text-muted">제목<input className="input mt-1" value={slide.title ?? ''} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} /></label>
      <label className="block text-sm text-muted">소제목<input className="input mt-1" value={slide.subtitle ?? ''} maxLength={160} onChange={(e) => onChange({ subtitle: e.target.value })} /></label>
      <label className="block text-sm text-muted">유튜브 동영상 링크 (선택)
        <input className="input mt-1" placeholder="예: https://www.youtube.com/watch?v=..." value={slide.youtubeUrl ?? ''} onChange={(e) => onChange({ youtubeUrl: e.target.value })} />
      </label>
      <label className="block text-sm text-muted">내용(줄마다 하나)
        <textarea className="input mt-1 h-40" value={bulletsText} onChange={(e) => onChange({ blocks: e.target.value.split('\n').filter(Boolean).map((t) => ({ kind: 'bullet', text: t })) })} />
      </label>
      <label className="block text-sm text-muted">강사 노트<input className="input mt-1" value={slide.notes ?? ''} maxLength={400} onChange={(e) => onChange({ notes: e.target.value })} /></label>
    </div>
  );
}
