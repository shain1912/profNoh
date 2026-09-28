import { chatComplete } from './minimax';
import type { ClassroomMode } from '../../../shared/types';

// ──────────────────────────────────────────────────────────────
//  SVG 그림 — 텍스트 AI 가 벡터 그림을 "코드로" 그린다 (사진 생성 API 없이 장당 수 원 이하).
//  엠블럼·배지·아이콘·단순 일러스트에 맞다. 결과는 정적 SVG 로 정리해 uploads 에 저장한다.
// ──────────────────────────────────────────────────────────────

function systemPrompt(mode: ClassroomMode) {
  const who = mode === 'auditorium' ? '강당 특강에 참여한 고등학생' : '고등학생';
  return `너는 ${who}의 설명을 받아 SVG 코드로 그림을 그리는 일러스트레이터야.
규칙:
- 출력은 <svg ...>...</svg> 하나만. 설명·코드블록 표시 금지.
- viewBox="0 0 512 512", xmlns="http://www.w3.org/2000/svg". 배경을 꽉 채운다.
- 도형(path·circle·rect·polygon·ellipse·line)·linearGradient/radialGradient 로 산뜻한 플랫 일러스트 또는 엠블럼 스타일. 색은 조화롭게, 형태는 알아보기 쉽게.
- 글자가 필요하면 <text> 로 짧게(한글 가능, font-family="sans-serif").
- <script>, 이벤트 속성, 외부 이미지·폰트, <foreignObject>, 애니메이션 금지.
- 학교에서 보기에 부적절한 내용은 그리지 않는다. 실존 인물·브랜드 로고는 그리지 않는다.
- 전체 코드는 짧고 가볍게(대략 120줄 이내).`;
}

/** 모델 출력 → 안전한 정적 SVG (스크립트·이벤트·외부 참조 제거). 없으면 null */
export function sanitizeSvg(raw: string): string | null {
  const m = /<svg[\s\S]*<\/svg>/i.exec(raw);
  if (!m) return null;
  let s = m[0];
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<script[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/<(animate|set|animateTransform|animateMotion)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // 외부·javascript 참조 제거 (내부 #id 참조와 data: 는 허용)
  s = s.replace(/\s(xlink:)?href\s*=\s*("|')(?!#|data:image\/)[^"']*\2/gi, '');
  s = s.replace(/\s(xlink:)?href\s*=\s*(?!["'])(?!#)[^\s>]+/gi, ''); // 따옴표 없는 속성값
  s = s.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s.length > 200_000 ? null : s;
}

export async function generateSvg(prompt: string, mode: ClassroomMode): Promise<{ svg: string; cost: number } | null> {
  const r = await chatComplete(
    [
      { role: 'system', content: systemPrompt(mode) },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.8, maxTokens: 6000, timeoutMs: 90_000 },
  );
  const svg = sanitizeSvg(r.text);
  return svg ? { svg, cost: r.cost } : null;
}
