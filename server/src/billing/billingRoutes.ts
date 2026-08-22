import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { env } from '../env';
import { getSessionUser } from '../auth/session';
import { PLANS } from './plans';
import { getProvider } from './provider';
import { getUserPlan } from './gate';
import {
  createPendingPayment,
  getPaymentByOrderId,
  markPaymentConfirmed,
  markPaymentFailed,
  activatePremium,
  listPayments,
} from './store';

const PERIOD_DAYS = 30; // 월 구독: 승인 시점 + 30일

export async function registerBillingRoutes(app: FastifyInstance) {
  // 요금제 안내 (공개)
  app.get('/api/billing/plans', async () => ({ plans: Object.values(PLANS) }));

  // 결제위젯 초기화 정보 (mock 모드면 clientKey 없이 모의 플로우)
  app.get('/api/billing/config', async () => ({
    provider: getProvider().id,
    clientKey: env.TOSS_CLIENT_KEY || null,
  }));

  // 내 플랜/구독 상태 + 결제 내역
  app.get('/api/billing/me', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    const state = await getUserPlan(user);
    const payments = await listPayments(user.id);
    return {
      plan: state.plan,
      subscription: state.subscription && {
        status: state.subscription.status,
        currentPeriodEnd: state.subscription.current_period_end,
        provider: state.subscription.provider,
      },
      payments: payments.map((p) => ({
        orderId: p.order_id,
        plan: p.plan,
        amount: p.amount,
        status: p.status,
        method: p.method,
        receiptUrl: p.receipt_url,
        createdAt: p.created_at,
        approvedAt: p.approved_at,
      })),
    };
  });

  // 체크아웃 시작: 서버가 주문(orderId+금액)을 선기록 → 위젯은 이 값으로만 결제
  app.post('/api/billing/checkout', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    if (user.org_id) return reply.code(400).send({ error: 'bad', message: '기관 소속 계정은 개인 결제가 필요 없어요.' });

    const body = (req.body ?? {}) as { plan?: string };
    if (body.plan !== 'premium') return reply.code(400).send({ error: 'bad', message: '구매 가능한 플랜이 아닙니다.' });

    const { plan } = await getUserPlan(user);
    if (plan === 'premium') return reply.code(400).send({ error: 'bad', message: '이미 프리미엄 구독 중이에요.' });

    const amount = PLANS.premium.priceKrw!; // 금액은 항상 서버가 결정 — 클라 입력 무시
    const orderId = `axedu_${nanoid(16)}`;
    const row = await createPendingPayment({
      userId: user.id,
      orderId,
      plan: 'premium',
      amount,
      provider: getProvider().id,
    });
    if (!row) return reply.code(503).send({ error: 'bad', message: '주문 생성에 실패했어요. (DB 확인)' });

    return {
      orderId,
      amount,
      orderName: `AXEDU 프리미엄 (월)`,
      customerKey: user.id,
      provider: getProvider().id,
      clientKey: env.TOSS_CLIENT_KEY || null,
    };
  });

  // 결제 승인: 금액 위변조 검증(서버 선기록 주문 기준) 후 공급자 승인 → 구독 활성화
  app.post('/api/billing/confirm', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });

    const body = (req.body ?? {}) as { paymentKey?: string; orderId?: string; amount?: number };
    if (!body.paymentKey || !body.orderId || typeof body.amount !== 'number') {
      return reply.code(400).send({ error: 'bad', message: '결제 정보가 올바르지 않습니다.' });
    }

    const order = await getPaymentByOrderId(body.orderId);
    if (!order || order.user_id !== user.id) {
      return reply.code(404).send({ error: 'notfound', message: '주문을 찾을 수 없어요.' });
    }
    if (order.status === 'confirmed') return reply.code(400).send({ error: 'bad', message: '이미 승인된 주문입니다.' });
    if (order.status !== 'ready') return reply.code(400).send({ error: 'bad', message: '승인할 수 없는 주문 상태입니다.' });

    // ── 금액 위변조 검증: 위젯이 돌려준 amount가 서버가 선기록한 주문 금액과 다르면 거절 ──
    if (body.amount !== order.amount) {
      await markPaymentFailed(body.orderId, { reason: 'amount_mismatch', got: body.amount, expected: order.amount });
      return reply.code(400).send({ error: 'bad', message: '결제 금액이 주문과 일치하지 않아 승인할 수 없습니다.' });
    }

    const result = await getProvider().confirm({ paymentKey: body.paymentKey, orderId: body.orderId, amount: order.amount });
    if (!result.ok) {
      await markPaymentFailed(body.orderId, result.raw ?? { message: result.message });
      return reply.code(402).send({ error: 'payment', message: result.message ?? '결제 승인에 실패했어요.' });
    }

    await markPaymentConfirmed(body.orderId, {
      paymentKey: body.paymentKey,
      method: result.method,
      receiptUrl: result.receiptUrl,
      raw: result.raw,
    });
    const periodEnd = new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const sub = await activatePremium(user.id, getProvider().id, periodEnd);
    if (!sub) return reply.code(503).send({ error: 'bad', message: '구독 활성화에 실패했어요. 고객센터에 문의해주세요.' });

    return { ok: true, plan: 'premium', currentPeriodEnd: sub.current_period_end };
  });

  // 토스 웹훅 자리 (결제 상태 변경 통지). 실 연동 시 서명 검증 + 이벤트별 처리 추가.
  app.post('/api/billing/webhook/toss', async (req, reply) => {
    const payload = req.body as { eventType?: string } | null;
    app.log.info({ tossWebhook: payload?.eventType ?? 'unknown' }, '[billing] 토스 웹훅 수신 (스캐폴드)');
    // TODO: 가상계좌 입금(DEPOSIT_CALLBACK), 결제 취소 등 eventType별 구독/결제 상태 반영
    return reply.code(200).send({ ok: true });
  });
}
