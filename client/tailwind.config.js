/** @type {import('tailwindcss').Config} */
// DESIGN.md (Binance) 디자인 시스템 토큰
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#fcd535', // primary (Binance Yellow)
        'brand-press': '#f0b90b', // primary-active
        'brand-dim': '#3a3a1f', // primary-disabled
        'on-brand': '#181a20', // on-primary (black on yellow)
        canvas: '#0b0e11', // canvas-dark
        surface: '#1e2329', // surface-card-dark
        'surface-2': '#2b3139', // surface-elevated-dark
        ink: '#181a20',
        body: '#eaecef', // body on dark
        muted: '#707a8a',
        'muted-2': '#929aa5',
        hairline: '#2b3139',
        up: '#0ecb81', // trading-up
        down: '#f6465d', // trading-down
        info: '#3b82f6',
      },
      fontFamily: {
        sans: ['Pretendard', 'BinanceNova', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'BinancePlex', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
