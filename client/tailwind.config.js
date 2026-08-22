/** @type {import('tailwindcss').Config} */
// 디자인 시스템 v2 — 교육 SaaS 라이트 테마 기본 + Projector용 다크 스코프(.theme-dark)
// 실제 색 값은 client/src/index.css 의 CSS 변수(:root / .theme-dark)에서 정의한다.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: v('--c-brand'), // primary (Indigo)
        'brand-press': v('--c-brand-press'),
        'on-brand': v('--c-on-brand'),
        canvas: v('--c-canvas'), // 페이지 배경
        surface: v('--c-surface'), // 카드
        'surface-2': v('--c-surface-2'), // 카드 내부 패널
        'surface-3': v('--c-surface-3'), // hover 상태
        ink: v('--c-ink'), // 오버레이·강한 잉크
        body: v('--c-body'), // 본문
        strong: v('--c-strong'), // 제목
        muted: v('--c-muted'),
        'muted-2': v('--c-muted-2'),
        hairline: v('--c-hairline'),
        up: v('--c-up'), // 성공/정답
        down: v('--c-down'), // 오류/경고(강)
        warn: v('--c-warn'), // 주의(중)
        info: v('--c-info'),
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          '"Segoe UI"',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Malgun Gothic"',
          'sans-serif',
        ],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.06)',
        pop: '0 8px 30px -6px rgb(15 23 42 / 0.18)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'spin-reverse': {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'spin-reverse': 'spin-reverse 1s linear infinite',
      },
    },
  },
  plugins: [],
};
