import type { UserRow } from '../auth/userStore';

/**
 * 플랜 모델 (TASK C)
 * - free    : 기본. 덱 3개 제한.
 * - premium : 개인 유료 구독 (토스페이먼츠 월 결제).
 * - org     : 기관 소속. 판정은 users.org_id 존재 여부만 사용 —
 *             기관 좌석/정책 세부는 org 모듈(TASK B) 소관이므로 여기서 판단하지 않는다.
 */
export type PlanId = 'free' | 'premium' | 'org';

export interface PlanInfo {
  id: PlanId;
  name: string;
  priceKrw: number | null; // null = 별도 문의(org)
  maxDecks: number | null; // null = 무제한
  features: string[];
}

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: 'free',
    name: '무료',
    priceKrw: 0,
    maxDecks: 3,
    features: ['덱 3개까지 저장', 'AI 덱 생성', '실시간 수업 진행'],
  },
  premium: {
    id: 'premium',
    name: '프리미엄',
    priceKrw: 9900, // 월 9,900원 (VAT 포함)
    maxDecks: null,
    features: ['덱 무제한', 'AI 덱 생성', '실시간 수업 진행', '우선 지원'],
  },
  org: {
    id: 'org',
    name: '기관',
    priceKrw: null,
    maxDecks: null,
    features: ['덱 무제한', '기관 관리 콘솔', '멤버/좌석 관리', '전담 지원'],
  },
};

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: 'free' | 'premium';
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  current_period_end: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

/** 구독 행이 "지금 유효한 premium"인지 (canceled여도 기간 만료 전이면 유지) */
export function isPremiumActive(sub: SubscriptionRow | null): boolean {
  if (!sub || sub.plan !== 'premium') return false;
  if (sub.status !== 'active' && sub.status !== 'canceled') return false;
  if (!sub.current_period_end) return false;
  return new Date(sub.current_period_end).getTime() > Date.now();
}

/** 사용자 + 구독 → 유효 플랜. org_id가 있으면 무조건 org (TASK B 인터페이스). */
export function resolvePlan(user: Pick<UserRow, 'org_id'>, sub: SubscriptionRow | null): PlanId {
  if (user.org_id) return 'org';
  return isPremiumActive(sub) ? 'premium' : 'free';
}
