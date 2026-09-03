// ── 소켓 이벤트 토큰 버킷 (R3 §2.6 결핍 17: 참가자 1명이 방 전체를 DoS 하지 못하게) ──
//
// 소켓 1개 × 이벤트 종류별 버킷. burst 만큼 즉시 허용, 이후 초당 rate 개씩 충전.
// 한도를 넘긴 이벤트는 조용히 버린다(errmsg 는 이벤트당 1회만 — 스팸 클라이언트에 회신 폭주 방지).

export interface BucketRule {
  /** 초당 충전량 */
  rate: number;
  /** 최대 토큰(순간 허용량) */
  burst: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
  warned: boolean;
}

/** 이벤트별 기본 한도 — 사람 손으로는 못 넘고 스크립트만 걸리는 수준 */
export const SOCKET_EVENT_RULES: Record<string, BucketRule> = {
  'student:pollVote': { rate: 1, burst: 4 },        // 다시 투표 몇 번은 허용, 초당 1개로 수렴
  'student:quizAnswer': { rate: 1, burst: 3 },
  'student:askQuestion': { rate: 1 / 5, burst: 2 }, // 5초에 1개 (연속 2개까지)
  'student:upvoteQuestion': { rate: 2, burst: 6 },
  'student:surveySubmit': { rate: 0.5, burst: 2 },
  'student:roleplayClear': { rate: 1, burst: 3 },
  'student:join': { rate: 0.5, burst: 3 },
  'instructor:join': { rate: 0.5, burst: 3 },
  'viewer:join': { rate: 0.5, burst: 3 },
};
/** 이벤트 종류와 무관한 소켓 전체 상한 (강사 조작 포함) */
export const SOCKET_GLOBAL_RULE: BucketRule = { rate: 10, burst: 30 };

export class TokenBucketSet {
  private buckets = new Map<string, Bucket>();

  /** 허용되면 true. 거부 시 false — 같은 키에서 첫 거부에만 warn=true 를 함께 준다 */
  take(key: string, rule: BucketRule, now = Date.now()): { ok: boolean; warn: boolean } {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: rule.burst, updatedAt: now, warned: false };
      this.buckets.set(key, b);
    }
    const elapsed = Math.max(0, now - b.updatedAt) / 1000;
    b.tokens = Math.min(rule.burst, b.tokens + elapsed * rule.rate);
    b.updatedAt = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      b.warned = false;
      return { ok: true, warn: false };
    }
    const warn = !b.warned;
    b.warned = true;
    return { ok: false, warn };
  }
}

// ── 브로드캐스트 배치(스로틀) ──
//
// 같은 key 로 짧은 시간에 여러 번 요청되면 창(delayMs)이 끝날 때 마지막 계산 결과 1건만 보낸다.
// (트레일링 스로틀: 첫 요청 후 delay 안에 들어온 요청은 전부 합쳐져 delay 시점에 1회 전송)
// 400명이 30초에 투표하면 표마다 전원 브로드캐스트(O(n²)) 대신 초당 2~3회로 수렴한다.
export class Batcher {
  private timers = new Map<string, { t: NodeJS.Timeout; fn: () => void }>();

  /** 예약. 이미 예약된 key 면 실행 함수만 최신으로 교체 */
  schedule(key: string, delayMs: number, fn: () => void) {
    const cur = this.timers.get(key);
    if (cur) {
      cur.fn = fn;
      return;
    }
    const entry = {
      fn,
      t: setTimeout(() => {
        this.timers.delete(key);
        entry.fn();
      }, delayMs),
    };
    this.timers.set(key, entry);
  }

  /** 예약을 취소하고 지금 실행 (활동 열기/마감/공개처럼 즉시 반영해야 하는 전이) */
  flush(key: string, fn: () => void) {
    this.cancel(key);
    fn();
  }

  cancel(key: string) {
    const cur = this.timers.get(key);
    if (!cur) return;
    clearTimeout(cur.t);
    this.timers.delete(key);
  }

  /** 접두사로 시작하는 예약 전부 취소 (강의실 단위 정리) */
  cancelPrefix(prefix: string) {
    for (const k of [...this.timers.keys()]) if (k.startsWith(prefix)) this.cancel(k);
  }

  pending(key: string): boolean {
    return this.timers.has(key);
  }
}
