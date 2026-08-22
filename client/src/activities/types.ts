import type { ComponentType } from 'react';
import type { Activity, ActivityType } from '@shared/types';
import type { ClassroomLive } from '../lib/useClassroom';

// ──────────────────────────────────────────────────────────────
//  활동 레지스트리 타입 — "활동 1종 = 정의 1곳" 패턴
//  새 활동은 defs/<type>.tsx 파일 하나로 정의하고 registry.ts 에 등록한다.
//  (자세한 절차: docs/adding-activities.md)
// ──────────────────────────────────────────────────────────────

/** 학생 화면 렌더러에 전달되는 라이브 컨텍스트 */
export interface StudentCtx {
  token: string;
  sessionId: string;
  live: ClassroomLive;
}

export interface ActivityDef<A extends Activity = Activity> {
  type: ActivityType;
  /** 짧은 한국어 이름 (편집기 버튼/목록용) */
  label: string;
  /** 이모지 아이콘 */
  icon: string;
  /** AI 조교 퀵 생성 버튼에 노출할지 (PDF 기반 자동 생성 지원 여부) */
  aiQuick: boolean;
  /** 수동 "＋활동" 추가 시 빈 활동 생성 */
  blank: (id: string) => A;
  /** AI 파이프라인 operations(add_<type>)의 원시 activity 페이로드 → 안전한 활동 객체 */
  fromAI: (raw: any, id: string) => A;
  /** DeckEditor 편집 폼 */
  Editor: ComponentType<{ act: A; onChange: (a: A) => void }>;
  /** 학생 화면 렌더러 — 기존 components/activities/* 를 재사용하는 래퍼 */
  Student: ComponentType<{ activity: A; ctx: StudentCtx }>;
}
