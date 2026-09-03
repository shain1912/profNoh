// 부하 테스트 중 서버 프로세스 CPU/메모리 샘플러.
//   node tests/load/monitor.mjs --port 8793 [--interval 1000] [--out tests/load/out/monitor.csv]
// 포트를 LISTEN 중인 PID 를 찾아(netstat/lsof) 1초마다 CPU%·RSS 를 기록하고, SIGINT/stdin 종료 시 요약을 출력한다.
// CPU% 는 단일 코어 기준(100% = 코어 1개 포화). Node 는 단일 이벤트 루프라 이 값이 포화 지표다.
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : [])).filter((x) => x.length));
const port = Number(args.port || 8793);
const interval = Number(args.interval || 1000);
const out = args.out || `tests/load/out/monitor-${port}.csv`;
const win = process.platform === 'win32';

function findPid() {
  if (win) {
    const t = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
    const line = t.split(/\r?\n/).find((l) => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l));
    return line ? Number(line.trim().split(/\s+/).pop()) : null;
  }
  try { return Number(execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim().split('\n')[0]); } catch { return null; }
}

// 반환: { cpuSec: 프로세스 누적 CPU 초, rssMB }
function sample(pid) {
  if (win) {
    const o = execSync(`powershell -NoProfile -Command "$p=Get-Process -Id ${pid}; Write-Output ($p.TotalProcessorTime.TotalSeconds.ToString([Globalization.CultureInfo]::InvariantCulture) + ',' + $p.WorkingSet64)"`, { encoding: 'utf8' }).trim();
    const [cpu, ws] = o.split(',');
    return { cpuSec: Number(cpu), rssMB: Number(ws) / 1048576 };
  }
  const o = execSync(`ps -o cputimes=,rss= -p ${pid}`, { encoding: 'utf8' }).trim().split(/\s+/);
  return { cpuSec: Number(o[0]), rssMB: Number(o[1]) / 1024 };
}

const pid = findPid();
if (!pid) { console.error(`포트 ${port} 를 LISTEN 중인 프로세스를 못 찾음`); process.exit(1); }
console.log(`[monitor] pid=${pid} port=${port} interval=${interval}ms cores=${os.cpus().length} → ${out}`);

const rows = [['t_ms', 'cpu_pct', 'rss_mb']];
let prev = sample(pid), prevT = Date.now();
const t0 = prevT;
const timer = setInterval(() => {
  let cur;
  try { cur = sample(pid); } catch { finish(); return; }
  const now = Date.now();
  const cpuPct = ((cur.cpuSec - prev.cpuSec) / ((now - prevT) / 1000)) * 100;
  rows.push([now - t0, cpuPct.toFixed(1), cur.rssMB.toFixed(1)]);
  prev = cur; prevT = now;
}, interval);

function finish() {
  clearInterval(timer);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rows.map((r) => r.join(',')).join('\n') + '\n');
  const cpu = rows.slice(1).map((r) => Number(r[1]));
  const rss = rows.slice(1).map((r) => Number(r[2]));
  const p = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const summary = {
    samples: cpu.length,
    cpu_avg_pct: +(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)).toFixed(1),
    cpu_p95_pct: p(cpu, 0.95), cpu_max_pct: Math.max(...cpu),
    rss_start_mb: rss[0], rss_max_mb: Math.max(...rss), rss_end_mb: rss[rss.length - 1],
  };
  console.log('[monitor] summary', JSON.stringify(summary));
  process.exit(0);
}
process.on('SIGINT', finish);
process.on('SIGTERM', finish);
// --duration <sec> 가 있으면 그 시간 뒤 자동 종료 (Windows 에서는 bash kill 로 SIGINT 전달이 안 되므로 이 옵션을 쓴다)
if (args.duration) setTimeout(finish, Number(args.duration) * 1000);
else { process.stdin.on('end', finish); process.stdin.resume(); }
