import type { Slide, SlideBlock } from '@shared/types';
import { useEffect, useRef, useState } from 'react';

function PdfSlideView({ pdfUrl, pageNumber }: { pdfUrl: string; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderPage = async () => {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          throw new Error('PDF 라이브러리를 로드하지 못했습니다.');
        }

        // Set worker source
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (!active) return;

        const page = await pdf.getPage(pageNumber);
        if (!active) return;

        const container = containerRef.current;
        if (!container) return;

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 550;

        const scaleWidth = containerWidth / unscaledViewport.width;
        const scaleHeight = containerHeight / unscaledViewport.height;
        const scale = Math.min(scaleWidth, scaleHeight, 2.0); // Max scale 2.0 for quality

        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        if (active) setLoading(false);
      } catch (err: any) {
        console.error('PDF render error:', err);
        if (active) {
          setError(err.message || 'PDF 페이지를 가져올 수 없습니다.');
          setLoading(false);
        }
      }
    };

    // Delay a bit to let clientWidth/clientHeight settle
    const timer = setTimeout(() => {
      renderPage();
    }, 100);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pdfUrl, pageNumber]);

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center bg-black/10 overflow-hidden min-h-[300px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 bg-black/20">
          페이지 로딩 중… ⏳
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 bg-black/20 p-4 text-center">
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
        <blockquote className="my-2 border-l-4 border-brand/70 bg-white/5 px-4 py-3 text-lg italic text-body/80">
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
              isTitle ? 'text-4xl sm:text-6xl' : '',
              isSection ? 'text-5xl text-brand sm:text-7xl' : '',
              !isTitle && !isSection ? 'text-3xl sm:text-4xl' : '',
            ].join(' ')}
          >
            {slide.title}
          </h1>
        )}

        {slide.subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-2 sm:text-2xl">{slide.subtitle}</p>
        )}

        {embedUrl && (
          <div className="mx-auto mt-6 w-full max-w-2xl aspect-video rounded-2xl overflow-hidden shadow-lg border border-white/10 bg-black/40">
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
