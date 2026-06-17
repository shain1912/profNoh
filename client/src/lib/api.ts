export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const r = await fetch(path);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}

export async function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}
