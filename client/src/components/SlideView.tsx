import type { Slide, SlideBlock } from '@shared/types';
import { useEffect, useRef, useState } from 'react';
import { isSafeEmbedSrc } from '../lib/embed';

// 외부 슬라이드 임베드 (Google Slides·Canva 등) — 내부 페이지 넘김은 임베드 자체 컨트롤 사용.
// iframe이 포커스를 가져가면 앱 단축키(←/→/Space/F)가 먹지 않으므로, 키보드 조작 후에는
// 앱 영역을 한 번 클릭하라는 안내를 툴바에 표시한다.
function EmbedSlideView({ src, title }: { src: string; title?: string }) {
  return (
    <div className="flex h-full w-full flex-col">
      <iframe
        src={src}
        title={title || '외부 슬라이드'}
        className="h-full w-full flex-1 border-0 bg-black/20"
        allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
      />
      <div className="shrink-0 bg-black/40 px-3 py-1 text-center text-[10px] text-white/40">
        임베드 슬라이드 — 페이지 넘김은 임베드 안의 컨트롤을 사용하세요 · 앱 단축키(←/→/F)는 임베드 바깥을 클릭한 뒤 동작합니다
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
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          throw new Error('PDF 라이브러리를 로드하지 못했습니다.');
        }
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
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
