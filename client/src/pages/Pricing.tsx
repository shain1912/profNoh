import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchPlans, fetchBillingMe, formatKrw, type PlanInfo, type BillingMe } from '../lib/billing';
import { fetchMe, type Me } from '../lib/auth';

/** 요금제 안내 + 내 구독 상태. 업그레이드 버튼 → /checkout 결제 플로우. */
export default function Pricing() {
  const nav = useNavigate();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setPlans(await fetchPlans().catch(() => []));
      const u = await fetchMe();
      setMe(u);
      if (u) setBilling(await fetchBillingMe().catch(() => null));
      setLoaded(true);
    })();
  }, []);

  const current = billing?.plan ?? (me ? 'free' : null);
  const periodEnd = billing?.subscription?.currentPeriodEnd;

  return (
    <div className="mx-auto max-w-4xl p-6 animate-fade-in">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold">요금제</h1>
        <p className="mt-2 text-white/50">수업이 커지면, 플랜도 함께.</p>
      </div>

      {me && billing && (
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <span className="font-bold">내 구독:</span>{' '}
          <span className="font-extrabold text-brand">{plans.find((p) => p.id === current)?.name ?? current}</span>
          {current === 'premium' && periodEnd && (
            <span className="text-white/50"> · {new Date(periodEnd).toLocaleDateString('ko-KR')} 까지</span>
          )}
          {current === 'org' && <span className="text-white/50"> · 기관 소속 계정</span>}
          <Link to="/billing" className="float-right text-brand underline">결제 내역 →</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-2xl border p-5 ${
              p.id === 'premium' ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5'
            }`}
          >
            <h2 className="text-lg font-extrabold">{p.name}</h2>
            <p className="mt-1 text-2xl font-black">
              {p.priceKrw === null ? '문의' : p.priceKrw === 0 ? '0원' : `${formatKrw(p.priceKrw)}/월`}
            </p>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-white/70">
              {p.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <div className="mt-5">
              {p.id === 'premium' ? (
                current === 'premium' ? (
                  <div className="rounded-xl bg-white/10 py-2.5 text-center text-sm font-bold text-white/50">구독 중 ✓</div>
                ) : current === 'org' ? (
                  <div className="rounded-xl bg-white/10 py-2.5 text-center text-sm font-bold text-white/50">기관 플랜 이용 중</div>
                ) : (
                  <button
                    className="w-full rounded-xl bg-brand py-2.5 font-bold transition hover:brightness-110 active:scale-[0.99]"
                    onClick={() => (me ? nav('/checkout') : nav('/build'))}
                  >
                    {me ? '업그레이드' : '로그인하고 시작하기'}
                  </button>
                )
              ) : p.id === 'org' ? (
                <a href="mailto:contact@kodekorea.kr" className="block rounded-xl border border-white/15 py-2.5 text-center text-sm font-bold">
                  도입 문의
                </a>
              ) : (
                <div className="rounded-xl border border-white/10 py-2.5 text-center text-sm font-bold text-white/50">
                  {current === 'free' ? '이용 중' : '기본 플랜'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loaded && <p className="mt-6 text-center text-white/40">불러오는 중… ⏳</p>}
    </div>
  );
}
