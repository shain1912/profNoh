# Phase 2 코어 — 브로드캐스트 재설계 + rate limit

- 근거: `docs/research/2026-09-03-current-capabilities.md` §2.2·2.4·2.6, `docs/research/2026-09-03-feature-roadmap.md` Phase 2 #1·#2
- 검증: `node verify-scale.mjs http://localhost:8791` (+ 기존 verify-anon / auditorium / auditorium-activities / timer 회귀)
- 단위: `node --import tsx --test server/test/ratelimit.test.mjs`

## 1. 역할별 room (`server/src/socket.ts`)

| room | 누가 | 받는 것 |
|---|---|---|
| `c.id` | 전원 | 상태 전이 — `state` `slide:changed` `activity:*` `quiz:question` `notice` `question:*`(승인분) `survey:update` |
| `c.id:staff` | 강사 + 프로젝터(`viewer:join`) | 상세 — `leaderboard`(상위 100), `quiz:answered`, `poll:update` 의 `entries`(전원의 답), `quiz:reveal.leaderboard` |
| `c.id:instructor` | 강사만 | 결과 미공개 투표의 실제 분포, 미승인 질문 |
| `c.id:participants` | 참가자 | 집계만 — `poll:update {counts,total}`(entries 없음), `participants {count}`(강당 대기 화면용), 자기 ACK(`joined` 점수, `quiz:reveal.me {score,rank}` + `leaderboard: []`) |

- 참가자는 `leaderboard` 이벤트를 아예 받지 않는다. 학생 헤더 점수는 `joined.score`(응답 시 자기 ACK) 로 갱신된다.
- 워드클라우드 투표에서 참가자는 entries 가 없으므로 `PollView` 가 롤링페이퍼 대신 워드클라우드(counts)만 그린다. 프로젝터·강사는 기존과 동일.
- 늦게 입장한 소켓 동기화(`sendCurrentActivityTo`)도 같은 필터를 적용한다.
- **Q&A 이벤트(`question:new/update/remove`)는 참가자에게도 그대로 간다.** 연구 문서(§2.2)는 "참가자 화면에 쓰이지 않음"을 전제로 했지만 Q&A 2.0 이후 참가자 패널이 목록·👍 를 쓴다(`Student.tsx` QaPanel, `verify-auditorium-activities.mjs` §6 이 참가자 수신을 검사). 대신 `student:askQuestion` 을 소켓 토큰 버킷(5초 1개)으로 묶어 폭주를 막는다.

## 2. 집계 배치 (`server/src/ratelimit.ts` `Batcher`)

- 표·응답·입장마다 전원에게 보내던 `poll:update` `quiz:answered` `participants` 를 **창당 1회(트레일링 스로틀)** 로 합친다.
  - 스태프 창 `BROADCAST_BATCH_MS`(기본 300ms), 참가자 창 `BROADCAST_BATCH_PARTICIPANT_MS`(기본 500ms)
  - 활동 열기·마감·결과 공개·정책 변경 같은 **전이는 `immediate`** 로 즉시 전송(배치를 기다리지 않음). 활동을 닫으면 남은 배치는 취소.
- `pollDistribution()` 은 `pollVersion` 캐시 — 표/정책/공개/닉네임 변경 시에만 O(n) 재계산. 참가자용 `pollAggregate()` 는 같은 캐시에서 entries 만 뺀다.
- 효과(verify-scale [B], 60명 동시 투표): `poll:update` 프레임 60 → **1**, 참가자 1명 수신 125B(프로젝터 2.2KB). 400명 워드클라우드 기준 서버 송신 ≈1.1GB → 수 MB.

## 3. Rate limit

### HTTP — `@fastify/rate-limit` (`server/src/index.ts`, `routes.ts` `RL`)

| 경로 | IP당 |
|---|---|
| 전역 | `RATE_LIMIT_PER_MIN` (기본 1200/분 — 강당 400명이 NAT 1개를 공유할 수 있어 넉넉히) |
| `POST /api/classrooms` | 20/분 |
| `POST /api/decks/upload-pdf` · `upload-images` | 10/분 |
| `POST /api/decks` | 30/분 |
| `POST /api/decks/generate` · `quick-generate` · `chat-agent` | 20/분 |
| `GET /api/health` · `GET /api/uploads/:filename` | 제외 (모니터링 / 참가자 400명이 장당 요청하는 이미지 슬라이드) |

- 초과 시 `429 {statusCode, error:'rate_limited', message:'요청이 너무 많아요. N초 뒤에…'}`
- Fastify `trustProxy` 를 켜서(`TRUST_PROXY`, 기본 on) Cloudflare→Caddy 뒤에서도 `req.ip` 가 실제 클라이언트 IP 가 된다. 직접 노출 배포면 `TRUST_PROXY=0`.
- 로컬 부하 테스트 등에서 끄려면 `RATE_LIMIT_DISABLED=1`.

### Socket — 토큰 버킷 (`server/src/ratelimit.ts` `SOCKET_EVENT_RULES`)

소켓 1개 × 이벤트별. burst 만큼 즉시, 이후 초당 rate 충전. 초과 이벤트는 **버리고** 첫 초과에만 `errmsg` 1회.

| 이벤트 | rate/s | burst |
|---|---|---|
| `student:pollVote` | 1 | 4 |
| `student:quizAnswer` | 1 | 3 |
| `student:askQuestion` | 0.2 (5초 1개) | 2 |
| `student:upvoteQuestion` | 2 | 6 |
| `student:surveySubmit` | 0.5 | 2 |
| `*:join` | 0.5 | 3 |
| 소켓 전체 | 10 | 30 |

- socket.io `maxHttpBufferSize` 64KB — 넘는 프레임은 연결 종료.

### 클라이언트 재접속 (`client/src/lib/socket.ts`)

지수 백오프 1s → 최대 30s, 지터 ±70% (`randomizationFactor`). 서버 재시작 후 400명이 같은 순간에 다시 붙는 스파이크를 흩뿌린다.

## 4. 검증 스크립트 영향

기존 4개 스크립트는 수정 없이 통과한다(대기가 전부 ≥2s 라 300~500ms 배치 안에 들어옴). `verify-scale.mjs` 는 HTTP 429 검사가 마지막에 있어 강의실 생성 버킷을 소진하므로 **다른 스크립트 뒤에** 돌린다(창 1분).
