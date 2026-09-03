// 시나리오 (b): N 명이 입장한 뒤 VOTE_WINDOW(10s) 안에 전원이 student:pollVote 제출
//   k6 run -e N=200 -e JOIN_WINDOW=30 -e VOTE_WINDOW=10 -e BASE=http://localhost:8793 tests/load/vote.js
// 흐름: setup 이 강의실 생성 + 강사 소켓으로 투표(poll-warmup, 워드클라우드) 활동을 연다
//       → VU 는 0~JOIN_WINDOW 초에 걸쳐 입장 → 공통 시각 T0(=JOIN_WINDOW+5s) 이후 0~VOTE_WINDOW 초 랜덤 시점에 제출
// 측정:
//   vote_ack_latency : 제출(emit) → 그 이후 첫 poll:update 수신 (ms). 서버 처리+브로드캐스트 왕복의 근사값
//                      (다른 참가자 표의 브로드캐스트가 먼저 도착할 수 있어 약간 낙관적)
//   poll_settle_ms   : T0 → 이 VU 가 poll:update.total == N 을 처음 본 시각. "마지막 표까지 반영 완료" 지연
//   poll_update_frames: 수신한 poll:update 프레임 총수 (O(n²) 브로드캐스트 비용 확인용)
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { connect, emit } from './lib/socketio.js';

const N = Number(__ENV.N || 200);
const JOIN_WINDOW = Number(__ENV.JOIN_WINDOW || 30);
const VOTE_WINDOW = Number(__ENV.VOTE_WINDOW || 10);
const SETTLE_WAIT = Number(__ENV.SETTLE_WAIT || 15);   // 제출 후 전원 반영을 기다리는 최대 시간(초)
const BASE = __ENV.BASE || 'http://localhost:8793';
const ACTIVITY = __ENV.ACTIVITY || 'poll-warmup';     // 내장 덱 ai-ax-4h 의 워드클라우드 투표
const WORDS = ['효율', '자동화', '두려움', '기회', '창의', '변화', '협업', '학습', '미래', '도구'];

export const joinLatency = new Trend('join_latency', true);
export const voteAck = new Trend('vote_ack_latency', true);
export const settle = new Trend('poll_settle_ms', true);
export const voteFail = new Rate('vote_fail');
export const pollFrames = new Counter('poll_update_frames');

export const options = {
  scenarios: {
    vote: { executor: 'per-vu-iterations', vus: N, iterations: 1, maxDuration: `${JOIN_WINDOW + 5 + VOTE_WINDOW + SETTLE_WAIT + 30}s`, gracefulStop: '10s' },
  },
  thresholds: {
    vote_ack_latency: ['p(95)<2000'],   // 로드맵 Phase 2 목표: 제출 p95 < 2s
    vote_fail: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const r = http.post(`${BASE}/api/classrooms`, JSON.stringify({ deckId: 'ai-ax-4h', title: `k6 vote ${N}`, mode: 'auditorium' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(r, { 'classroom created': (res) => res.status === 200 });
  const body = r.json();
  // 강사 소켓으로 투표 활동 열기 (activity:opened 확인 후 종료)
  let opened = false;
  connect(BASE, {
    maxMs: 10000,
    onConnected(socket) {
      emit(socket, 'instructor:join', { token: body.token, instructorSecret: body.instructorSecret });
      emit(socket, 'instructor:openActivity', { activityId: ACTIVITY });
    },
    onEvent(socket, event, payload) {
      if (event === 'activity:opened' && payload && payload.activityId === ACTIVITY) { opened = true; socket.close(); }
      if (event === 'errmsg') { console.error(`instructor errmsg: ${JSON.stringify(payload)}`); socket.close(); }
    },
  });
  if (!opened) throw new Error('투표 활동을 열지 못했습니다');
  return { token: body.token, startAt: Date.now() };
}

export default function (data) {
  sleep(Math.random() * JOIN_WINDOW);
  const t0 = data.startAt + (JOIN_WINDOW + 5) * 1000;          // 전원 공통 제출 시작 시각
  const myVoteAt = t0 + Math.random() * VOTE_WINDOW * 1000;    // 이 VU 의 제출 시각
  let joinSentAt = 0, voteSentAt = 0, acked = false, settled = false, voted = false;

  connect(BASE, {
    maxMs: (JOIN_WINDOW + 5 + VOTE_WINDOW + SETTLE_WAIT + 20) * 1000,
    onConnected(socket) {
      joinSentAt = Date.now();
      emit(socket, 'student:join', { token: data.token, nickname: `k6-${__VU}`, sessionId: `k6s-${__VU}-${Date.now()}` });
    },
    onEvent(socket, event, payload) {
      if (event === 'joined') {
        joinLatency.add(Date.now() - joinSentAt);
        // 공통 시각까지 대기 후 제출 (setTimeout 은 이벤트 루프 안에서 동작)
        socket.setTimeout(() => {
          voteSentAt = Date.now();
          voted = true;
          emit(socket, 'student:pollVote', { activityId: ACTIVITY, value: WORDS[__VU % WORDS.length] });
          // 제출 후 SETTLE_WAIT 안에 전원 반영이 안 되면 종료
          socket.setTimeout(() => socket.close(), SETTLE_WAIT * 1000);
        }, Math.max(0, myVoteAt - Date.now()));
      } else if (event === 'poll:update' && payload && payload.activityId === ACTIVITY) {
        pollFrames.add(1);
        const total = payload.distribution ? payload.distribution.total : undefined;
        if (voted && !acked) { acked = true; voteAck.add(Date.now() - voteSentAt); }
        if (!settled && total !== undefined && total >= N) {
          settled = true;
          settle.add(Date.now() - t0);
          if (acked) socket.close();
        }
      } else if (event === 'errmsg') {
        console.error(`VU ${__VU} errmsg: ${JSON.stringify(payload)}`);
        socket.close();
      }
    },
    onError(e) { console.error(`VU ${__VU} ws error: ${e && e.error ? e.error() : e}`); },
  });
  voteFail.add(acked ? 0 : 1);
}
