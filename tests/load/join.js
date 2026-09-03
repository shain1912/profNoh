// 시나리오 (a): WINDOW 초 안에 N 명이 socket 으로 강의실 입장 (student:join → joined)
//   k6 run -e N=200 -e WINDOW=30 -e HOLD=20 -e BASE=http://localhost:8793 tests/load/join.js
// 측정: join_latency = 소켓 open → 'joined' 수신 (ms). ws_connecting = TCP/WS 핸드셰이크.
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { connect, emit } from './lib/socketio.js';

const N = Number(__ENV.N || 200);
const WINDOW = Number(__ENV.WINDOW || 30);   // 입장이 퍼지는 구간(초)
const HOLD = Number(__ENV.HOLD || 20);       // 입장 후 연결 유지(초) — 동접 상태에서의 브로드캐스트 부하 포함
const BASE = __ENV.BASE || 'http://localhost:8793';

export const joinLatency = new Trend('join_latency', true);
export const joinFail = new Rate('join_fail');
export const participantsFrames = new Counter('participants_frames'); // 입장 브로드캐스트 수신 프레임 수(전체)

export const options = {
  scenarios: {
    join: { executor: 'per-vu-iterations', vus: N, iterations: 1, maxDuration: `${WINDOW + HOLD + 30}s`, gracefulStop: '10s' },
  },
  thresholds: {
    join_latency: ['p(95)<2000'],
    join_fail: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const r = http.post(`${BASE}/api/classrooms`, JSON.stringify({ deckId: 'ai-ax-4h', title: `k6 join ${N}`, mode: 'auditorium' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(r, { 'classroom created': (res) => res.status === 200 });
  const body = r.json();
  return { token: body.token, instructorSecret: body.instructorSecret, startAt: Date.now() };
}

export default function (data) {
  // 0~WINDOW 초 사이 균등 분산 입장 (QR 스캔이 30초에 걸쳐 들어오는 상황)
  sleep(Math.random() * WINDOW);
  let joined = false;
  let sentAt = 0;
  connect(BASE, {
    maxMs: (HOLD + 30) * 1000,
    onConnected(socket) {
      sentAt = Date.now();
      emit(socket, 'student:join', { token: data.token, nickname: `k6-${__VU}`, sessionId: `k6s-${__VU}-${Date.now()}` });
    },
    onEvent(socket, event, payload) {
      if (event === 'joined' && !joined) {
        joined = true;
        joinLatency.add(Date.now() - sentAt);
        socket.setTimeout(() => socket.close(), HOLD * 1000);
      } else if (event === 'participants') {
        participantsFrames.add(1);
      } else if (event === 'errmsg') {
        console.error(`VU ${__VU} errmsg: ${JSON.stringify(payload)}`);
        socket.close();
      }
    },
    onError(e) { console.error(`VU ${__VU} ws error: ${e && e.error ? e.error() : e}`); },
  });
  joinFail.add(joined ? 0 : 1);
}
