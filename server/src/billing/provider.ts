import { env } from '../env';

/**
 * 결제 공급자 추상화 — 토스페이먼츠(테스트 모드) + mock.
 * BILLING_PROVIDER=mock 이면 실키 없이도 결제 승인 플로우를 E2E로 시뮬레이션할 수 있다.
 */

export interface ConfirmResult {
  ok: boolean;
  /** 승인 실패 시 사용자에게 보여줄 메시지 */
  message?: string;
  method?: string;
  receiptUrl?: string;
  raw?: unknown;
}

export interface PaymentProvider {
  id: 'toss' | 'mock';
  /** 결제위젯이 넘긴 (paymentKey, orderId, amount)를 최종 승인. 금액 검증은 호출부(라우트)에서 선행. */
  confirm(p: { paymentKey: string; orderId: string; amount: number }): Promise<ConfirmResult>;
}

/** 토스페이먼츠 결제 승인 API (테스트 키: test_sk_...) */
const tossProvider: PaymentProvider = {
  id: 'toss',
  async confirm({ paymentKey, orderId, amount }) {
    const auth = Buffer.from(`${env.TOSS_SECRET_KEY}:`).toString('base64');
    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, message: j?.message ?? `토스 승인 실패 (${r.status})`, raw: j };
    }
    return {
      ok: true,
      method: j?.method ?? undefined,
      receiptUrl: j?.receipt?.url ?? undefined,
      raw: j,
    };
  },
};

/** mock: paymentKey가 'mock_'으로 시작하면 무조건 승인. 실키/외부 호출 없음. */
const mockProvider: PaymentProvider = {
  id: 'mock',
  async confirm({ paymentKey, orderId }) {
    if (!paymentKey.startsWith('mock_')) {
      return { ok: false, message: 'mock 모드에서는 mock_ paymentKey만 승인됩니다.' };
    }
    return {
      ok: true,
      method: '카드(모의)',
      receiptUrl: `https://example.invalid/receipt/${orderId}`,
      raw: { mock: true, paymentKey, orderId },
    };
  },
};

export function getProvider(): PaymentProvider {
  return env.BILLING_PROVIDER === 'toss' ? tossProvider : mockProvider;
}
