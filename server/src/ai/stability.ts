import { env, hasStability } from '../env';

const IMAGE_COST_PER_CALL = 0.03;

// 1x1 투명/회색 placeholder (데모 모드용)
const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let rr = 0;
function rotatedKeys(): string[] {
  const keys = env.STABILITY_API_KEYS;
  if (keys.length <= 1) return keys;
  const start = rr++ % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

async function callOnce(key: string, prompt: string): Promise<string> {
  const url = `${env.STABILITY_BASE_URL}/v2beta/stable-image/generate/core`;
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  form.append('aspect_ratio', '1:1');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Stability ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const b64: string | undefined = data?.image ?? data?.artifacts?.[0]?.base64;
  if (!b64) throw new Error('Stability: 이미지 데이터를 찾을 수 없음');
  return b64;
}

export async function generateImage(
  prompt: string,
): Promise<{ dataUrl: string; cost: number; demo?: boolean }> {
  if (!hasStability) {
    return { dataUrl: `data:image/png;base64,${PLACEHOLDER_PNG_BASE64}`, cost: 0, demo: true };
  }
  const keys = rotatedKeys();
  let lastErr: unknown;
  for (const key of keys) {
    try {
      const b64 = await callOnce(key, prompt);
      return { dataUrl: `data:image/png;base64,${b64}`, cost: IMAGE_COST_PER_CALL };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Stability 호출 실패');
}
