// 참가자·입장 화면 카피 — 세션 유형별 톤 사전
//
// [교실(고등학생, 기존 반말/친근체), 강당(성인 청중, 존댓말)] 순서.
// 참가자에게 보이는 문구는 하드코딩하지 말고 이 사전을 통해 가져온다 (verify-copy.mjs 가 검사).
import { useSessionMode, type SessionMode } from './sessionMode';

const COPY = {
  // ── 입장 (Join) ──
  joinTitle: ['강의실 입장 🎓', '세션 입장'],
  joinSubtitle: ['선생님이 알려준 코드를 입력해 주세요.', '화면에 표시된 입장 코드를 입력해 주세요.'],
  joinCodeLabel: ['강의실 코드', '입장 코드'],
  joinNickLabel: ['닉네임', '닉네임'],
  joinNickPlaceholder: ['내 이름/별명', '표시할 이름 (별명 가능)'],
  joinBadCode: ['강의실 코드를 확인해줘!', '입장 코드를 확인해 주세요.'],
  joinNeedNick: ['닉네임을 입력해줘!', '닉네임을 입력해 주세요.'],
  joinNoRoom: ['그런 강의실 코드가 없어. 다시 확인해줘!', '해당 입장 코드를 찾을 수 없습니다. 다시 확인해 주세요.'],
  joinNetErr: ['연결에 문제가 있어. 잠시 후 다시 시도해줘.', '연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.'],
  joinBusy: ['입장 중…', '입장 중…'],
  joinSubmit: ['입장하기', '입장하기'],
  // 개인정보 미수집 고지 (R2 A8-3) — 두 모드 공통, 항상 표시
  privacyLine: ['닉네임과 응답만 저장되며 개인정보는 수집하지 않습니다.', '닉네임과 응답만 저장되며 개인정보는 수집하지 않습니다.'],

  // ── 참가자 메인 (Student) ──
  connecting: ['강의실에 연결 중… ⏳', '세션에 연결 중… ⏳'],
  askButtonTitle: ['선생님께 질문하기', '진행자에게 질문하기'],
  askTitle: ['❓ 선생님께 질문하기', '❓ 진행자에게 질문하기'],
  askHint: ['닉네임 없이 익명으로 전달돼요. 궁금한 건 뭐든 물어보세요!', '닉네임 없이 익명으로 전달됩니다. 무엇이든 편하게 질문해 주세요.'],
  askSent: ['질문이 전달됐어요! 🙌', '질문이 전달되었습니다 🙌'],
  askPlaceholder: ['예) 아까 말씀하신 부분 다시 설명해주실 수 있나요?', '예) 방금 말씀하신 부분을 다시 설명해 주실 수 있을까요?'],
  askSend: ['질문 보내기', '질문 보내기'],

  // ── 투표 (Poll) ──
  pollDone: ['참여 완료! 친구들의 응답을 봐요 👀', '참여해 주셔서 감사합니다. 전체 응답을 확인해 보세요 👀'],
  pollDoneHidden: ['참여 완료! 결과는 마감 후 공개돼요 🔒', '참여해 주셔서 감사합니다. 결과는 마감 후 공개됩니다 🔒'],
  pollClosedNoVote: ['투표가 마감됐어요. 결과를 기다려요…', '투표가 마감되었습니다. 결과를 기다려 주세요.'],
  pollClosedWait: ['마감! 곧 결과가 공개돼요', '마감되었습니다. 곧 결과가 공개됩니다.'],
  pollWordPlaceholder: ['한 단어로 입력!', '한 단어로 입력해 주세요'],
  pollSubmit: ['제출', '제출'],
  pollAgain: ['다시 응답하기', '다시 응답하기'],
  pollRemaining: ['남은 시간', '남은 시간'],

  // ── 퀴즈 (Quiz) ──
  quizWaiting: ['곧 퀴즈가 시작돼요! 🎮', '곧 퀴즈가 시작됩니다 🎮'],
  quizTimeout: ['시간 초과!', '시간이 종료되었습니다'],
  quizCorrect: ['정답!', '정답입니다!'],
  quizWrong: ['아쉬워요!', '아쉽습니다!'],
  quizAnswered: ['응답 완료! 결과를 기다려요…', '응답이 완료되었습니다. 결과를 기다려 주세요…'],
  quizMyPick: ['고른 답', '선택한 답'],
  quizAnswerLabel: ['정답', '정답'],

  // ── 실습 공통 ──
  genericError: ['오류가 발생했어', '오류가 발생했습니다'],
  imagePlaceholder: ['그리고 싶은 장면을 글로 묘사해줘…', '그리고 싶은 장면을 글로 묘사해 주세요…'],
  imageThinking: ['🎨 그리는 중… 최대 20초 정도 걸려요. 잠깐만 기다려줘!', '🎨 생성 중… 최대 20초 정도 걸립니다. 잠시만 기다려 주세요.'],
  labThinking: ['🧪 실험 중… 두 결과를 비교하고 있어요. 잠깐만!', '🧪 실행 중… 두 결과를 비교하고 있습니다. 잠시만 기다려 주세요.'],
  labReflect: ['👀 두 결과의 차이가 보이나요? 무엇이 결과를 바꿨는지 생각해봐요.', '👀 두 결과의 차이가 보이시나요? 무엇이 결과를 바꿨는지 생각해 보세요.'],
  labResultHere: ['결과가 여기에 나와요', '결과가 여기에 표시됩니다'],
  labPickExample: ['위 예시 중 하나를 눌러보세요 ☝️', '위 예시 중 하나를 선택해 주세요 ☝️'],
  participantFallback: ['학생', '참가자'],
} as const;

export type CopyKey = keyof typeof COPY;
export type Copy = { [K in CopyKey]: string };

export function copyFor(mode: SessionMode): Copy {
  const i = mode === 'auditorium' ? 1 : 0;
  const out = {} as Record<CopyKey, string>;
  for (const k of Object.keys(COPY) as CopyKey[]) out[k] = COPY[k][i];
  return out;
}

/** 현재 세션 모드의 카피 (SessionModeContext 기준) */
export function useCopy(): Copy {
  return copyFor(useSessionMode());
}

/** 검사 스크립트용 — 사전 원본 노출 */
export const COPY_TABLE: Record<CopyKey, readonly [string, string]> = COPY;
