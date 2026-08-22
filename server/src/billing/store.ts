import { dbSafe } from '../db';
import type { SubscriptionRow } from './plans';

export interface PaymentRow {
  id: string;
  user_id: string;
  order_id: string;
  payment_key: string | null;
  plan: string;
  amount: number;
  currency: string;
  status: 'ready' | 'confirmed' | 'failed' | 'canceled';
  provider: string;
  method: string | null;
  receipt_url: string | null;
  raw: unknown;
  created_at: string;
  approved_at: string | null;
}

export async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_subscriptions').select('*').eq('user_id', userId).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as SubscriptionRow) ?? null;
  });
}

/** 결제 승인 성공 → premium 구독 활성화(업서트). periodEnd는 승인 시점 + 30일. */
export async function activatePremium(userId: string, provider: string, periodEnd: Date): Promise<SubscriptionRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb
      .from('axedu_subscriptions')
      .upsert(
        {
          user_id: userId,
          plan: 'premium',
          status: 'active',
          current_period_end: periodEnd.toISOString(),
          provider,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    if (r.error) throw r.error;
    return r.data as SubscriptionRow;
  });
}

/** 체크아웃 시 주문 선기록 (status=ready). 이 행의 amount가 승인 시 금액 검증 기준이 된다. */
export async function createPendingPayment(p: {
  userId: string;
  orderId: string;
  plan: string;
  amount: number;
  provider: string;
}): Promise<PaymentRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb
      .from('axedu_payments')
      .insert({ user_id: p.userId, order_id: p.orderId, plan: p.plan, amount: p.amount, provider: p.provider })
      .select('*')
      .single();
    if (r.error) throw r.error;
    return r.data as PaymentRow;
  });
}

export async function getPaymentByOrderId(orderId: string): Promise<PaymentRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_payments').select('*').eq('order_id', orderId).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as PaymentRow) ?? null;
  });
}

export async function markPaymentConfirmed(
  orderId: string,
  p: { paymentKey: string; method?: string; receiptUrl?: string; raw?: unknown },
): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const res = await sb
      .from('axedu_payments')
      .update({
        status: 'confirmed',
        payment_key: p.paymentKey,
        method: p.method ?? null,
        receipt_url: p.receiptUrl ?? null,
        raw: p.raw ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function markPaymentFailed(orderId: string, raw?: unknown): Promise<void> {
  await dbSafe(async (sb) => {
    const res = await sb.from('axedu_payments').update({ status: 'failed', raw: raw ?? null }).eq('order_id', orderId);
    if (res.error) throw res.error;
    return true;
  });
}

export async function listPayments(userId: string, limit = 20): Promise<PaymentRow[]> {
  const r = await dbSafe(async (sb) => {
    const res = await sb
      .from('axedu_payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (res.error) throw res.error;
    return res.data as PaymentRow[];
  });
  return r ?? [];
}

/** 소유 덱 개수 (plan gating용) — decks 모듈 파일을 건드리지 않도록 여기서 직접 센다. */
export async function countDecksByOwner(userId: string): Promise<number> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').select('id', { count: 'exact', head: true }).eq('owner_id', userId);
    if (res.error) throw res.error;
    return res.count ?? 0;
  });
  return r ?? 0;
}
