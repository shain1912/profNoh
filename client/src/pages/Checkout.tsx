import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { startCheckout, confirmPayment, formatKrw, type CheckoutInfo } from '../lib/billing';
import { useUser } from '../components/AuthGate';

/**
 * 결제위젯 페이지 (토스페이먼츠 테스트 모드 스캐폴드).
 * - provider=toss: 토스 결제위젯 SDK(v2)를 동적 로드해 위젯 렌더 → successUrl로 복귀 후 서버 승인.
 * - provider=mock: SDK/실키 없이 모의 승인 버튼으로 동일한 승인 플로우(E2E)를 시뮬레이션.
 */
export default function Checkout() {
  const nav = useNavigate();
  const { user } = useUser();
  const [sp] = useSearchParams();
  const result = sp.get('result'); // 토스 successUrl/failUrl 복귀 처리

  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [phase, setPhase] = useState<'loading' | 'widget' | 'confirming' | 'done' | 'error'>('loading');
  const [err, setErr] = useState('');
  const widgetsRef = useRef<any>(null);

  // 1) 토스 successUrl 복귀: 쿼리의 paymentKey/orderId/amount로 서버 승인
  useEffect(() => {
    if (result !== 'success') return;
    const paymentKey = sp.get('paymentKey');
    const orderId = sp.get('orderId');
    const amount = Number(sp.get('amount'));
    if (!paymentKey || !orderId || !amount) { setPhase('error'); setErr('결제 복귀 정보가 없습니다.'); return; }
    setPhase('confirming');
    confirmPayment({ paymentKey, orderId, amount })
      .then(() => setPhase('done'))
      .catch((e) => { setPhase('error'); setErr(e.message); });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (result === 'fail') { setPhase('error'); setErr(sp.get('message') ?? '결제가 취소되었어요.'); }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) 신규 진입: 서버에 주문 선기록(checkout) 후 위젯 준비
  useEffect(() => {
    if (result) return;
    (async () => {
      try {
        const i = await startCheckout('premium');
        setInfo(i);
        if (i.provider === 'toss' && i.clientKey) {
          await loadTossSdk();
          const toss = (window as any).TossPayments(i.clientKey);
          const widgets = toss.widgets({ customerKey: i.customerKey });
          await widgets.setAmount({ currency: 'KRW', value: i.amount });
          await widgets.renderPaymentMethods({ selector: '#payment-methods' });
          await widgets.renderAgreement({ selector: '#agreement' });
          widgetsRef.current = widgets;
        }
        setPhase('widget');
      } catch (e: any) {
        setPhase('error');
        setErr(e.message ?? '결제 준비에 실패했어요.');
      }
    })();
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  async function payToss() {
    if (!info || !widgetsRef.current) return;
    try {
      await widgetsRef.current.requestPayment({
        orderId: info.orderId,
        orderName: info.orderName,
        customerEmail: user.email,
        successUrl: `${location.origin}/checkout?result=success`,
        failUrl: `${location.origin}/checkout?result=fail`,
      });
    } catch (e: any) {
      setErr(e.message ?? '결제 요청 실패');
    }
  }

  async function payMock() {
    if (!info) return;
    setPhase('confirming');
    try {
      await confirmPayment({ paymentKey: `mock_${info.orderId}`, orderId: info.orderId, amount: info.amount });
      setPhase('done');
    } catch (e: any) {
      setPhase('error');
      setErr(e.message);
    }
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center p-6 text-center animate-fade-in">
        <div className="text-5xl">🎉</div>
        <h1 className="mt-4 text-2xl font-extrabold">프리미엄 시작!</h1>
        <p className="mt-2 text-white/50">이제 덱을 무제한으로 만들 수 있어요.</p>
        <div className="mt-8 space-y-3">
          <button className="w-full rounded-xl bg-brand py-3 font-bold" onClick={() => nav('/build')}>강의 만들러 가기</button>
          <Link to="/billing" className="block text-sm text-white/50 underline">구독/결제 내역 보기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 animate-fade-in">
      <h1 className="text-2xl font-extrabold">프리미엄 결제</h1>
      {info && (
        <p className="mt-1 text-white/50">
          {info.orderName} · <b className="text-white">{formatKrw(info.amount)}</b>
        </p>
      )}

      {phase === 'loading' && <p className="mt-10 text-center text-white/40">결제 준비 중… ⏳</p>}
      {phase === 'confirming' && <p className="mt-10 text-center text-white/40">결제 승인 중… ⏳</p>}

      {phase === 'error' && (
        <div className="mt-6 rounded-xl bg-down/20 p-4 text-sm text-down">
          {err}
          <div className="mt-3">
            <Link to="/pricing" className="underline">요금제로 돌아가기</Link>
          </div>
        </div>
      )}

      {/* 위젯 컨테이너는 항상 DOM에 존재해야 함 — renderPaymentMethods가 loading 단계에서 selector를 찾기 때문 */}
      <div className="mt-6">
        <div id="payment-methods" />
        <div id="agreement" />
        {phase === 'widget' && info?.provider === 'toss' && (
          <button className="mt-4 w-full rounded-xl bg-brand py-3 font-bold" onClick={payToss}>
            {formatKrw(info.amount)} 결제하기
          </button>
        )}
      </div>

      {phase === 'widget' && info?.provider === 'mock' && (
        <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-5">
          <p className="text-sm text-white/60">
            🛠 <b>모의 결제 모드</b> — 토스 키가 설정되지 않아 실제 결제 없이 승인 플로우만 시뮬레이션합니다.
            (서버 <code>BILLING_PROVIDER=toss</code> + 테스트 키 설정 시 실제 위젯이 렌더됩니다)
          </p>
          <button className="mt-4 w-full rounded-xl bg-brand py-3 font-bold" onClick={payMock}>
            모의 결제 진행 ({formatKrw(info.amount)})
          </button>
        </div>
      )}
    </div>
  );
}

function loadTossSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).TossPayments) return resolve();
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v2/standard';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('토스 SDK 로드 실패'));
    document.head.appendChild(s);
  });
}
