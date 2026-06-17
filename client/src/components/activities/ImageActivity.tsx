import { useState } from 'react';
import type { ImageActivity as ImageAct } from '@shared/types';
import { apiPost } from '../../lib/api';
import Thinking from '../Thinking';

export default function ImageActivity({
  activity,
  token,
  sessionId,
}: {
  activity: ImageAct;
  token: string;
  sessionId: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [images, setImages] = useState<{ url: string; prompt: string; demo?: boolean }[]>([]);

  async function generate(text: string) {
    const p = text.trim();
    if (!p || loading) return;
    setErr('');
    setLoading(true);
    try {
      const r = await apiPost<{ dataUrl: string; demo: boolean }>('/api/ai/image', {
        token,
        sessionId,
        activityId: activity.id,
        prompt: p,
      });
      setImages((arr) => [{ url: r.dataUrl, prompt: p, demo: r.demo }, ...arr]);
    } catch (e: any) {
      setErr(e.message ?? '오류가 발생했어');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-xl font-bold">{activity.title}</h2>
      {activity.intro && <p className="mt-1 text-sm text-white/60">{activity.intro}</p>}

      {activity.suggestions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activity.suggestions.map((s, i) => (
            <button key={i} className="rounded-full bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/20" onClick={() => setPrompt(s)}>
              🎨 {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          generate(prompt);
        }}
      >
        <input
          className="input"
          placeholder="그리고 싶은 장면을 글로 묘사해줘…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="btn-primary" disabled={loading}>
          {loading ? '그리는 중…' : '만들기'}
        </button>
      </form>

      {err && <p className="mt-2 text-sm text-down">{err}</p>}

      {loading && <Thinking text="🎨 그리는 중… 최대 20초 정도 걸려요. 잠깐만 기다려줘!" />}

      <div className="mt-4 grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {images.map((im, i) => (
          <figure key={i} className="overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
            <img src={im.url} alt={im.prompt} className="aspect-square w-full object-cover" />
            <figcaption className="p-2 text-xs text-white/60">
              {im.demo && <span className="text-yellow-400">[데모] </span>}
              {im.prompt}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
