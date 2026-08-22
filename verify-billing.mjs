// 결제/플랜 (TASK C) API 검증 스크립트
// 사용: node verify-billing.mjs [BASE]  (기본 http://localhost:8793)
// 전제: 서버 DEV_LOGIN=1, BILLING_PROVIDER=mock
const BASE = process.argv[2] || 'http://localhost:8793';
const email = `billing-test-${Date.now()}@example.com`;

let cookie = '';
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}
async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}

console.log(`\n결제/플랜 검증 시작 — ${BASE} (${email})\n`);

// 0) 로그인
{
  const r = await api('POST', '/api/auth/dev-login', { email, name: '결제테스터' });
  ok('dev-login 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
}

// 1) 요금제/설정 공개 API
{
  const p = await api('GET', '/api/billing/plans');
  ok('plans: free/premium/org 3종', p.status === 200 && p.data.plans?.length === 3);
  ok('premium 가격 9900', p.data.plans?.find((x) => x.id === 'premium')?.priceKrw === 9900);
  const c = await api('GET', '/api/billing/config');
  ok('config: provider 반환', c.status === 200 && ['mock', 'toss'].includes(c.data.provider));
}

// 2) 초기 플랜 = free
{
  const r = await api('GET', '/api/billing/me');
  ok('billing/me: plan=free', r.status === 200 && r.data.plan === 'free', JSON.stringify(r.data));
}

// 3) free 덱 3개 제한 — 3개 생성 OK, 4번째 402
const decks = [];
{
  for (let i = 1; i <= 3; i++) {
    const r = await api('POST', '/api/decks', { title: `검증덱${i}` });
    ok(`덱 ${i}/3 생성 200`, r.status === 200 && r.data.deckId, `got ${r.status}`);
    if (r.data?.deckId) decks.push(r.data);
  }
  const r4 = await api('POST', '/api/decks', { title: '검증덱4' });
  ok('4번째 덱 402 (plan_limit)', r4.status === 402 && r4.data.error === 'plan_limit', `got ${r4.status} ${JSON.stringify(r4.data)}`);
}

// 4) 체크아웃 → 주문 선기록
let order = null;
{
  const r = await api('POST', '/api/billing/checkout', { plan: 'premium' });
  ok('checkout 200 + orderId/amount', r.status === 200 && r.data.orderId && r.data.amount === 9900, JSON.stringify(r.data));
  order = r.data;
}

// 5) 금액 위변조 → 400 거절
{
  const r = await api('POST', '/api/billing/confirm', { paymentKey: `mock_${order.orderId}`, orderId: order.orderId, amount: 100 });
  ok('위변조 금액(100원) 승인 거절 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.data)}`);
}

// 6) 정상 승인 (금액 실패로 주문이 failed 처리됐으므로 새 주문으로)
{
  const c2 = await api('POST', '/api/billing/checkout', { plan: 'premium' });
  ok('재체크아웃 200', c2.status === 200 && c2.data.orderId);
  const r = await api('POST', '/api/billing/confirm', { paymentKey: `mock_${c2.data.orderId}`, orderId: c2.data.orderId, amount: c2.data.amount });
  ok('정상 금액 승인 200 → premium', r.status === 200 && r.data.plan === 'premium', JSON.stringify(r.data));
  const dup = await api('POST', '/api/billing/confirm', { paymentKey: `mock_${c2.data.orderId}`, orderId: c2.data.orderId, amount: c2.data.amount });
  ok('중복 승인 400 거절', dup.status === 400, `got ${dup.status}`);
}

// 7) 승인 후 상태: plan=premium + 결제 내역 + 이미 구독 중 재체크아웃 거절
{
  const r = await api('GET', '/api/billing/me');
  ok('billing/me: plan=premium', r.status === 200 && r.data.plan === 'premium');
  ok('결제 내역에 confirmed 존재', r.data.payments?.some((p) => p.status === 'confirmed'));
  ok('구독 만료일 존재(미래)', r.data.subscription?.currentPeriodEnd && new Date(r.data.subscription.currentPeriodEnd) > new Date());
  const c = await api('POST', '/api/billing/checkout', { plan: 'premium' });
  ok('구독 중 재체크아웃 400', c.status === 400);
}

// 8) premium이면 4번째 덱 생성 가능
{
  const r = await api('POST', '/api/decks', { title: '검증덱4(프리미엄)' });
  ok('premium: 4번째 덱 생성 200', r.status === 200 && r.data.deckId, `got ${r.status}`);
  if (r.data?.deckId) decks.push(r.data);
}

// 9) 웹훅 자리 200
{
  const r = await api('POST', '/api/billing/webhook/toss', { eventType: 'PAYMENT_STATUS_CHANGED', data: { status: 'DONE' } });
  ok('웹훅 200', r.status === 200);
}

// 정리: 만든 덱 삭제
for (const d of decks) {
  await api('DELETE', `/api/decks/${d.deckId}`, { editPin: d.editPin });
}
console.log(`\n정리: 덱 ${decks.length}개 삭제 시도 완료`);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
