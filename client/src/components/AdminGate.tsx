import { useState, type ReactNode, type FormEvent } from 'react';
import { isAdminUnlocked, tryUnlockAdmin } from '../lib/adminAuth';

export default function AdminGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked());
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  if (unlocked) return <>{children}</>;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (tryUnlockAdmin(pw.trim())) {
      setUnlocked(true);
    } else {
      setErr('비밀번호가 올바르지 않습니다.');
      setPw('');
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xs flex-col justify-center p-6 text-center animate-fade-in">
      <div className="text-4xl mb-3">🔒</div>
      <h1 className="text-2xl font-extrabold">강사 인증</h1>
      <p className="mt-2 text-sm text-white/50">강사 전용 화면입니다. 비밀번호를 입력해 주세요.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          autoFocus
          inputMode="numeric"
          className="input w-full text-center text-lg tracking-[0.4em]"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(''); }}
          placeholder="비밀번호"
        />
        {err && <p className="text-sm text-down">{err}</p>}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={!pw}>
          입장하기
        </button>
      </form>
    </div>
  );
}
