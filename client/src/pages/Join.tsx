import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ClassroomInfoResponse, ClassroomMode } from '@shared/types';
import { apiGet } from '../lib/api';
import { getNickname, setNickname } from '../lib/session';
import { generateNickname } from '../lib/nickname';

export default function Join() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState((params.get('token') ?? '').toUpperCase());
  const [nick, setNick] = useState(getNickname());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // 코드가 6자 채워지면(QR 딥링크 포함) 강의실 정보를 미리 조회해 모드를 안다.
  // 강당(auditorium)이면 닉네임을 자동 생성해 미리 채워 1탭 입장 (R2 A1-3). 교실 모드는 기존과 동일.
  const [mode, setMode] = useState<ClassroomMode | null>(null);
  const nickRef = useRef(nick);
  nickRef.current = nick;

  useEffect(() => {
    const t = token.trim().toUpperCase();
    if (t.length !== 6) {
      setMode(null);
      return;
    }
    let alive = true;
    apiGet<ClassroomInfoResponse>(`/api/classrooms/${t}`)
      .then((info) => {
        if (!alive || !info.exists) return;
        const m = info.mode ?? 'classroom';
        setMode(m);
        if (m === 'auditorium' && !nickRef.current.trim()) setNick(generateNickname());
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  const auditorium = mode === 'auditorium';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const t = token.trim().toUpperCase();
    const n = nick.trim();
    if (t.length < 4) return setErr(auditorium ? '입장 코드를 확인해 주세요.' : '강의실 코드를 확인해줘!');
    if (!n) return setErr(auditorium ? '닉네임을 입력해 주세요.' : '닉네임을 입력해줘!');
    setBusy(true);
    try {
      const info = await apiGet<ClassroomInfoResponse>(`/api/classrooms/${t}`);
      if (!info.exists) {
        setErr(auditorium ? '해당 코드의 세션이 없습니다. 다시 확인해 주세요.' : '그런 강의실 코드가 없어. 다시 확인해줘!');
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
      <h1 className="text-center text-2xl font-extrabold text-strong">{auditorium ? '강연 입장 🎤' : '강의실 입장 🎓'}</h1>
      <p className="mt-2 text-center text-sm text-muted">
        {auditorium ? '화면의 코드를 확인하고 닉네임 그대로 입장하세요.' : '선생님이 알려준 코드를 입력해 주세요.'}
      </p>
      <form className="card mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">{auditorium ? '입장 코드' : '강의실 코드'}</label>
          <input
            className="input text-center text-2xl font-bold tracking-[0.3em]"
            placeholder="ABC123"
            value={token}
            maxLength={6}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            data-testid="join-token"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">닉네임</label>
          <div className="flex gap-2">
            <input
              className="input text-center text-lg"
              placeholder="내 이름/별명"
              value={nick}
              maxLength={12}
              onChange={(e) => setNick(e.target.value)}
              data-testid="join-nick"
            />
            <button
              type="button"
              className="btn-ghost shrink-0 px-3 text-xl"
              title="닉네임 자동 생성"
              aria-label="닉네임 자동 생성"
              onClick={() => setNick(generateNickname())}
              data-testid="join-dice"
            >
              🎲
            </button>
          </div>
          {auditorium && (
            <p className="mt-1.5 text-center text-xs text-muted-2">
              자동으로 만든 닉네임이에요. 그대로 입장하거나 바꿔도 돼요 · 개인정보를 수집하지 않습니다
            </p>
          )}
        </div>
        {err && <p className="text-center text-sm text-down">{err}</p>}
        <button className="btn-primary w-full py-4 text-lg" disabled={busy} data-testid="join-submit">
          {busy ? '입장 중…' : '입장하기'}
        </button>
      </form>
    </div>
  );
}
