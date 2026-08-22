import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchBillingMe, formatKrw, type BillingMe } from '../lib/billing';
import { useUser } from '../components/AuthGate';

const PLAN_LABEL: Record<string, string> = { free: '무료', premium: '프리미엄', org: '기관' };
const STATUS_LABEL: Record<string, string> = { ready: '대기', confirmed: '완료', failed: '실패', canceled: '취소' };

/** 내 구독 상태 + 결제 내역 */
export default function Billing() {
  const { user } = useUser();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchBillingMe().then(setMe).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="p-6 text-center text-down">{err}</div>;
  if (!me) return <div className="grid h-full place-items-center text-white/40">불러오는 중… ⏳</div>;

  return (
    <div className="mx-auto max-w-2xl p-6 animate-fade-in">
      <h1 className="text-2xl font-extrabold">내 구독</h1>
      <p className="mt-1 text-sm text-white/40">{user.email}</p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/50">현재 플랜</p>
            <p className="text-xl font-extrabold text-brand">{PLAN_LABEL[me.plan] ?? me.plan}</p>
            {me.plan === 'premium' && me.subscription?.currentPeriodEnd && (
              <p className="mt-1 text-sm text-white/50">
                {new Date(me.subscription.currentPeriodEnd).toLocaleDateString('ko-KR')} 까지 이용 가능
              </p>
            )}
            {me.plan === 'org' && <p className="mt-1 text-sm text-white/50">기관 소속 계정은 기관 정책을 따릅니다.</p>}
          </div>
          {me.plan === 'free' && (
            <Link to="/checkout" className="rounded-xl bg-brand px-4 py-2.5 font-bold">업그레이드</Link>
          )}
        </div>
      </div>

      <h2 className="mt-8 font-extrabold">결제 내역</h2>
      {me.payments.length === 0 ? (
        <p className="mt-3 text-sm text-white/40">아직 결제 내역이 없어요.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {me.payments.map((p) => (
            <div key={p.orderId} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <div>
                <p className="font-bold">{PLAN_LABEL[p.plan] ?? p.plan} · {formatKrw(p.amount)}</p>
                <p className="text-xs text-white/40">{new Date(p.createdAt).toLocaleString('ko-KR')} · {p.orderId}</p>
              </div>
              <div className="text-right">
                <span className={p.status === 'confirmed' ? 'font-bold text-up' : p.status === 'failed' ? 'text-down' : 'text-white/50'}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                {p.receiptUrl && p.status === 'confirmed' && (
                  <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="block text-xs text-white/40 underline">영수증</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-center">
        <Link to="/pricing" className="text-sm text-white/50 underline">요금제 안내 보기</Link>
      </p>
    </div>
  );
}
