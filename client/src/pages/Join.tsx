import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ClassroomInfoResponse, ClassroomMode } from '@shared/types';
import { apiGet } from '../lib/api';
import { getNickname, setNickname } from '../lib/session';
import { generateNickname } from '../lib/nickname';
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
  // 세션 유형별 카피 톤 — 모드를 모르면 교실 톤
  const copy = copyFor(mode ?? 'classroom');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const t = token.trim().toUpperCase();
    const n = nick.trim();
    if (t.length < 4) return setErr(copy.joinBadCode);
    if (!n) return setErr(copy.joinNeedNick);
    setBusy(true);
    try {
      const info = await apiGet<ClassroomInfoResponse>(`/api/classrooms/${t}`);
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
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-6" data-mode={mode ?? 'classroom'}>
      <h1 className="text-center text-2xl font-extrabold text-strong">{auditorium ? '강연 입장 🎤' : copy.joinTitle}</h1>
      <p className="mt-2 text-center text-sm text-muted">
        {auditorium ? '화면의 코드를 확인하고 닉네임 그대로 입장하세요.' : copy.joinSubtitle}
      </p>
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
            data-testid="join-token"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">{copy.joinNickLabel}</label>
          <div className="flex gap-2">
            <input
              className="input text-center text-lg"
              placeholder={copy.joinNickPlaceholder}
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
