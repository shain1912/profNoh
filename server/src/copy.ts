// 참가자에게 전달되는 서버 문구 — 세션 유형(교실/강당)별 톤
//
// settings.mode 는 강당 입장 워커(C)가 정의한다. 여기서는 정의하지 않고 읽기만 한다:
// 값이 'auditorium' 이면 성인 존댓말, 없거나 다른 값이면 교실(고등학생) 톤을 유지한다.

export type SessionMode = 'classroom' | 'auditorium';

export function classroomMode(c: { settings: object }): SessionMode {
  const m = (c.settings as { mode?: unknown }).mode;
  return m === 'auditorium' ? 'auditorium' : 'classroom';
}

// [교실 톤, 강당 톤]
const MESSAGES = {
  joinBadCode: ['강의실 코드를 다시 확인해줘!', '입장 코드를 다시 확인해 주세요.'],
  aiPaused: ['AI 실습이 잠시 멈췄어요 ⏸️', 'AI 실습이 잠시 중단되었습니다 ⏸️'],
  aiResumed: ['AI 실습이 다시 열렸어요 ▶️', 'AI 실습이 다시 열렸습니다 ▶️'],
  quizEnd: ['퀴즈 끝! 최종 순위를 확인하세요 🏆', '퀴즈가 끝났습니다. 최종 순위를 확인해 주세요 🏆'],
  pollClosed: ['투표가 마감됐어요. 더 이상 응답할 수 없어요.', '투표가 마감되어 더 이상 응답하실 수 없습니다.'],
  usagePaused: ['강사님이 잠시 AI 실습을 멈췄어요. 곧 다시 열릴 거예요!', '진행자가 AI 실습을 잠시 중단했습니다. 곧 다시 열립니다.'],
  usageBudget: ['오늘 강의실 AI 사용량이 가득 찼어요. 강사님께 알려주세요!', '이 세션의 AI 사용량이 모두 소진되었습니다. 진행자에게 알려 주세요.'],
  notJoined: ['먼저 강의실에 입장해줘!', '먼저 세션에 입장해 주세요.'],
  aiFailed: ['AI 응답에 실패했어. 잠시 후 다시 시도해줘.', 'AI 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.'],
  imageFailed: ['이미지 생성에 실패했어. 잠시 후 다시 시도해줘.', '이미지 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.'],
  labFailed: ['실습 실행에 실패했어. 잠시 후 다시 시도해줘.', '실습 실행에 실패했습니다. 잠시 후 다시 시도해 주세요.'],
  labNotFound: ['실습을 찾을 수 없어.', '실습을 찾을 수 없습니다.'],
  imageBlocked: ['그 장면은 이미지로 만들 수 없었어. 다른 장면으로 표현해볼래? 🙂', '해당 장면은 이미지로 생성할 수 없었습니다. 다른 장면으로 표현해 보시겠어요? 🙂'],
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function msg(c: { settings: object }, key: MessageKey): string {
  return MESSAGES[key][classroomMode(c) === 'auditorium' ? 1 : 0];
}

export function usageLimitMsg(c: { settings: object }, kind: '대화' | '이미지', limit: number): string {
  return classroomMode(c) === 'auditorium'
    ? `이 실습에서 ${kind}는 ${limit}회까지 이용하실 수 있습니다.`
    : `이 실습에서 ${kind}는 ${limit}번까지 할 수 있어. 다음 실습에서 또 해보자!`;
}

/** AI 시스템 프롬프트의 청중 문구 (routes chat 기본 프롬프트 / ai/lab.ts) */
export function audiencePrompt(mode: SessionMode): string {
  return mode === 'auditorium'
    ? '너는 한국 성인 직장인 청중을 위한 친절하고 안전한 학습 도우미야. 존댓말로, 쉽고 간결하게 한국어로 답해.'
    : '너는 한국 고등학생을 위한 친절하고 안전한 학습 도우미야. 쉽고 짧게 한국어로 답해.';
}
