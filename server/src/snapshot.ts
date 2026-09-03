// ── ClassroomState 스냅샷 영속화 (Phase 2 #3, R3 리스크 2) ──
//
// 라이브 상태는 프로세스 메모리(state.ts Map)에 있고 DB 는 사후 기록만이라, 배포·OOM·크래시 1회면
// 400명 토큰이 무효가 됐다. 여기서는 강의실 전체 상태를 axedu_classroom_snapshots(jsonb) 에
//   - 변경 후 debounce(기본 2초, 연속 변경 중에도 최대 5초마다 1회)
//   - 주기 sweep(기본 30초, 미저장분만)
//   - SIGTERM/SIGINT(배포 재시작) 직전 전량
// 으로 upsert 하고, 부팅 시 TTL(기본 12시간) 안의 스냅샷을 메모리로 복원한다.
// 저장은 전부 best-effort — DB 가 없거나 실패해도 라이브 진행은 막지 않는다.
import { dbSafe, supabase } from './db';
import { env } from './env';
import { ClassroomState, allClassrooms, registerRestored, type PersistedClassroom } from './state';

const DEBOUNCE_MS = Math.max(200, env.SNAPSHOT_DEBOUNCE_MS);
const MAX_WAIT_MS = Math.max(DEBOUNCE_MS, env.SNAPSHOT_MAX_WAIT_MS);
const INTERVAL_MS = Math.max(1000, env.SNAPSHOT_INTERVAL_MS);
const TTL_MS = Math.max(1, env.SNAPSHOT_TTL_HOURS) * 60 * 60 * 1000;

const enabled = () => !env.SNAPSHOT_DISABLED && !!supabase;

interface Pending { timer: NodeJS.Timeout; firstAt: number }
const pending = new Map<string, Pending>();
const inflight = new Map<string, Promise<void>>();
const dirtyWhileInflight = new Set<string>();

/** 상태가 바뀌었다 — 저장 예약. 짧은 시간의 연속 변경(400명 투표)은 한 번의 upsert 로 합쳐진다 */
export function markDirty(c: ClassroomState | undefined | null) {
  if (!c) return;
  c.version += 1;
  schedule(c);
}

function schedule(c: ClassroomState) {
  if (!enabled()) return;
  const now = Date.now();
  const cur = pending.get(c.id);
  if (cur) {
    clearTimeout(cur.timer);
    // 트레일링 debounce 이되, 첫 변경으로부터 MAX_WAIT 를 넘기지는 않는다
    const due = Math.min(now + DEBOUNCE_MS, cur.firstAt + MAX_WAIT_MS);
    cur.timer = setTimeout(() => void flush(c), Math.max(0, due - now));
    return;
  }
  pending.set(c.id, { firstAt: now, timer: setTimeout(() => void flush(c), DEBOUNCE_MS) });
}

/** 지금 저장 (예약 취소). 이미 저장 중이면 끝난 뒤 한 번 더 */
export function flush(c: ClassroomState): Promise<void> {
  const cur = pending.get(c.id);
  if (cur) {
    clearTimeout(cur.timer);
    pending.delete(c.id);
  }
  if (!enabled()) return Promise.resolve();
  const running = inflight.get(c.id);
  if (running) {
    dirtyWhileInflight.add(c.id);
    return running;
  }
  const p = save(c).finally(() => {
    inflight.delete(c.id);
    // 저장 중 새 변경이 있었으면 한 번 더. 저장 자체가 실패한 경우(DB 다운)는 2초 재시도 폭주 대신 30초 sweep 이 다시 시도한다
    if (dirtyWhileInflight.delete(c.id)) schedule(c);
  });
  inflight.set(c.id, p);
  return p;
}

async function save(c: ClassroomState) {
  const version = c.version;
  const ok = await dbSafe((sb) =>
    sb.from('axedu_classroom_snapshots')
      .upsert(
        {
          classroom_id: c.id,
          token: c.token,
          owner_id: c.ownerId ?? null,
          status: c.status,
          version,
          state: c.exportState(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'classroom_id' },
      )
      .then((r) => { if (r.error) throw r.error; return true; }),
  );
  if (ok) c.savedVersion = Math.max(c.savedVersion, version);
}

/** 미저장 강의실 전부 저장 — 주기 sweep 과 종료 훅이 공유 */
export async function flushAll(): Promise<number> {
  if (!enabled()) return 0;
  const targets = allClassrooms().filter((c) => c.version !== c.savedVersion || pending.has(c.id));
  await Promise.all(targets.map((c) => flush(c)));
  return targets.length;
}

let sweeper: NodeJS.Timeout | null = null;
/** 주기 저장 시작 (index.ts 부팅 시 1회) */
export function startSnapshotLoop() {
  if (!enabled() || sweeper) return;
  sweeper = setInterval(() => void flushAll(), INTERVAL_MS);
  sweeper.unref();
}

/**
 * 부팅 복원 — TTL 안이고 종료되지 않은 스냅샷을 메모리에 올린다.
 * 열린 활동의 타이머(투표 자동 마감·퀴즈 자동 공개)는 socket.ts 의 rearmRestoredTimers 가 다시 건다.
 */
export async function restoreSnapshots(): Promise<{ restored: number; skipped: number }> {
  const out = { restored: 0, skipped: 0 };
  if (!enabled()) return out;
  const since = new Date(Date.now() - TTL_MS).toISOString();
  const rows = await dbSafe((sb) =>
    sb.from('axedu_classroom_snapshots')
      .select('classroom_id, state, updated_at, status')
      .gte('updated_at', since)
      .neq('status', 'ended')
      .order('updated_at', { ascending: false })
      .limit(500)
      .then((r) => { if (r.error) throw r.error; return r.data as Array<{ classroom_id: string; state: PersistedClassroom; status: string }>; }),
  );
  for (const row of rows ?? []) {
    const c = ClassroomState.restore(row.state);
    if (!c || c.status === 'ended' || !registerRestored(c)) {
      out.skipped += 1;
      continue;
    }
    c.savedVersion = c.version; // 방금 읽은 그대로 — 변경 전까지는 다시 쓰지 않는다
    out.restored += 1;
  }
  return out;
}

/** 배포 재시작(SIGTERM)·Ctrl-C 직전 전량 저장 — 최대 timeoutMs 만 기다린다 */
export function installShutdownFlush(timeoutMs = 4000) {
  let done = false;
  const handler = (signal: NodeJS.Signals) => {
    if (done) return;
    done = true;
    const timer = setTimeout(() => process.exit(0), timeoutMs);
    flushAll()
      .then((n) => console.log(`[snapshot] ${signal} — 강의실 ${n}개 저장 후 종료`))
      .catch(() => {})
      .finally(() => { clearTimeout(timer); process.exit(0); });
  };
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}
