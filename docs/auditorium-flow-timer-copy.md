# 강당 D — 활동 타이머·자동 마감 / 리듬 알림 / 카피 톤 / 거절 비용 0

- 작성일: 2026-09-03 · 근거: [R2 A5-3·A5-5·A8-1~4](research/2026-09-03-auditorium-needs.md), [R3 결핍 7·12](research/2026-09-03-current-capabilities.md)
- 검증: `node verify-timer.mjs http://localhost:8794` · `node verify-copy.mjs` · `node verify-flow-ui.mjs http://localhost:5180` · `npx tsx --test server/test/validate.test.mjs`

## 1. 활동 타이머 + 자동 마감 (A5-3, 결핍 12)

### 덱 필드 (`shared/types.ts`)

| 활동 | 필드 | 의미 |
|---|---|---|
| `poll` | `timerSec?: number` | 5~600초. 설정 시 프로젝터 원형 게이지, 종료 시 자동 마감(추가 응답 차단). **타이머가 있는 투표는 마감 전까지 결과를 숨김**(밴드왜건 방지). 없으면 기존처럼 실시간 공개 |
| `poll` | `autoReveal?: boolean` | 마감 시 결과 자동 공개. false면 강사가 "📊 결과 공개" |
| `quiz` | `autoReveal?: boolean` | 문항 제한시간 종료(+1.5초 응답 유예) 후 서버가 자동 정답 공개 |

저장 정규화는 `server/src/decks/validate.ts`(0/누락 → 타이머 없음, 5~600 클램프). 편집 폼은 `client/src/activities/defs/poll.tsx` / `quiz.tsx`.

### 즉석 타이머 (덱 편집 없이)

`instructor:openActivity { activityId, timerSec?, autoReveal? }` — 값을 주면 덱 값 대신 이번 실행에만 적용. 강사 콘솔의 투표/퀴즈 슬라이드에 타이머 선택기(없음/30/60/90/120초 + 자동 공개 체크)가 있고, 기본값은 덱 필드에서 채움.

### 실시간 상태 (`OpenActivityState.poll`)

```ts
poll?: { timerSec?, endsAt?, closed: boolean, revealed: boolean, autoReveal: boolean }
quiz?.autoReveal?: boolean
```

상태 변화는 기존 `state` 브로드캐스트로 전파된다 (별도 이벤트 없음). 서버 타이머는 강의실당 1개(`server/src/socket.ts` `activityTimers`), 활동 닫기/다른 활동 열기/수동 진행 시 해제.

새 소켓 이벤트: `instructor:pollClose`(지금 마감), `instructor:pollReveal`(수동 공개). 마감 후 `student:pollVote` 는 거부되고 `errmsg` 로 안내.

### 화면

- 프로젝터: `Countdown ring` 원형 게이지 + "응답 n명" → 마감 전 `poll-hidden`(결과 숨김) → 공개 시 `poll-results`. 퀴즈도 같은 원형 게이지 사용.
- 참가자: 가로 바 타이머, 투표 후 "결과는 마감 후 공개" → 공개 시 결과. 마감 후 미응답자는 안내만.
- 강사: 진행 상태줄에 카운트다운 + 마감/공개 상태, 원버튼이 "⏹ 지금 마감 · n명 응답" → "📊 결과 공개" → "다음으로" 순으로 바뀜.

## 2. 강사 리듬 알림 (A5-5)

`Instructor.tsx` 헤더 뱃지 `data-testid="rhythm-badge"`: 마지막 활동 열기/닫기 이후 경과 분. 15분↑ 노랑(`warn`), 20분↑ 빨강(`alert`, pulse). 발표 모드 칩에도 15분↑부터 표시. 클라이언트 시각 기준(콘솔 입장 시점부터 계산, 새로고침 시 리셋).

## 3. 카피 톤 (결핍 7) — `settings.mode` 계약

- `settings.mode` 필드는 **강당 입장 워커(C) 소유**. 여기서는 정의하지 않고 읽기만 한다.
  - 서버: `server/src/copy.ts` `classroomMode(c)` → `settings.mode === 'auditorium'` 이면 강당, 아니면 교실.
  - 클라: `client/src/lib/sessionMode.ts` `detectMode(x)` → `x.mode` 또는 `x.settings.mode`. 소스 우선순위: 소켓 스냅샷 → `GET /api/classrooms/:token` 응답(`mode` 필드를 서버가 실어 보냄) → 교실.
- 참가자·입장 문구는 전부 사전 경유: 클라 `client/src/lib/copy.ts`(`useCopy()` / `copyFor(mode)`, 42항목), 서버 `server/src/copy.ts`(errmsg·notice·쿼터·AI 실패 13항목 + AI 시스템 프롬프트 `audiencePrompt`).
- 교실 모드 문구는 기존 그대로, 강당 모드는 성인 존댓말. `verify-copy.mjs` 가 (1) 참가자 파일의 "선생님/친구들/학생" 하드코딩 (2) 강당 문구의 반말 종결 (3) 서버 참가자 메시지 하드코딩 (4) AI 프롬프트 "고등학생" 고정 을 검사한다.
- C 워커가 스냅샷에 `mode` 를 실으면 REST 폴백 없이 즉시 반영된다. 강사 콘솔·덱 편집기 문구(강사 대상)는 범위 밖.

## 4. 거절 비용 0 (A8-1~4)

- 참가자 페이지·입장 페이지·활동 컴포넌트·`client/src/lib`·`index.html` 에 오디오 재생/AudioContext/진동/Web Push/Notification/카메라·마이크/위치/permissions.query/requestFullscreen 코드 **없음** (기존에도 없었고 `verify-copy.mjs` A1 이 회귀 검사).
- 입장 화면 하단 1줄: "🔒 닉네임과 응답만 저장되며 개인정보는 수집하지 않습니다." (`data-testid="privacy-line"`, 두 모드 공통).
