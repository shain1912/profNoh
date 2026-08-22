import { useEffect, useState } from 'react';
import type { Slide } from '@shared/types';
import { normalizeEmbedUrl, EMBED_SUPPORTED_LABEL, isSafeEmbedSrc } from '../lib/embed';
import SlideView from './SlideView';

// 임베드 슬라이드 편집 폼 — URL을 붙여넣으면 화이트리스트 검사 + 정규화 후 미리보기 표시
export default function EmbedSlideForm({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  const [raw, setRaw] = useState(slide.embedUrl ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // 다른 슬라이드로 이동하면 입력값 동기화
  useEffect(() => {
    setRaw(slide.embedUrl ?? '');
    setMsg(null);
  }, [slide.id]);

  function apply(value: string) {
    setRaw(value);
    if (!value.trim()) {
      onChange({ embedUrl: '' });
      setMsg(null);
      return;
    }
    const r = normalizeEmbedUrl(value);
    if (r.ok) {
      onChange({ embedUrl: r.src });
      setMsg({ kind: 'ok', text: `✓ ${r.provider} 임베드로 인식했습니다.${r.note ? ' ' + r.note : ''}` });
    } else {
      setMsg({ kind: 'err', text: r.message });
    }
  }

  const hasPreview = isSafeEmbedSrc(slide.embedUrl);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-bold text-brand mb-1">🔗 외부 슬라이드 임베드</h3>
        <p className="text-xs text-white/50">
          Google Slides 게시 링크(파일 &gt; 공유 &gt; 웹에 게시), Canva 공유 링크 등을 붙여넣으면 슬라이드로 표시됩니다.
          <br />지원: {EMBED_SUPPORTED_LABEL}
        </p>
        <input
          className="input mt-3"
          placeholder="예: https://docs.google.com/presentation/d/e/…/pub  또는  https://www.canva.com/design/…/view"
          value={raw}
          onChange={(e) => apply(e.target.value)}
        />
        {msg && (
          <p className={['mt-2 text-xs', msg.kind === 'ok' ? 'text-emerald-400' : 'text-down'].join(' ')}>{msg.text}</p>
        )}
      </div>

      {hasPreview && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-brand text-sm">미리보기</h3>
            <span className="text-[10px] text-white/40">페이지 넘김은 임베드 자체 컨트롤 사용</span>
          </div>
          <div className="border border-white/10 rounded-lg overflow-hidden h-[300px] bg-black/20">
            <SlideView slide={slide} />
          </div>
        </div>
      )}

      <label className="block text-sm text-white/60">제목 (목록 표시용)
        <input className="input mt-1" value={slide.title ?? ''} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
      </label>

      <label className="block text-sm text-white/60">강사 노트 (수업 중 본인에게만 표시)
        <textarea className="input mt-1 h-24" value={slide.notes ?? ''} maxLength={400} onChange={(e) => onChange({ notes: e.target.value })} />
      </label>
    </div>
  );
}
