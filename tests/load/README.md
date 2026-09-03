# 부하 테스트 (k6)

로드맵 Phase 2 #5 — "30초 N명 입장 + 10초 N명 제출, 제출 p95 < 2s" 를 재현하는 k6 스크립트.
socket.io 프로토콜(Engine.IO v4, websocket)을 `lib/socketio.js` 가 직접 말하므로 npm 패키지 없이 k6 단독으로 돈다.

## 준비

- k6 (https://k6.io) — Windows 는 `choco install k6` 또는 GitHub 릴리스 zip(`k6-vX-windows-amd64.zip`) 을 풀어 `k6.exe` 를 PATH 에 두면 관리자 권한 없이 실행 가능.
- 서버 실행 중 (`PORT=8797 npm -w server run start` 등). 내장 덱 `ai-ax-4h` 의 `poll-warmup` 투표 활동을 쓴다.
- 강의실 생성 `POST /api/classrooms` 는 로그인이 필요 없다. rate limit(강의실 20/분)이 있는 브랜치에서는 연속 실행 시 1분 간격.

## 시나리오

| 파일 | 내용 | 핵심 지표 |
|---|---|---|
| `join.js` | `WINDOW`(30s) 안에 `N` 명이 균등 분산 입장 후 `HOLD`(20s) 동안 연결 유지 | `join_latency` (student:join → joined), `participants_frames` (입장 브로드캐스트 수신 총수) |
| `vote.js` | setup 이 강사 소켓으로 투표 활동을 열고 → `N` 명 입장 → 공통 시각 T0 부터 `VOTE_WINDOW`(10s) 안에 전원 `student:pollVote` | `vote_ack_latency` (emit → 첫 poll:update), `poll_settle_ms` (T0 → total==N 관측), `poll_update_frames` |

```bash
k6 run -e N=200 -e BASE=http://localhost:8797 tests/load/join.js
k6 run -e N=200 -e BASE=http://localhost:8797 tests/load/vote.js
# 옵션: WINDOW / HOLD (join), JOIN_WINDOW / VOTE_WINDOW / SETTLE_WAIT / ACTIVITY (vote)
# 결과 JSON: --summary-export tests/load/out/<name>.json
```

임계값(thresholds): `join_latency p(95)<2000`, `vote_ack_latency p(95)<2000`, 실패율 <1%. 넘으면 k6 종료 코드가 0 이 아니다(CI 게이트로 사용).

## 서버 CPU/메모리 샘플링

```bash
node tests/load/monitor.mjs --port 8797 --duration 80 --out tests/load/out/vote-monitor.csv &
k6 run ... tests/load/vote.js
```

포트를 LISTEN 중인 PID 를 찾아 1초마다 CPU%(단일 코어 기준, 100 = 이벤트 루프 포화)·RSS 를 CSV 로 남기고 종료 시 요약(avg/p95/max, RSS start/max/end)을 출력한다. Windows 는 PowerShell `Get-Process`, Linux/macOS 는 `ps` 를 쓴다.

## 해석 시 주의

- `vote_ack_latency` 는 "내 표 이후 처음 도착한 poll:update" 라 다른 참가자 표의 브로드캐스트가 먼저 오면 조금 낙관적이다. 마지막 표까지 전원 반영된 시점은 `poll_settle_ms` 로 본다 (VOTE_WINDOW 와 같으면 지연 0).
- 참가자 배치 전송(Phase 2 #1, 500ms 트레일링 스로틀)이 적용된 브랜치에서는 ack 가 배치 창만큼(≤500ms) 늘어나는 것이 정상이며, 대신 `poll_update_frames` 가 N² 에서 크게 줄어야 한다.
- k6 와 서버가 같은 PC 에서 돌면 k6 자체 CPU 가 서버 수치에 섞이지 않도록 monitor 는 서버 PID 만 본다.

실측 결과: `docs/research/2026-09-03-load-test.md`.
