import { env, hasMiniMax } from '../env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// MiniMax 비용(대략치, USD) — 예산 추적용 근사값
const CHAT_COST_PER_CALL = 0.002;

// 키 로테이션 (라운드로빈) — 교실에서 같은 IP 다수 접속 시 레이트리밋 분산
let rr = 0;
function rotatedKeys(): string[] {
  const keys = env.MINIMAX_API_KEYS;
  if (keys.length <= 1) return keys;
  const start = rr++ % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

async function callOnce(key: string, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number }) {
  const url = `${env.MINIMAX_BASE_URL}/text/chatcompletion_v2`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.MINIMAX_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MiniMax ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (data?.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
    throw new Error(`MiniMax base_resp ${data.base_resp.status_code}: ${data.base_resp.status_msg ?? ''}`);
  }
  const text: string =
    data?.choices?.[0]?.message?.content ??
    data?.reply ??
    data?.choices?.[0]?.text ??
    '(빈 응답)';
  return typeof text === 'string' ? text : JSON.stringify(text);
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<{ text: string; cost: number }> {
  if (!hasMiniMax) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return {
      text:
        `🤖 (데모 모드) MiniMax 키가 설정되지 않아 예시 답변을 보여줘요.\n` +
        `요청: "${lastUser?.content ?? ''}"\n` +
        `.env 의 MINIMAX_API_KEY(또는 MINIMAX_API_KEY1..N) 를 넣으면 진짜 AI가 답합니다.`,
      cost: 0,
    };
  }

  // 키를 돌려가며 시도, 실패하면 다음 키로 폴백
  const keys = rotatedKeys();
  let lastErr: unknown;
  for (const key of keys) {
    try {
      const text = await callOnce(key, messages, opts);
      return { text, cost: CHAT_COST_PER_CALL };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('MiniMax 호출 실패');
}
