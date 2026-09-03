# Phase 2 영속화 — 상태 스냅샷·복원 + 강사 재접속

- 근거: `docs/research/2026-09-03-current-capabilities.md` 리스크 2 (라이브 상태가 단일 프로세스 메모리에만 존재), `docs/research/2026-09-03-feature-roadmap.md` Phase 2 #3
- 검증: `node verify-persist.mjs [8796]` (서버를 직접 띄우고 SIGKILL 로 죽였다 4번 재기동) · `node verify-persist-ui.mjs http://localhost:5178 http://localhost:8792` (브라우저 1탭 복귀)
- 단위: `node --import tsx --test server/test/snapshot.test.mjs`
- DDL: `deploy/migrations/2026-09-03-classroom-snapshots.sql` (additive — `axedu_classrooms.owner_id` + `axedu_classroom_snapshots`)

## 1. 무엇이 바뀌나

| 전 | 후 |
|---|---|
| 배포·크래시 1회 → 400명 토큰 무효, 강사도 재생성 외 방법 없음 | 재기동 시 최근 스냅샷(12시간 이내)을 메모리로 복원 — 같은 코드·슬라이드·열린 활동·투표·점수·질문·즉석 활동 유지 |
| 강사 새로고침 = 강의 선택 화면, 기존 강의실로 돌아갈 UI 없음 | 강의실이 로그인 계정에 귀속 → `/teach` 상단 "🔁 진행 중인 강의실" 목록에서 **이어서 진행 ▶** 1탭 |
| 참가자 재입장 점수는 메모리에 있을 때만 | 메모리(스냅샷)에 없어도 `axedu_participants(classroom_id, session_id)` 행으로 participant id·점수 복원 |

## 2. 스냅샷 (`server/src/snapshot.ts`)

- 강의실당 1행 upsert: `axedu_classroom_snapshots(classroom_id PK, token, owner_id, status, version, state jsonb, updated_at)`
- `state` = `ClassroomState.exportState()` (v=1) — 참가자·퀴즈/투표/설문 응답·사용량·질문·업보트·즉석 활동·설정·예산까지 전부. `socketId` 처럼 프로세스에 묶인 값만 뺀다. **instructorSecret 이 들어 있으니 클라이언트에 절대 노출 금지.**
- 저장 시점
  - `markDirty(c)`: 변경 후 `SNAPSHOT_DEBOUNCE_MS`(2초) 안에 추가 변경이 없으면 저장, 연속 변경 중이어도 첫 변경으로부터 `SNAPSHOT_MAX_WAIT_MS`(5초)를 넘기지 않는다 → 400명이 투표하는 30초 동안 upsert 6~15회.
  - `startSnapshotLoop()`: `SNAPSHOT_INTERVAL_MS`(30초)마다 `version !== savedVersion` 인 강의실만 sweep (저장 실패 재시도 겸함 — DB 다운 시 2초 재시도 폭주 대신 30초).
  - `installShutdownFlush()`: SIGTERM/SIGINT(배포 재시작) 시 전량 저장 후 종료(최대 4초).
- dirty 표시 위치
  - 소켓: `socket.use` 미들웨어가 rate limit 통과 이벤트마다 `setImmediate(markDirty)` — 핸들러가 next() 뒤 동기 실행이라 변경이 끝난 뒤 찍힌다. 강사·참가자 이벤트 전부 커버.
  - 타이머 경로(투표 자동 마감·퀴즈 자동 공개)와 REST(강의실 생성, AI 사용량·비용, 종료)는 명시 호출.
- 부팅 복원 `restoreSnapshots()`: `updated_at >= now - SNAPSHOT_TTL_HOURS(12h)` 이고 `status <> 'ended'` 인 행을 `ClassroomState.restore()` 로 올린다. 10초 상한(넘기면 빈 상태로 기동). 복원 직후 `savedVersion = version` 이라 변경 전엔 다시 쓰지 않는다.
- 타이머 재장전: `setupSocket()` 끝에서 복원된 강의실의 `poll.endsAt` / `quiz.endsAt(+1.5s)` 를 다시 건다. 기한이 이미 지났으면 즉시 마감/공개.
- 토큰 충돌: `createClassroom()` 이 복원된 코드와 겹치면 다시 뽑는다.
- 끄기: `SNAPSHOT_DISABLED=1` (저장·복원 모두). Supabase 미설정이면 자동 비활성.

## 3. 강사 재접속

- `POST /api/classrooms` 가 세션 쿠키의 사용자 id 를 `ClassroomState.ownerId` + `axedu_classrooms.owner_id` 에 기록 (로그인 없이도 생성은 여전히 가능 — owner 없음).
- `GET /api/classrooms/mine` (401 without login): 메모리 안 `ownerId === me && status !== 'ended'` 강의실을 최근 생성순으로 — `MyClassroomSummary` (`instructorSecret` 포함이므로 본인에게만).
- `POST /api/classrooms/:id/end` (owner 쿠키 또는 `instructorSecret`): `status='ended'` → 목록·부팅 복원 제외, `GET /api/classrooms/:token` 이 `exists:false`, `student:join` 거부("종료된 강의실이에요"). 즉시 스냅샷 flush.
- `/teach` `CreateScreen`: 마운트 시 `/mine` 조회 → "🔁 진행 중인 강의실" 카드(코드·제목·슬라이드·접속/누적·활동 진행 중·시작 시각) + **이어서 진행 ▶**(`onCreated` 로 기존 자격 전달) + **종료**. 콘솔의 "새 강의실" 은 강의실을 살려 둔 채 선택 화면으로 돌아가므로 곧바로 목록에서 복귀할 수 있다.
- 강사 자격은 여전히 브라우저에 저장하지 않는다(연구 문서 §1.1 정책 유지). 계정 귀속이 자격 저장을 대신한다.

## 4. 참가자 재입장 DB 폴백 (`socket.ts` `student:join`)

`sessionId` 가 메모리에 없을 때만 `loadParticipantRow(c, sessionId)` 1회 → 있으면 `upsertParticipant(sessionId, nickname, { id, score })` 로 같은 participant id·점수로 되살린다. 같은 id 를 써야 이전 `axedu_quiz_responses` 등 FK 행이 이어지고, 이후 `persistParticipant` upsert 가 PK 를 바꾸려다 실패하지 않는다. 메모리에 있는 세션은 DB 를 치지 않으므로 평상시 입장 비용은 그대로.

## 5. 검증 결과 (2026-09-03, dev DB)

- `verify-persist.mjs` 28/28 — 4기 재기동: 토큰·슬라이드 3·열린 투표·1표 텍스트·500점·`/mine`·예전 secret 콘솔 입장·스냅샷 창 밖 참가자의 DB 폴백(participantId 동일)·종료 후 미복원.
- `verify-persist-ui.mjs` 12/12 — 브라우저 1탭 복귀·새로고침 후 목록 유지·종료.
- 회귀(8792/5178): verify-timer · verify-auditorium-activities 31/31 · verify-anon 43/43 · verify-auditorium 48/48 · verify-scale 32/32 (강의실 생성 버킷 때문에 마지막에, 1분 간격).

주의: 검증 스크립트가 서버를 띄우는 포트에 **잔존 서버가 있으면 "재시작"이 가짜가 된다** — `verify-persist.mjs` 는 기동 전 헬스체크가 응답하면 바로 실패한다(빈 포트를 인자로).
