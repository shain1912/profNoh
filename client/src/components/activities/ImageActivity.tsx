import { useState } from 'react';
import type { ImageActivity as ImageAct } from '@shared/types';
import { apiPost } from '../../lib/api';
import Thinking from '../Thinking';
import { useCopy } from '../../lib/copy';

export default function ImageActivity({
  activity,
  token,
  sessionId,
}: {
  activity: ImageAct;
  token: string;
  sessionId: string;
}) {
  const copy = useCopy();
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
      setErr(e.message ?? copy.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-xl font-bold text-strong">{activity.title}</h2>
      {activity.intro && <p className="mt-1 text-sm text-muted">{activity.intro}</p>}

      {activity.suggestions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activity.suggestions.map((s, i) => (
            <button key={i} className="rounded-full bg-surface-2 px-3 py-2 text-left text-sm ring-1 ring-hairline hover:bg-surface-3" onClick={() => setPrompt(s)}>
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
          placeholder={copy.imagePlaceholder}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="btn-primary" disabled={loading}>
          {loading ? '그리는 중…' : '만들기'}
        </button>
      </form>

      {err && <p className="mt-2 text-sm text-down">{err}</p>}

      {loading && <Thinking text={copy.imageThinking} />}

      <div className="mt-4 grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {images.map((im, i) => (
          <figure key={i} className="overflow-hidden rounded-xl bg-surface-2 ring-1 ring-hairline">
            <img src={im.url} alt={im.prompt} className="aspect-square w-full object-cover" />
            <figcaption className="p-2 text-xs text-muted">
              {im.demo && <span className="text-warn">[데모] </span>}
              {im.prompt}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
