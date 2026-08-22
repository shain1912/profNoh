import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { getNickname, setNickname } from '../lib/session';

export default function Join() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState((params.get('token') ?? '').toUpperCase());
  const [nick, setNick] = useState(getNickname());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const t = token.trim().toUpperCase();
    const n = nick.trim();
    if (t.length < 4) return setErr('강의실 코드를 확인해줘!');
    if (!n) return setErr('닉네임을 입력해줘!');
    setBusy(true);
    try {
      const info = await apiGet<{ exists: boolean }>(`/api/classrooms/${t}`);
      if (!info.exists) {
        setErr('그런 강의실 코드가 없어. 다시 확인해줘!');
        return;
      }
      setNickname(n);
      nav(`/play?token=${t}`);
    } catch {
      setErr('연결에 문제가 있어. 잠시 후 다시 시도해줘.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-6">
      <h1 className="text-center text-2xl font-extrabold text-strong">강의실 입장 🎓</h1>
      <p className="mt-2 text-center text-sm text-muted">선생님이 알려준 코드를 입력해 주세요.</p>
      <form className="card mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">강의실 코드</label>
          <input
            className="input text-center text-2xl font-bold tracking-[0.3em]"
            placeholder="ABC123"
            value={token}
            maxLength={6}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">닉네임</label>
          <input
            className="input text-center text-lg"
            placeholder="내 이름/별명"
            value={nick}
            maxLength={12}
            onChange={(e) => setNick(e.target.value)}
          />
        </div>
        {err && <p className="text-center text-sm text-down">{err}</p>}
        <button className="btn-primary w-full py-4 text-lg" disabled={busy}>
          {busy ? '입장 중…' : '입장하기'}
        </button>
      </form>
    </div>
  );
}
