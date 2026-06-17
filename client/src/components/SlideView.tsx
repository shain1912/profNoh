import type { Slide, SlideBlock } from '@shared/types';

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

export default function SlideView({ slide, big = false }: { slide: Slide; big?: boolean }) {
  const isSection = slide.layout === 'section';
  const isTitle = slide.layout === 'title';
  const hasBlocks = !!slide.blocks?.length;

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
