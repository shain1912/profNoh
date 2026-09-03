import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// 프로젝터 상시 입장 바 / 대기 화면 (강당 모드, R2 A1-1 · A4-7)
// - bar : 화면 하단 고정. 높이 14vh(≥12%), QR 한 변 12vh(≥10%), 코드 글자 6vh(≥6%)
// - hero: 활동 없는 대기 화면. QR 한 변 40vh(≥40%) + 코드 + URL + 접속 카운터 + 1줄 안내
// 크기는 화면 비율(vh) 고정이라 프로젝터 해상도·루트 폰트 배율과 무관하게 최소 크기가 보장된다.

export function joinUrlFor(token: string): string {
  return `${location.origin}/join?token=${token}`;
}

/** 스크린에 읽기 쉽게 보여줄 짧은 URL (프로토콜 생략) */
export function shortJoinUrl(): string {
  return `${location.host}/join`;
}

/** 입장 QR 데이터 URL — 큰 화면에서도 선명하도록 1024px 로 생성 */
export function useJoinQr(token: string): string {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    if (!token) return;
    let alive = true;
    QRCode.toDataURL(joinUrlFor(token), {
      width: 1024,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((u) => { if (alive) setDataUrl(u); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);
  return dataUrl;
}

function Qr({ src, sizeVh, testId }: { src: string; sizeVh: number; testId: string }) {
  const size = `${sizeVh}vh`;
  return (
    <div
      className="shrink-0 rounded-2xl bg-white p-[1vh] shadow-pop"
      style={{ width: size, height: size }}
      data-testid={testId}
    >
      {src ? (
        <img src={src} alt="입장 QR 코드" className="h-full w-full" draggable={false} />
      ) : (
        <div className="grid h-full w-full place-items-center text-black/40">QR…</div>
      )}
    </div>
  );
}

export function EntryBar({ token, count }: { token: string; count: number }) {
  const qr = useJoinQr(token);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-[3vw] border-t border-hairline bg-surface/95 px-[3vw] backdrop-blur"
      style={{ height: '14vh' }}
      data-testid="entry-bar"
    >
      <Qr src={qr} sizeVh={12} testId="entry-bar-qr" />
      <div className="flex min-w-0 flex-1 items-center gap-[3vw]">
        <div className="shrink-0">
          <div className="text-muted" style={{ fontSize: '2vh', lineHeight: 1.2 }}>입장 코드</div>
          <div
            className="font-extrabold tracking-[0.18em] text-strong tabular-nums"
            style={{ fontSize: '6vh', lineHeight: 1.1 }}
            data-testid="entry-bar-code"
          >
            {token}
          </div>
        </div>
        <div className="min-w-0 truncate font-semibold text-body" style={{ fontSize: '3vh' }}>
          {shortJoinUrl()}
        </div>
      </div>
      <div
        className="shrink-0 rounded-full bg-brand/15 px-[2vw] font-bold text-brand ring-1 ring-brand/40 tabular-nums"
        style={{ fontSize: '3.5vh', lineHeight: 2 }}
        data-testid="entry-bar-count"
      >
        접속 {count}명
      </div>
    </div>
  );
}

export function EntryHero({
  token,
  count,
  title,
  hint,
}: {
  token: string;
  count: number;
  title?: string;
  hint?: string;
}) {
  const qr = useJoinQr(token);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vh] px-[4vw] text-center" data-testid="entry-hero">
      {title && (
        <div className="max-w-[80vw] truncate font-bold text-muted" style={{ fontSize: '3.5vh' }}>
          {title}
        </div>
      )}
      <div className="flex items-center gap-[5vw]">
        <Qr src={qr} sizeVh={40} testId="entry-hero-qr" />
        <div className="text-left">
          <div className="text-muted" style={{ fontSize: '2.8vh' }}>입장 코드</div>
          <div
            className="font-extrabold tracking-[0.18em] text-strong tabular-nums"
            style={{ fontSize: '11vh', lineHeight: 1.05 }}
            data-testid="entry-hero-code"
          >
            {token}
          </div>
          <div className="mt-[1.5vh] font-semibold text-body" style={{ fontSize: '4vh' }}>
            {shortJoinUrl()}
          </div>
          <div
            className="mt-[2.5vh] inline-block rounded-full bg-brand/15 px-[2vw] font-bold text-brand ring-1 ring-brand/40 tabular-nums"
            style={{ fontSize: '4vh', lineHeight: 1.8 }}
            data-testid="entry-hero-count"
          >
            접속 {count}명
          </div>
        </div>
      </div>
      <div className="text-muted" style={{ fontSize: '2.6vh' }}>
        {hint ?? '카메라로 QR을 찍거나 주소에 코드를 입력하세요 · 닉네임은 자동 생성 · 개인정보를 수집하지 않습니다'}
      </div>
    </div>
  );
}
