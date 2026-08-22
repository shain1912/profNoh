// 임베드 슬라이드 URL 정규화 + 허용 도메인 화이트리스트
// Google Slides 게시 링크·Canva·기타 임베드 가능 서비스 URL을 iframe src로 변환한다.
// X-Frame-Options로 임베드가 차단되는 일반 사이트는 여기서 걸러 안내 메시지를 돌려준다.

export interface EmbedOk {
  ok: true;
  src: string;        // iframe에 넣을 정규화된 URL
  provider: string;   // 표시용 서비스 이름
  note?: string;      // 사용자에게 보여줄 추가 안내
}
export interface EmbedErr {
  ok: false;
  message: string;
}
export type EmbedResult = EmbedOk | EmbedErr;

// 임베드를 허용하는 것으로 확인된 도메인 화이트리스트 (suffix 매칭)
const ALLOWED_HOSTS: Array<{ suffix: string; provider: string }> = [
  { suffix: 'docs.google.com', provider: 'Google Slides' },
  { suffix: 'canva.com', provider: 'Canva' },
  { suffix: 'youtube.com', provider: 'YouTube' },
  { suffix: 'youtube-nocookie.com', provider: 'YouTube' },
  { suffix: 'youtu.be', provider: 'YouTube' },
  { suffix: 'figma.com', provider: 'Figma' },
  { suffix: 'slides.com', provider: 'Slides.com' },
  { suffix: 'gamma.app', provider: 'Gamma' },
  { suffix: 'prezi.com', provider: 'Prezi' },
  { suffix: 'miro.com', provider: 'Miro' },
  { suffix: 'pitch.com', provider: 'Pitch' },
  { suffix: 'tome.app', provider: 'Tome' },
  { suffix: 'onedrive.live.com', provider: 'OneDrive' },
  { suffix: '1drv.ms', provider: 'OneDrive' },
  { suffix: 'view.officeapps.live.com', provider: 'Office Online' },
];

// 임베드가 확실히 차단되는 대표 도메인 — 더 구체적인 안내를 위해 별도 처리
const KNOWN_BLOCKED = ['naver.com', 'instagram.com', 'facebook.com', 'notion.so', 'notion.site'];

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix);
}

export const EMBED_SUPPORTED_LABEL =
  'Google Slides(게시 링크) · Canva · YouTube · Figma · Slides.com · Gamma · Prezi · Miro · Pitch · Tome · OneDrive';

export function normalizeEmbedUrl(raw: string): EmbedResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, message: 'URL을 입력해주세요.' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: '올바른 URL 형식이 아닙니다. https:// 로 시작하는 전체 주소를 붙여넣어주세요.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: 'http(s) 주소만 사용할 수 있습니다.' };
  }
  const host = url.hostname.toLowerCase();

  if (KNOWN_BLOCKED.some((b) => hostMatches(host, b))) {
    return {
      ok: false,
      message: `${host} 는 외부 사이트 임베드를 차단(X-Frame-Options)하는 서비스라 슬라이드로 표시할 수 없습니다. 지원 서비스: ${EMBED_SUPPORTED_LABEL}`,
    };
  }

  const allowed = ALLOWED_HOSTS.find((a) => hostMatches(host, a.suffix));
  if (!allowed) {
    return {
      ok: false,
      message: `허용되지 않은 도메인입니다 (${host}). 대부분의 일반 사이트는 임베드를 차단(X-Frame-Options)합니다. 지원 서비스: ${EMBED_SUPPORTED_LABEL}`,
    };
  }

  // ── 서비스별 URL 정규화 ──
  // Google Slides
  if (host === 'docs.google.com' && url.pathname.startsWith('/presentation/')) {
    // 게시 링크: /presentation/d/e/<id>/pub → /embed (게시된 프레젠테이션 임베드 형식)
    if (/\/d\/e\/[^/]+\/pub/.test(url.pathname)) {
      const src = `https://docs.google.com${url.pathname.replace(/\/pub.*$/, '/embed')}?start=false&loop=false&delayms=3000`;
      return { ok: true, src, provider: 'Google Slides' };
    }
    // 편집/공유 링크: /presentation/d/<id>/... → /preview (링크 공유가 켜져 있어야 표시됨)
    const m = url.pathname.match(/^\/presentation\/d\/([^/]+)/);
    if (m) {
      return {
        ok: true,
        src: `https://docs.google.com/presentation/d/${m[1]}/preview`,
        provider: 'Google Slides',
        note: '편집 링크를 변환했습니다. 문서 공유 설정이 "링크가 있는 모든 사용자"이거나 [파일 > 공유 > 웹에 게시] 링크를 쓰면 확실하게 표시됩니다.',
      };
    }
  }

  // Canva: /design/<id>/<token>/view 형식에 ?embed 를 붙여야 임베드 허용
  if (hostMatches(host, 'canva.com') && url.pathname.includes('/design/')) {
    const base = `https://www.canva.com${url.pathname.replace(/\/(edit|view|watch).*$/, '/view')}`;
    return { ok: true, src: `${base}?embed`, provider: 'Canva' };
  }

  // YouTube → embed 형식
  if (hostMatches(host, 'youtube.com') || host === 'youtu.be') {
    const idMatch = trimmed.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (idMatch) {
      return { ok: true, src: `https://www.youtube.com/embed/${idMatch[1]}`, provider: 'YouTube' };
    }
  }

  // Figma: 파일/프로토타입 링크는 embed 엔드포인트로 감싸야 함
  if (hostMatches(host, 'figma.com') && host !== 'embed.figma.com') {
    return {
      ok: true,
      src: `https://www.figma.com/embed?embed_host=axedu&url=${encodeURIComponent(trimmed)}`,
      provider: 'Figma',
    };
  }

  // 나머지 화이트리스트 도메인은 그대로 사용
  return { ok: true, src: trimmed, provider: allowed.provider };
}

/** 저장된 embedUrl을 렌더 직전에 한 번 더 검사 (http(s)만 허용) */
export function isSafeEmbedSrc(src?: string): src is string {
  return !!src && /^https?:\/\//i.test(src);
}
