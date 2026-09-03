import type { SurveyQuestion } from './types';

// 표준 만족도 설문 6문항 (R2 축7 S1~S6: 만족·관련성·강사·몰입·NPS·주관식)
// Kirkpatrick L1 — 평점 4 + NPS 1 + 주관식 1, 90초 안에 응답 가능한 길이
export const SURVEY_PRESET: SurveyQuestion[] = [
  { id: 's1', kind: 'likert', text: '오늘 강연에 전반적으로 만족한다', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' },
  { id: 's2', kind: 'likert', text: '강연 내용이 내 업무·일상과 관련이 있다', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' },
  { id: 's3', kind: 'likert', text: '강연자의 설명은 이해하기 쉬웠다', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' },
  { id: 's4', kind: 'likert', text: '강연에 집중해서 참여했다', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' },
  { id: 's5', kind: 'nps', text: '이 강연을 동료에게 추천하시겠습니까?', lowLabel: '전혀 아니다', highLabel: '적극 추천' },
  { id: 's6', kind: 'text', text: '가장 도움이 된 점이나 개선할 점을 자유롭게 적어주세요' },
];

export const SURVEY_MAX_QUESTIONS = 12;
export const SURVEY_TEXT_MAX = 500;
