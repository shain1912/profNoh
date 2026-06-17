export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('axedu_auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('axedu_auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(path, { headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}

export async function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('axedu_auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}
