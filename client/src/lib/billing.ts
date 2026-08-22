/** 결제/플랜 API 클라이언트 (TASK C) */

export type PlanId = 'free' | 'premium' | 'org';

export interface PlanInfo {
  id: PlanId;
  name: string;
  priceKrw: number | null;
  maxDecks: number | null;
  features: string[];
}

export interface BillingMe {
  plan: PlanId;
  subscription: { status: string; currentPeriodEnd: string | null; provider: string | null } | null;
  payments: {
    orderId: string;
    plan: string;
    amount: number;
    status: string;
    method: string | null;
    receiptUrl: string | null;
    createdAt: string;
    approvedAt: string | null;
  }[];
}

export interface CheckoutInfo {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  provider: 'toss' | 'mock';
  clientKey: string | null;
}

async function json<T>(r: Response): Promise<T> {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any)?.message ?? `요청 실패 (${r.status})`);
  return data as T;
}

export async function fetchPlans(): Promise<PlanInfo[]> {
  const r = await fetch('/api/billing/plans');
  return (await json<{ plans: PlanInfo[] }>(r)).plans;
}

export async function fetchBillingMe(): Promise<BillingMe> {
  return json(await fetch('/api/billing/me', { credentials: 'include' }));
}

export async function startCheckout(plan: 'premium'): Promise<CheckoutInfo> {
  const r = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ plan }),
  });
  return json(r);
}

export async function confirmPayment(p: { paymentKey: string; orderId: string; amount: number }) {
  const r = await fetch('/api/billing/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(p),
  });
  return json<{ ok: true; plan: 'premium'; currentPeriodEnd: string | null }>(r);
}

export function formatKrw(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
