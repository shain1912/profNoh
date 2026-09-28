import { env, hasDeepSeek, hasMiniMax, hasTextAI } from '../env';

// ──────────────────────────────────────────────────────────────
//  텍스트 AI 호출 — DeepSeek(1순위) → MiniMax(폴백).
//  파일 이름은 기존 import 호환 때문에 minimax.ts 로 둔다.
//  키마다 상태를 기억해 잔액 부족·인증 실패 키는 30분, 레이트리밋·5xx 키는 20초 쉬게 한다
//  (잔액이 바닥난 키를 라운드로빈으로 계속 두드리면 학생 요청 절반이 느려지거나 실패한다).
// ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOpts {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** 호출자 취소 (학생이 연결을 끊으면 AI 요청도 즉시 중단) */
  signal?: AbortSignal;
  /** 이 제공자는 건너뜀 (스트림에서 이미 실패한 제공자로 다시 시도하지 않게) */
  skip?: ProviderName[];
}

// 예산 추적용 근사 비용(USD)
const MINIMAX_COST_PER_CALL = 0.002;
// deepseek-flash 피크 시간 단가(2026-09) — 오프피크는 절반이라 예산 추적은 보수적으로 잡힌다
const DEEPSEEK_IN_PER_TOKEN = 0.3 / 1_000_000;
const DEEPSEEK_OUT_PER_TOKEN = 1.2 / 1_000_000;

function deepseekBody(messages: ChatMessage[], opts: ChatOpts, stream: boolean) {
  return JSON.stringify({
    model: env.DEEPSEEK_MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
    ...(env.DEEPSEEK_THINKING === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });
}

const DEAD_MS = 30 * 60_000;
// 한 요청에서 제공자당 시도할 키 수 — 키가 80개여도 한 학생 요청이 80번 재시도하지 않게
const MAX_TRIES_PER_PROVIDER = 4;
const COOL_MS = 20_000;

type ProviderName = 'deepseek' | 'minimax';

class KeyError extends Error {
  constructor(message: string, readonly kind: 'dead' | 'cool' | 'other') {
    super(message);
  }
}

const resting = new Map<string, number>(); // key → 다시 써도 되는 시각
const rrIndex: Record<ProviderName, number> = { deepseek: 0, minimax: 0 };

function usableKeys(p: ProviderName): string[] {
  const keys = p === 'deepseek' ? env.DEEPSEEK_API_KEYS : env.MINIMAX_API_KEYS;
  const now = Date.now();
  const alive = keys.filter((k) => (resting.get(k) ?? 0) <= now);
  // 전부 쉬는 중이면 그래도 시도는 해 본다 (일시 오류였을 수 있음)
  const pool = alive.length ? alive : keys;
  if (pool.length <= 1) return pool;
  const start = rrIndex[p]++ % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

function rest(key: string, e: unknown) {
  if (e instanceof KeyError && e.kind !== 'other') {
    resting.set(key, Date.now() + (e.kind === 'dead' ? DEAD_MS : COOL_MS));
  }
}

function classifyHttp(provider: string, status: number, body: string): KeyError {
  const msg = `${provider} ${status}: ${body.slice(0, 200)}`;
  if (status === 401 || status === 402 || status === 403) return new KeyError(msg, 'dead');
  if (status === 429 || status >= 500) return new KeyError(msg, 'cool');
  return new KeyError(msg, 'other');
}

function providers(): ProviderName[] {
  const list: ProviderName[] = [];
  if (hasDeepSeek) list.push('deepseek');
  if (hasMiniMax) list.push('minimax');
  return list;
}

function withTimeout(ms: number | undefined, signal?: AbortSignal) {
  const t = AbortSignal.timeout(ms ?? 60_000);
  return signal ? AbortSignal.any([t, signal]) : t;
}

// ── DeepSeek (OpenAI 호환) ──
async function deepseekOnce(key: string, messages: ChatMessage[], opts: ChatOpts) {
  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: deepseekBody(messages, opts, false),
    signal: withTimeout(opts.timeoutMs, opts.signal),
  });
  if (!res.ok) throw classifyHttp('DeepSeek', res.status, await res.text().catch(() => ''));
  const data: any = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '(빈 응답)';
  return { text, cost: deepseekCost(data?.usage) };
}

function deepseekCost(usage: any): number {
  const pin = Number(usage?.prompt_tokens ?? 0);
  const pout = Number(usage?.completion_tokens ?? 0);
  if (!pin && !pout) return 0.002;
  return pin * DEEPSEEK_IN_PER_TOKEN + pout * DEEPSEEK_OUT_PER_TOKEN;
}

