import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Deck, Slide, SlideBlock } from '@shared/types';
import { apiPost } from '../lib/api';
import { createDeck, openDeckForEdit, saveDeck, rememberDeck } from '../lib/buildApi';
import { normalizeEmbedUrl, EMBED_SUPPORTED_LABEL } from '../lib/embed';

const rid = () => 's_' + Math.random().toString(36).slice(2, 10);

// ── 마크다운 → 슬라이드 변환 (여러 장) ──
// #  → 섹션 슬라이드, ## → 새 콘텐츠 슬라이드, - / * → 불릿, > → 인용, 그 외 → 문단
export function markdownToSlides(md: string): Slide[] {
  const slides: Slide[] = [];
  let current: Slide | null = null;
  const push = () => { if (current) slides.push(current); current = null; };
  const ensure = (title = '') => {
    if (!current) current = { id: rid(), part: 1, partTitle: '마크다운', layout: 'content', title, blocks: [], notes: '' };
    return current;
  };

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('# ')) {
      push();
      slides.push({ id: rid(), part: 1, partTitle: '마크다운', layout: 'section', title: line.slice(2).trim(), blocks: [], notes: '' });
    } else if (line.startsWith('## ')) {
      push();
      ensure(line.slice(3).trim());
    } else {
      const s = ensure();
      let block: SlideBlock;
      if (/^[-*] /.test(line)) block = { kind: 'bullet', text: line.slice(2).trim() };
      else if (line.startsWith('> ')) block = { kind: 'quote', text: line.slice(2).trim() };
      else if (line.startsWith('### ')) block = { kind: 'h', text: line.slice(4).trim() };
      else block = { kind: 'p', text: line.replace(/\*\*(.+?)\*\*/g, '$1') };
      s.blocks = [...(s.blocks ?? []), block];
    }
  }
  push();
  return slides;
}

async function createDeckWithSlides(title: string, slides: Slide[]): Promise<{ deckId: string; pin: string }> {
  const r = await createDeck(title);
  const opened = await openDeckForEdit(r.deckId, r.editPin);
  const deck: Deck = { ...opened.deck, title, slides };
  await saveDeck(r.deckId, r.editPin, deck);
  return { deckId: r.deckId, pin: r.editPin };
}

type Tab = 'images' | 'embed' | 'markdown';

