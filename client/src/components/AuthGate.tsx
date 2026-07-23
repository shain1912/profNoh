import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchMe, loginStartUrl, devLogin, logout, type Me } from '../lib/auth';

/** 로그인한 사용자 컨텍스트 — AuthGate 하위에서 useUser()로 접근 */
const UserCtx = createContext<{ user: Me; signOut: () => Promise<void> } | null>(null);
export function useUser() {
  const ctx = useContext(UserCtx);
  if (!ctx) throw new Error('useUser는 AuthGate 안에서만 사용');
  return ctx;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetchMe().then((u) => { setUser(u); setChecked(true); });
  }, []);

  const signOut = async () => {
    await logout();
    setUser(null);
  };

  if (!checked) return <div className="grid h-full place-items-center text-white/40">확인 중… ⏳</div>;
  if (!user) return <LoginScreen onLoggedIn={setUser} />;
  return <UserCtx.Provider value={{ user, signOut }}>{children}</UserCtx.Provider>;
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (u: Me) => void }) {
  const [devEmail, setDevEmail] = useState('');
  const [err, setErr] = useState('');
  const oauthError = new URLSearchParams(location.search).get('error');

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center p-6 text-center animate-fade-in">
      <div className="text-4xl mb-3">🧑‍🏫</div>
      <h1 className="text-2xl font-extrabold">강사 로그인</h1>
      <p className="mt-2 text-sm text-white/50">
        강의 자료는 내 계정에 안전하게 보관돼요.
        <br />
        학생은 로그인 없이 강의실 코드로 입장합니다.
      </p>

      {oauthError && (
        <p className="mt-4 rounded-lg bg-down/20 px-3 py-2 text-sm text-down">
          로그인에 실패했어요 ({oauthError}). 다시 시도해 주세요.
        </p>
      )}

      <div className="mt-8 space-y-3">
        <a
          href={loginStartUrl('kakao')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3 font-bold text-[#191919] transition hover:brightness-95 active:scale-[0.99]"
        >
          <span>💬</span> 카카오로 시작하기
        </a>
        <a
          href={loginStartUrl('google')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-bold text-[#1f1f1f] transition hover:brightness-95 active:scale-[0.99]"
        >
          <span className="font-black text-[#4285F4]">G</span> Google로 시작하기
        </a>
      </div>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-xl border border-dashed border-white/15 p-4 text-left">
          <p className="text-xs font-bold text-white/40">🛠 개발용 로그인 (로컬 전용)</p>
          <div className="mt-2 flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="dev@test.com"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              onKeyDown={async (e) => { if (e.key === 'Enter' && devEmail.trim()) { try { onLoggedIn(await devLogin(devEmail.trim())); } catch (er: any) { setErr(er.message); } } }}
            />
            <button
              className="btn-ghost border border-white/10 px-3 text-sm"
              onClick={async () => { try { onLoggedIn(await devLogin(devEmail.trim())); } catch (er: any) { setErr(er.message); } }}
              disabled={!devEmail.trim()}
            >
              입장
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-down">{err}</p>}
        </div>
      )}
    </div>
  );
}
