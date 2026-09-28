import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/api';

// 바이브코딩 작품 갤러리 — 강사가 프로젝터에 띄워 학생 앱을 보여준다.
// 한 화면 12개씩(아이프레임 수백 개를 한 번에 띄우지 않게), 10초마다 새로고침, 누르면 크게 보기.

interface GalleryApp { appId: string; title: string; prompt: string; nickname: string; versions: number; createdAt: number }

const PAGE = 12;

export default function VibeGallery() {
  const { classroomId } = useParams();
  const [sp] = useSearchParams();
  const secret = sp.get('secret') ?? '';
  const [apps, setApps] = useState<GalleryApp[]>([]);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(0);
  const [spot, setSpot] = useState<GalleryApp | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiGet<{ apps: GalleryApp[] }>(`/api/classrooms/${classroomId}/vibe-gallery?secret=${encodeURIComponent(secret)}`)
        .then((r) => { if (alive) { setApps(r.apps); setErr(''); } })
        .catch((e) => alive && setErr(e.message ?? '불러오기 실패'));
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [classroomId, secret]);

  const pages = Math.max(1, Math.ceil(apps.length / PAGE));
  const shown = apps.slice(page * PAGE, page * PAGE + PAGE);

  if (spot) {
    return (
      <div className="flex h-screen flex-col items-center gap-3 bg-surface-2 p-4">
        <div className="flex w-full max-w-5xl items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-strong">{spot.title}</div>
            <div className="text-muted">by {spot.nickname} · 수정 {spot.versions}번 · “{spot.prompt}”</div>
          </div>
          <button className="btn-primary" onClick={() => setSpot(null)}>← 갤러리로</button>
        </div>
        <iframe
          src={`/api/vibe/app/${spot.appId}`}
          title={spot.title}
          sandbox="allow-scripts allow-modals allow-popups"
          className="w-[430px] max-w-full flex-1 rounded-[2rem] border-[10px] border-neutral-800 bg-white shadow-2xl"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-strong">💻 바이브코딩 작품 갤러리 <span className="text-lg text-muted">({apps.length}개)</span></h1>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>◀</button>
            <span className="text-muted">{page + 1} / {pages}</span>
            <button className="btn-ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>▶</button>
          </div>
        )}
      </div>
      {err && <p className="text-down">{err}</p>}
      {!err && apps.length === 0 && <p className="text-lg text-muted">아직 만든 앱이 없어요. 학생들이 앱을 만들면 10초 안에 여기에 나타납니다.</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        {shown.map((a) => (
          <button key={a.appId} className="group flex flex-col overflow-hidden rounded-2xl bg-surface text-left ring-1 ring-hairline hover:ring-2 hover:ring-brand" onClick={() => setSpot(a)}>
            <div className="relative h-72 w-full overflow-hidden bg-white">
              <iframe
                src={`/api/vibe/app/${a.appId}`}
                title={a.title}
                sandbox="allow-scripts"
                loading="lazy"
                tabIndex={-1}
                className="pointer-events-none h-[576px] w-[200%] origin-top-left scale-50"
              />
            </div>
            <div className="p-2">
              <div className="truncate font-semibold text-strong">{a.title}</div>
              <div className="truncate text-xs text-muted">{a.nickname} · v{a.versions}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