// 슬라이드 소스 선택 카드 — PDF 외 소스(이미지·임베드·마크다운)로 덱 만들기
export default function SourceImportCard() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('images');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  // 이미지 업로드
  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const bad = files.find((f) => !/\.(png|jpe?g|webp|gif)$/i.test(f.name));
    if (bad) { setErr(`이미지 파일(png/jpg/webp/gif)만 업로드할 수 있습니다: ${bad.name}`); return; }
    setBusy(true); setErr('');
    try {
      const images = await Promise.all(files.map((f) => new Promise<{ filename: string; base64: string }>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res({ filename: f.name, base64: (reader.result as string).split(',')[1] });
        reader.onerror = () => rej(new Error(`파일을 읽지 못했습니다: ${f.name}`));
        reader.readAsDataURL(f);
      })));
      const title = files[0].name.replace(/\.[^/.]+$/, '').slice(0, 80) || '이미지 강의';
      const r = await apiPost<{ deckId: string; editPin: string; slideCount: number }>('/api/decks/upload-images', { title, images });
      rememberDeck({ deckId: r.deckId, title, pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) {
      setErr(e.message ?? '이미지 업로드에 실패했습니다.');
      setBusy(false);
    }
  }

  // 임베드 URL
  const [embedInput, setEmbedInput] = useState('');
  const [embedTitle, setEmbedTitle] = useState('');
  async function handleEmbed() {
    const r = normalizeEmbedUrl(embedInput);
    if (!r.ok) { setErr(r.message); setNote(''); return; }
    setBusy(true); setErr(''); setNote(r.note ?? '');
    try {
      const title = embedTitle.trim() || `${r.provider} 강의`;
      const slide: Slide = { id: rid(), part: 1, partTitle: r.provider, layout: 'embed', title, embedUrl: r.src, blocks: [], notes: '' };
      const made = await createDeckWithSlides(title, [slide]);
      rememberDeck({ deckId: made.deckId, title, pin: made.pin });
      nav(`/build/${made.deckId}`);
    } catch (e: any) {
      setErr(e.message ?? '덱 생성에 실패했습니다.');
      setBusy(false);
    }
  }

  // 마크다운
  const [mdInput, setMdInput] = useState('');
  const [mdTitle, setMdTitle] = useState('');
  async function handleMarkdown() {
    const slides = markdownToSlides(mdInput);
    if (slides.length === 0) { setErr('변환할 내용이 없습니다. 마크다운 텍스트를 붙여넣어주세요.'); return; }
    setBusy(true); setErr('');
    try {
      const title = mdTitle.trim() || slides[0].title?.slice(0, 80) || '마크다운 강의';
      const made = await createDeckWithSlides(title, slides);
      rememberDeck({ deckId: made.deckId, title, pin: made.pin });
      nav(`/build/${made.deckId}`);
    } catch (e: any) {
      setErr(e.message ?? '덱 생성에 실패했습니다.');
      setBusy(false);
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      className={['flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition', tab === t ? 'bg-brand text-on-brand' : 'bg-white/5 text-white/60 hover:bg-white/10'].join(' ')}
      onClick={() => { setTab(t); setErr(''); setNote(''); }}
    >
      {label}
    </button>
  );

  return (
    <div className="card mt-4 space-y-3 ring-1 ring-brand/30">
      <div className="text-sm font-bold text-brand">🧩 다른 소스로 만들기</div>
      <div className="flex gap-1.5">
        {tabBtn('images', '🖼 이미지')}
        {tabBtn('embed', '🔗 임베드')}
        {tabBtn('markdown', '📝 마크다운')}
      </div>

      {busy ? (
        <div className="rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
          <div className="text-sm text-white/80">슬라이드를 구성하는 중…</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" />
          </div>
        </div>
      ) : (
        <>
          {tab === 'images' && (
            <div className="space-y-2">
              <p className="text-xs text-white/50">
                이미지 여러 장을 선택하면 순서대로 슬라이드가 됩니다. 각 슬라이드에서 PowerPoint·Keynote를 <b>이미지로 내보내기</b>한 파일을 쓰면
                PDF 변환보다 <b className="text-brand">화질이 선명한 고화질 슬라이드</b>를 만들 수 있어요.
              </p>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif" multiple className="hidden" id="images-file-input" onChange={handleImages} />
              <label htmlFor="images-file-input" className="btn-primary w-full py-3 text-center cursor-pointer block font-bold transition active:scale-[0.99]">
                🖼 이미지 여러 장 선택 (순서 = 슬라이드 순서)
              </label>
            </div>
          )}

          {tab === 'embed' && (
            <div className="space-y-2">
              <p className="text-xs text-white/50">
                Google Slides <b>게시 링크</b>(파일 &gt; 공유 &gt; 웹에 게시)·Canva 공유 링크를 붙여넣으면 그대로 수업 슬라이드가 됩니다.
                <br />지원: {EMBED_SUPPORTED_LABEL}
              </p>
              <input className="input text-sm" placeholder="강의 제목 (선택)" value={embedTitle} maxLength={80} onChange={(e) => setEmbedTitle(e.target.value)} />
              <input className="input text-sm" placeholder="https://docs.google.com/presentation/d/e/…/pub" value={embedInput} onChange={(e) => setEmbedInput(e.target.value)} />
              <button className="btn-primary w-full py-2.5 font-bold" disabled={!embedInput.trim()} onClick={handleEmbed}>🔗 임베드 강의 만들기</button>
            </div>
          )}

          {tab === 'markdown' && (
            <div className="space-y-2">
              <p className="text-xs text-white/50">
                마크다운을 붙여넣으면 <b># 제목</b>은 섹션, <b>## 제목</b>은 새 슬라이드, <b>- 항목</b>은 불릿으로 변환됩니다.
              </p>
              <input className="input text-sm" placeholder="강의 제목 (선택)" value={mdTitle} maxLength={80} onChange={(e) => setMdTitle(e.target.value)} />
              <textarea
                className="input h-36 text-xs font-mono"
                placeholder={'# 오리엔테이션\n## 오늘 배울 것\n- 생성형 AI란?\n- 프롬프트 기초'}
                value={mdInput}
                onChange={(e) => setMdInput(e.target.value)}
              />
              <button className="btn-primary w-full py-2.5 font-bold" disabled={!mdInput.trim()} onClick={handleMarkdown}>📝 마크다운으로 만들기</button>
            </div>
          )}
        </>
      )}

      {note && <p className="text-xs text-amber-400">{note}</p>}
      {err && <p className="text-sm text-down">{err}</p>}
    </div>
  );
}
