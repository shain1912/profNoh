import type { ActivityType } from '@shared/types';
import type { ActivityDef } from './types';
import chat from './defs/chat';
import image from './defs/image';
import lab from './defs/lab';
import quiz from './defs/quiz';
import poll from './defs/poll';
import roleplay from './defs/roleplay';
import analogy from './defs/analogy';
import writing from './defs/writing';
import tutor from './defs/tutor';

// ──────────────────────────────────────────────────────────────
//  활동 레지스트리 — 새 활동은 defs/<type>.tsx 를 만들고 여기 한 줄 등록.
//  편집 폼 / 수동 추가 / AI 결과 적용 / 학생 렌더링이 전부 이 표를 참조한다.
//  (서버 AI 생성 스키마는 server/src/ai/activitySpecs.ts — docs/adding-activities.md 참고)
// ──────────────────────────────────────────────────────────────

export const ACTIVITY_DEFS: Record<ActivityType, ActivityDef<any>> = {
  chat, image, lab, quiz, poll, roleplay, analogy, writing, tutor,
};

/** 등록된 모든 활동 타입 (편집기 "＋활동" 버튼 순서) */
export const ACTIVITY_TYPES = Object.keys(ACTIVITY_DEFS) as ActivityType[];

/** AI 퀵 생성을 지원하는 타입 */
export const AI_QUICK_TYPES = ACTIVITY_TYPES.filter((t) => ACTIVITY_DEFS[t].aiQuick);

export function activityDef(type: string): ActivityDef<any> | null {
  return (ACTIVITY_DEFS as Record<string, ActivityDef<any>>)[type] ?? null;
}
