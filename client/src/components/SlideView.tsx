import type { Slide, SlideBlock } from '@shared/types';
import { useEffect, useRef, useState } from 'react';
import { isSafeEmbedSrc } from '../lib/embed';

// 외부 슬라이드 임베드 (Google Slides·github.io 등).
// 기본은 "표시 전용": iframe pointer-events를 끄면 클릭해도 포커스를 뺏기지 않아
// 앱 방향키(←/→/Space)가 항상 동작한다 → 강사가 blend 화살표 하나로 슬라이드+활동을 넘길 수 있다.
// 원본 내부를 직접 조작(스크롤·버튼·영상)해야 할 때만 "원본 조작" 토글을 켠다.
function EmbedSlideView({ src, title }: { src: string; title?: string }) {
  const [interactive, setInteractive] = useState(false);
  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex-1">
        {/* key={src} — 슬라이드가 바뀌어 src의 #페이지만 달라지면 브라우저는 iframe을 리로드하지 않아
            원본이 첫 페이지에 머문다. key를 바꿔 iframe을 새로 마운트 → 원본이 초기 로드 때 #N을 읽어 해당 페이지로 시작한다. */}
        <iframe
          key={src}
          tabIndex={-1}
          src={src}
          title={title || '외부 슬라이드'}
          className="h-full w-full border-0 bg-black/20"
          allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
        />
        {/* 표시 전용 모드: 투명 오버레이가 클릭·포커스를 삼켜 iframe이 방향키를 못 가져간다 → 앱 ←/→ 항상 동작 */}
        {!interactive && (
          <div
            className="absolute inset-0 cursor-default"
            onMouseDown={(e) => { e.preventDefault(); (e.currentTarget.closest('[tabindex]') as HTMLElement | null)?.focus?.(); window.focus(); }}
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          onClick={() => setInteractive((v) => !v)}
          className={`absolute right-2 top-2 z-10 rounded-full px-3 py-1 text-[11px] font-semibold shadow-md transition ${
            interactive ? 'bg-brand text-white' : 'bg-black/55 text-white/80 hover:bg-black/70'
          }`}
          title="켜면 임베드 안의 버튼·스크롤을 직접 조작할 수 있어요 (이때는 앱 방향키가 임베드에 잡힙니다)"
        >
          {interactive ? '✅ 원본 조작 중 — 끄면 방향키 복귀' : '🖱 원본 직접 조작'}
        </button>
      </div>
      <div className="shrink-0 bg-black/40 px-3 py-1 text-center text-[10px] text-white/40">
        {interactive
          ? '원본 조작 모드 — 임베드 안을 직접 클릭·스크롤할 수 있어요. 다시 앱 방향키로 넘기려면 오른쪽 위 버튼을 끄세요.'
          : '이 슬라이드는 앱 방향키(←/→/Space)로 넘기세요 · 원본 안의 버튼·영상을 직접 만지려면 오른쪽 위 「원본 직접 조작」'}
      </div>
    </div>
  );
}

// 업로드 이미지 슬라이드 — 원본 화질 그대로 표시 (PDF 렌더보다 선명)
function ImageSlideView({ src, title }: { src: string; title?: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-red-400 bg-black/20 p-4 text-center">
        ⚠️ 이미지를 불러올 수 없습니다.
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black/10">
      <img
        src={src}
        alt={title || '슬라이드 이미지'}
        className="max-h-full max-w-full object-contain shadow-md rounded"
        draggable={false}
        onError={() => setError(true)}
      />
    </div>
  );
}

function PdfSlideView({ pdfUrl, pageNumber }: { pdfUrl: string; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let renderTask: any = null;

    const renderPage = async () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      setError('');
      try {
        // pdf.js 는 자체 번들(지연 로드) — 레거시 PDF 덱에서만 필요하므로 이 시점에 처음 내려받는다
        const { loadPdf } = await import('../lib/pdfjs');
        const pdf = await loadPdf(pdfUrl);
        if (!active) return;
        const page = await pdf.getPage(pageNumber);
        if (!active) return;

        const unscaled = page.getViewport({ scale: 1.0 });
        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 550;

        // 화면에 맞는 CSS 크기
        const fitScale = Math.min(containerWidth / unscaled.width, containerHeight / unscaled.height);
        // 실제 렌더는 devicePixelRatio를 곱해 고해상도로 — 프로젝터/레티나에서 흐릿함 방지 (상한 4배)
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const renderScale = Math.min(fitScale * dpr, 4);

        const viewport = page.getViewport({ scale: renderScale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(unscaled.width * fitScale)}px`;
        canvas.style.height = `${Math.floor(unscaled.height * fitScale)}px`;

        const context = canvas.getContext('2d');
        if (!context) return;

        if (renderTask) renderTask.cancel();
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (active) setLoading(false);
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') return;
        console.error('PDF render error:', err);
        if (active) {
          setError(err.message || 'PDF 페이지를 가져올 수 없습니다.');
          setLoading(false);
        }
      }
    };

    // 컨테이너 크기가 바뀌면(발표 모드/전체화면 전환 등) 그 크기에 맞춰 다시 렌더
    let debounce: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(renderPage, 150);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    setLoading(true);
    const timer = setTimeout(renderPage, 100);

    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(debounce);
      ro.disconnect();
      if (renderTask) renderTask.cancel();
    };
  }, [pdfUrl, pageNumber]);

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center bg-surface-2 overflow-hidden min-h-[300px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted bg-surface-2/90">
          페이지 로딩 중… ⏳
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-down bg-surface-2/90 p-4 text-center">
          ⚠️ {error}
        </div>
      )}
      <canvas ref={canvasRef} className="max-h-full max-w-full object-contain shadow-md rounded" />
    </div>
  );
}

function Block({ b }: { b: SlideBlock }) {
  switch (b.kind) {
    case 'h':
      return <h3 className="mt-5 text-xl font-bold text-brand sm:text-2xl">{b.text}</h3>;
    case 'bullet':
      return (
        <div className="flex gap-2 text-lg leading-relaxed text-body/90 sm:text-xl">
          <span className="mt-1 shrink-0 text-brand">•</span>
          <span>{b.text}</span>
        </div>
      );
    case 'quote':
      return (
        <blockquote className="my-2 rounded-r-lg border-l-4 border-brand/70 bg-surface-2 px-4 py-3 text-lg italic text-body/80">
          {b.text}
        </blockquote>
      );
    case 'callout':
      return (
        <div className="my-2 rounded-xl bg-brand/15 px-4 py-3 text-lg font-semibold text-body ring-1 ring-brand/40">
          💡 {b.text}
        </div>
      );
    case 'note':
      return <p className="text-sm text-muted">{b.text}</p>;
    default:
      return <p className="text-lg leading-relaxed text-body/90 sm:text-xl">{b.text}</p>;
  }
}

function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }
  return null;
}

export default function SlideView({ slide, big = false }: { slide: Slide; big?: boolean }) {
  if (slide.layout === 'embed' && isSafeEmbedSrc(slide.embedUrl)) {
    return <EmbedSlideView src={slide.embedUrl} title={slide.title} />;
  }

  if (slide.layout === 'image' && slide.imageUrl) {
    return <ImageSlideView src={slide.imageUrl} title={slide.title} />;
  }

  if (slide.layout === 'pdf' && slide.pdfUrl) {
    return (
      <div className="h-full w-full overflow-hidden flex flex-col justify-center items-center">
        <PdfSlideView pdfUrl={slide.pdfUrl} pageNumber={slide.pageNumber ?? 1} />
      </div>
    );
  }

  const isSection = slide.layout === 'section';
  const isTitle = slide.layout === 'title';
  const hasBlocks = !!slide.blocks?.length;
  const embedUrl = getYouTubeEmbedUrl(slide.youtubeUrl);

  return (
    // 모든 슬라이드를 수직·수평 중앙 정렬 → 슬라이드 전환 시 위치가 튀지 않음
    <div className={['flex h-full w-full flex-col items-center justify-center overflow-y-auto', big ? 'p-12' : 'p-6'].join(' ')}>
      <div className="w-full max-w-3xl text-center">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand/80 sm:text-sm">
          PART {slide.part} · {slide.partTitle}
        </div>

        {slide.title && (
          <h1
            className={[
              'font-extrabold leading-tight',
              isTitle ? 'text-4xl sm:text-6xl text-strong' : '',
              isSection ? 'text-5xl text-brand sm:text-7xl' : '',
              !isTitle && !isSection ? 'text-3xl sm:text-4xl text-strong' : '',
            ].join(' ')}
          >
            {slide.title}
          </h1>
        )}

        {slide.subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-2 sm:text-2xl">{slide.subtitle}</p>
        )}

        {embedUrl && (
          <div className="mx-auto mt-6 w-full max-w-2xl aspect-video rounded-2xl overflow-hidden shadow-lg border border-hairline bg-ink/80">
            <iframe
              src={embedUrl}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        )}

        {hasBlocks && (
          <div className="mx-auto mt-8 max-w-2xl space-y-3 text-left">
            {slide.blocks!.map((b, i) => (
              <Block key={i} b={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
