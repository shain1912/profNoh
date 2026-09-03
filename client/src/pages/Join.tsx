import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { getNickname, setNickname } from '../lib/session';
import { useResolvedSessionMode } from '../lib/sessionMode';
import { copyFor } from '../lib/copy';

// 거절 비용 0 (R2 A8): 이 화면은 오디오·진동·푸시·카메라 등 어떤 권한도 요청하지 않는다.
// (QR 스캔은 폰 카메라 앱이 담당하고, 웹은 코드/닉네임 입력만 받는다)
export default function Join() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState((params.get('token') ?? '').toUpperCase());
  const [nick, setNick] = useState(getNickname());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // 코드가 입력되면 세션 유형(교실/강당)을 조회해 카피 톤을 맞춘다 — 모르면 교실 톤
  const mode = useResolvedSessionMode(token);
  const copy = copyFor(mode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const t = token.trim().toUpperCase();
    const n = nick.trim();
    if (t.length < 4) return setErr(copy.joinBadCode);
    if (!n) return setErr(copy.joinNeedNick);
    setBusy(true);
    try {
      const info = await apiGet<{ exists: boolean }>(`/api/classrooms/${t}`);
      if (!info.exists) {
        setErr(copy.joinNoRoom);
        return;
      }
      setNickname(n);
      nav(`/play?token=${t}`);
    } catch {
      setErr(copy.joinNetErr);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-6" data-mode={mode}>
      <h1 className="text-center text-2xl font-extrabold text-strong">{copy.joinTitle}</h1>
      <p className="mt-2 text-center text-sm text-muted">{copy.joinSubtitle}</p>
      <form className="card mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">{copy.joinCodeLabel}</label>
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
          <label className="mb-1.5 block text-sm font-semibold text-muted">{copy.joinNickLabel}</label>
          <input
            className="input text-center text-lg"
            placeholder={copy.joinNickPlaceholder}
            value={nick}
            maxLength={12}
            onChange={(e) => setNick(e.target.value)}
          />
        </div>
        {err && <p className="text-center text-sm text-down">{err}</p>}
        <button className="btn-primary w-full py-4 text-lg" disabled={busy}>
          {busy ? copy.joinBusy : copy.joinSubmit}
        </button>
      </form>
      {/* 수집 데이터 명시 1줄 (R2 A8-3) */}
      <p className="mt-4 text-center text-xs text-muted-2" data-testid="privacy-line">
        🔒 {copy.privacyLine}
      </p>
    </div>
  );
}
