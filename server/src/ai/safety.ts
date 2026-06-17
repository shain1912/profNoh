// 미성년자 대상 콘텐츠 안전 필터 (서버측 1차 방어선)
// 완벽하진 않지만, 명백히 부적절한 입력을 차단하고 친절히 안내한다.

const BLOCKED_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /(성적|섹스|야한|음란|포르노|누드|성기|자위)/i, reason: '성적인 내용' },
  { re: /(자살|자해|죽고\s*싶|목\s*매)/i, reason: '자해/자살 관련 내용' },
  { re: /(폭탄|총기\s*제작|마약\s*제조|해킹\s*방법|폭발물)/i, reason: '위험하거나 불법적인 내용' },
  { re: /(욕설|개새끼|씨발|좆|병신|닥쳐)/i, reason: '욕설/비속어' },
  { re: /(딥페이크|deepfake).*(얼굴|친구|사람)/i, reason: '타인 합성(딥페이크) 관련 내용' },
  { re: /(주민등록번호|\d{6}\s*-\s*\d{7})/i, reason: '개인정보(주민번호)' },
];

export interface SafetyResult {
  ok: boolean;
  reason?: string;
  message?: string;
}

export function checkSafety(text: string): SafetyResult {
  const t = (text ?? '').trim();
  if (!t) return { ok: false, reason: 'empty', message: '내용을 입력해줘!' };
  if (t.length > 2000)
    return { ok: false, reason: 'too_long', message: '너무 길어! 조금 짧게 줄여줄래?' };

  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(t)) {
      return {
        ok: false,
        reason,
        message: `이 요청은 수업에서 다루기 어려운 내용(${reason})이라 도와줄 수 없어. 다른 주제로 해보자! 🙂`,
      };
    }
  }
  return { ok: true };
}

// 이미지 프롬프트엔 영어 안전 스타일을 덧붙여 안전도를 높인다. (영어가 모더레이션 오탐이 적음)
export function safeImagePrompt(prompt: string): string {
  return `${prompt}, wholesome, family-friendly, safe for work, suitable for a school classroom`;
}