// ── MiniMax ──
async function minimaxOnce(key: string, messages: ChatMessage[], opts: ChatOpts) {
  const res = await fetch(`${env.MINIMAX_BASE_URL}/text/chatcompletion_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.MINIMAX_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
    }),
    signal: withTimeout(opts.timeoutMs, opts.signal),
  });
  if (!res.ok) throw classifyHttp('MiniMax', res.status, await res.text().catch(() => ''));
  const data: any = await res.json();
  const code = data?.base_resp?.status_code;
  if (code && code !== 0) {
    const m = `MiniMax base_resp ${code}: ${data.base_resp.status_msg ?? ''}`;
    // 1008 잔액 부족 · 1004 인증 실패 → 이 키는 한동안 쓰지 않는다 / 1002 레이트리밋
    throw new KeyError(m, code === 1008 || code === 1004 ? 'dead' : code === 1002 ? 'cool' : 'other');
  }
  const text: string =
    data?.choices?.[0]?.message?.content ?? data?.reply ?? data?.choices?.[0]?.text ?? '(빈 응답)';
  return { text: typeof text === 'string' ? text : JSON.stringify(text), cost: MINIMAX_COST_PER_CALL };
}

function demoReply(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return {
    text:
      `🤖 (데모 모드) AI 키가 설정되지 않아 예시 답변을 보여줘요.\n` +
      `요청: "${lastUser?.content ?? ''}"\n` +
      `.env 의 DEEPSEEK_API_KEY 또는 MINIMAX_API_KEY(…1..N) 를 넣으면 진짜 AI가 답합니다.`,
    cost: 0,
  };
}

export async function chatComplete(messages: ChatMessage[], opts: ChatOpts = {}): Promise<{ text: string; cost: number }> {
  if (!hasTextAI) return demoReply(messages);
  let lastErr: unknown;
  for (const p of providers().filter((x) => !opts.skip?.includes(x))) {
    if (opts.signal?.aborted) break;
    for (const key of usableKeys(p).slice(0, MAX_TRIES_PER_PROVIDER)) {
      try {
        return p === 'deepseek' ? await deepseekOnce(key, messages, opts) : await minimaxOnce(key, messages, opts);
      } catch (e) {
        rest(key, e);
        lastErr = e;
        if (!(e instanceof KeyError) || e.kind === 'other') break; // 요청 자체 문제(400·타임아웃 등)는 다른 키로도 같다
      }
    }
  }
  throw lastErr ?? new Error('텍스트 AI 호출 실패');
}

/**
 * 스트리밍 호출 — DeepSeek 이면 토큰이 오는 대로 onDelta, 아니면(또는 첫 토큰 전 실패 시)
 * 일반 호출 결과를 한 번에 onDelta 로 넘긴다. 첫 토큰 이후 끊기면 예외.
 */
export async function chatStream(
  messages: ChatMessage[],
  opts: ChatOpts,
  onDelta: (text: string) => void,
): Promise<{ text: string; cost: number }> {
  if (hasDeepSeek) {
    for (const key of usableKeys('deepseek').slice(0, MAX_TRIES_PER_PROVIDER)) {
      let started = false;
      try {
        const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: deepseekBody(messages, opts, true),
          signal: withTimeout(opts.timeoutMs ?? 180_000, opts.signal),
        });
        if (!res.ok || !res.body) throw classifyHttp('DeepSeek', res.status, await res.text().catch(() => ''));
        const decoder = new TextDecoder();
        let buf = '';
        let text = '';
        let usage: any = null;
        for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
          buf += decoder.decode(chunk, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              if (j.usage) usage = j.usage;
              const d: string | undefined = j.choices?.[0]?.delta?.content;
              if (d) {
                started = true;
                text += d;
                onDelta(d);
              }
            } catch {
              /* keep-alive 등 무시 */
            }
          }
        }
        if (!text) throw new KeyError('DeepSeek 빈 스트림', 'cool');
        return { text, cost: deepseekCost(usage) };
      } catch (e) {
        if (started || opts.signal?.aborted) throw e;
        rest(key, e);
        if (!(e instanceof KeyError) || e.kind === 'other') break;
      }
    }
  }
  // 스트림으로 DeepSeek 키를 이미 시도했으면 폴백에서는 DeepSeek 을 다시 두드리지 않는다
  const r = await chatComplete(messages, hasDeepSeek ? { ...opts, skip: [...(opts.skip ?? []), 'deepseek'] } : opts);
  onDelta(r.text);
  return r;
}
