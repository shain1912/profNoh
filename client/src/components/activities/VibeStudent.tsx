import { useEffect, useRef, useState } from 'react';
import type { VibeActivity } from '@shared/types';
import { apiGet } from '../../lib/api';

// 바이브코딩 학생 화면 — 말로 설명 → AI 가 코드를 쓰는 모습을 실시간으로 보고 → 폰에서 바로 실행.
// 앱은 /api/vibe/app/:id (CSP sandbox) 를 iframe 으로만 띄운다.

interface AppMeta { appId: string; activityId: string; title: string; prompt: string; createdAt: number }
interface MyImage { url: string; prompt: string }

const appUrl = (id: string) => `/api/vibe/app/${id}`;

export default function VibeStudent({
  activity,
  token,
  sessionId,
}: {
  activity: VibeActivity;
  token: string;
  sessionId: string;
}) {
  const [apps, setApps] = useState<AppMeta[]>([]);
  const [images, setImages] = useState<MyImage[]>([]);
  const [current, setCurrent] = useState<AppMeta | null>(null);
  const [used, setUsed] = useState(0);
  const limit = activity.maxBuilds ?? 8;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const continueMode = activity.continueMode === 'continue';

  // 내 앱 기록 불러오기 — 이어서 고치기면 가장 최근 앱(다른 교시 것 포함), 새로 만들기면 이 활동에서 만든 것만
  useEffect(() => {
    let alive = true;
    apiGet<{ apps: AppMeta[]; images: MyImage[]; used: number }>(
      `/api/vibe/mine?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}&activityId=${encodeURIComponent(activity.id)}`,
    )
      .then((r) => {
        if (!alive) return;
        const list = continueMode ? r.apps : r.apps.filter((a) => a.activityId === activity.id);
        setApps(list);
        setImages(r.images ?? []);
        setUsed(r.used ?? 0);
        setCurrent(list[list.length - 1] ?? null);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [token, sessionId, activity.id, continueMode]);

  useEffect(() => {
    if (codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight;
  }, [code]);

  async function build() {
    const p = prompt.trim();
    if (!p || busy) return;
    setErr('');
    setBusy(true);
    setCode('');
    try {
      const res = await fetch('/api/ai/vibe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sessionId, activityId: activity.id, prompt: p, baseAppId: current?.appId }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any)?.message ?? '요청 실패');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let done: { appId: string; title: string; used: number } | null = null;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const m = JSON.parse(line);
          if (m.t === 'd') setCode((c) => c + m.d);
          else if (m.t === 'done') done = m;
          else if (m.t === 'error') throw new Error(m.message);
        }
      }
      if (!done) throw new Error('연결이 끊겼어요. 다시 시도해 주세요.');
      const meta: AppMeta = { appId: done.appId, activityId: activity.id, title: done.title, prompt: p, createdAt: Date.now() };
      setApps((a) => [...a, meta]);
      setCurrent(meta);
      setUsed(done.used);
      setPrompt('');
      setCode('');
    } catch (e: any) {
      setErr(e?.message ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function share() {
    if (!current) return;
    const url = `${location.origin}${appUrl(current.appId)}`;
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => {},
    );
  }

  const left = Math.max(0, limit - used);
  const lines = code.split('\n').length;
  const editing = !!current;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h2 className="text-xl font-bold text-strong">💻 {activity.title}</h2>
        {activity.intro && <p className="mt-1 text-sm text-muted">{activity.intro}</p>}
      </div>

      <div className="rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-hairline">
        <div className="font-semibold text-strong">🎯 미션</div>
        <p className="mt-1 whitespace-pre-line text-body">{activity.task}</p>
        <div className="mt-2 text-xs text-muted">남은 횟수 {left}/{limit}</div>
      </div>

      {loaded && continueMode && !current && (
        <p className="rounded-lg bg-surface-2 p-2 text-xs text-warn ring-1 ring-hairline">
          아직 만든 앱이 없어요. 이번에 새로 만들어 보세요!
        </p>
      )}

      {/* 결과 미리보기 */}
      {current && !busy && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-sm font-semibold text-strong">📱 {current.title}</div>
            {apps.length > 1 && (
              <select
                className="input !w-auto !py-1 text-xs"
                value={current.appId}
                onChange={(e) => setCurrent(apps.find((a) => a.appId === e.target.value) ?? current)}
              >
                {apps.map((a, i) => (
                  <option key={a.appId} value={a.appId}>v{i + 1} · {a.title}</option>
                ))}
              </select>
            )}
          </div>
          <iframe
            key={current.appId}
            src={appUrl(current.appId)}
            title={current.title}
            sandbox="allow-scripts allow-modals allow-popups"
            className="h-[62vh] w-full rounded-xl bg-white ring-1 ring-hairline"
          />
          <div className="flex gap-2">
            <a className="btn-ghost flex-1 text-center text-sm" href={appUrl(current.appId)} target="_blank" rel="noreferrer">
              ↗ 전체 화면
            </a>
            <button className="btn-ghost flex-1 text-sm" onClick={share}>{copied ? '✅ 복사됨' : '🔗 링크 복사'}</button>
            {!continueMode && (
              <button className="btn-ghost text-sm" onClick={() => setCurrent(null)} title="처음부터 새 앱 만들기">✨ 새로</button>
            )}
          </div>
        </div>
      )}

      {/* 생성 중: 코드가 써지는 모습 */}
      {busy && (
        <div className="rounded-xl bg-[#0d1117] p-3 ring-1 ring-hairline">
          <div className="mb-2 flex items-center justify-between text-xs text-[#8b949e]">
            <span>🤖 AI가 코드를 쓰는 중…</span>
            <span>{code ? `${lines}줄` : '생각 중'}</span>
          </div>
          <pre ref={codeRef} className="h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-snug text-[#7ee787]">
            {code || '▍'}
          </pre>
        </div>
      )}

      {err && <p className="text-sm text-down">{err}</p>}

      {/* 아이디어 칩 (처음 만들 때만) */}
      {!editing && !busy && activity.ideas && activity.ideas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activity.ideas.map((s, i) => (
            <button key={i} className="rounded-full bg-surface-2 px-3 py-2 text-left text-sm ring-1 ring-hairline hover:bg-surface-3" onClick={() => setPrompt(s)}>
              💡 {s}
            </button>
          ))}
        </div>
      )}

      {/* 내 이미지 넣기 */}
      {activity.useMyImages && images.length > 0 && !busy && (
        <div>
          <div className="mb-1 text-xs text-muted">내가 만든 그림 — 누르면 요청에 추가돼요</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((im, i) => (
              <button
                key={im.url}
                className="shrink-0 overflow-hidden rounded-lg ring-1 ring-hairline"
                onClick={() => setPrompt((t) => `${t}${t ? ' ' : ''}내 그림 ${images.length - i}번(${im.prompt.slice(0, 20)})을 넣어줘.`)}
              >
                <img src={im.url} alt={im.prompt} className="h-16 w-16 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          build();
        }}
      >
        <textarea
          className="input min-h-[84px]"
          maxLength={600}
          placeholder={
            editing
              ? '무엇을 고칠까요? 한 번에 하나씩! 예: 버튼을 더 크게, 배경을 하늘색으로 바꿔줘'
              : '어떤 앱을 만들까요? 예: 비행기 부품 이름을 맞히는 퀴즈 앱. 문제 5개, 맞히면 점수가 올라가게'
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
        />
        <button className="btn-primary" disabled={busy || !prompt.trim() || left <= 0}>
          {busy ? '만드는 중… (30초~1분)' : left <= 0 ? '횟수를 다 썼어요' : editing ? '🔧 고치기' : '🚀 앱 만들기'}
        </button>
      </form>

      <p className="pb-24 text-[11px] text-muted">
        💡 좋은 요청 = 무엇을 하는 앱인지 + 화면이 어떻게 보이면 좋을지. 고칠 땐 한 번에 하나씩. 이름·전화번호 같은 개인정보는 넣지 마세요.
      </p>
    </div>
  );
}
