import type { UserRow } from '../auth/userStore';
import { PLANS, resolvePlan, type PlanId, type SubscriptionRow } from './plans';
import { getSubscription, countDecksByOwner } from './store';

/**
 * plan gating 헬퍼 — 라우트에서 이것만 호출하면 된다.
 * 강제 적용은 덱 생성 1곳(POST /api/decks)에만 걸려 있고,
 * 다른 제한이 필요해지면 이 파일에 헬퍼를 추가해 같은 방식으로 쓴다.
 */

export interface PlanState {
  plan: PlanId;
  subscription: SubscriptionRow | null;
}

export async function getUserPlan(user: UserRow): Promise<PlanState> {
  const sub = user.org_id ? null : await getSubscription(user.id);
  return { plan: resolvePlan(user, sub), subscription: sub };
}

export interface GateResult {
  ok: boolean;
  plan: PlanId;
  /** 실패 시 사용자 안내 메시지 (402와 함께 반환 권장) */
  message?: string;
  /** 현재 사용량/한도 (클라 안내용) */
  used?: number;
  limit?: number | null;
}

/** free 플랜 덱 개수 제한 검사. premium/org는 무제한. */
export async function canCreateDeck(user: UserRow): Promise<GateResult> {
  const { plan } = await getUserPlan(user);
  const limit = PLANS[plan].maxDecks;
  if (limit === null) return { ok: true, plan, limit: null };
  const used = await countDecksByOwner(user.id);
  if (used >= limit) {
    return {
      ok: false,
      plan,
      used,
      limit,
      message: `무료 플랜은 덱을 ${limit}개까지 만들 수 있어요. 프리미엄으로 업그레이드하면 무제한!`,
    };
  }
  return { ok: true, plan, used, limit };
}
