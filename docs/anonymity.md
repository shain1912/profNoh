# 익명 시스템 (강당 모드 E2)

직장인·대형 청중 세션에서 "이름이 안 나간다"는 확신이 참여의 전제다(로드맵 E2). 세 층으로 구현했다.

## 1. 세션 익명 정책 — `settings.anonymity`

강의 시작 화면(`/teach`)에서 선택, 강의실 생성 요청(`POST /api/classrooms` body.settings)에 실린다. 콘솔 헤더의 정책 칩을 눌러 수업 중에도 바꿀 수 있다(`instructor:updateSettings`). `axedu_classrooms.settings`(jsonb)에 함께 저장되어 리포트가 같은 정책으로 집계한다.

| 값 | 의미 |
|---|---|
| `named_default` (기본) | 기본 닉네임, 활동별로 익명 지정 가능 |
| `anon_default` | 기본 익명, 활동별로 닉네임 지정 가능 |
| `always_anon` | 항상 익명. 리더보드·리포트 참가자 이름까지 "익명 N" 가명 |
| `always_named` | 항상 닉네임. 활동 설정 무시 |

해석 함수는 `shared/types.ts`의 `resolveAnonymous(policy, activity.anonymous)` 하나다. 서버(`ClassroomState.isActivityAnonymous`)와 리포트(`server/src/report.ts`)가 같은 함수를 쓴다.

## 2. 활동 단위 오버라이드 — `activity.anonymous?: boolean`

모든 활동 타입 공통 필드. 덱 편집기의 활동 편집 폼 아래 "🔒 참가자 이름 표시" 칩(세션 기본값 / 익명 / 닉네임)으로 설정하고, `validateDeck`이 boolean일 때만 보존한다.

익명으로 해석된 활동에서 일어나는 일:

- **서버가 닉네임을 내보내지 않는다.** `pollDistribution()`이 `entries`에서 `nickname` 키 자체를 제거한다. 강사 소켓에도 없다.
- **롤링페이퍼 서명 줄이 사라진다.** `PollView`의 `RollingPaper`는 `nickname`이 없으면 "– 이름" 줄을 렌더하지 않는다.
- **리포트는 집계만 싣는다.** 익명 투표는 `studentDetails: []`, 익명 퀴즈는 개별 답변의 이름이 `"익명"`. 카드에 "🔒 익명 집계" 뱃지.
- **참가자 화면 뱃지.** 헤더에 "🔒 익명 활동"(세션 익명이면 "익명 세션"), 투표 화면에 "🔒 익명으로 제출됩니다". 실명이면 "🙂 닉네임과 함께 제출됩니다".
- 프로젝터·강사 콘솔의 투표 영역에도 "🔒 익명" 뱃지.

열린 활동의 해석 결과는 `OpenActivityState.anonymous`로 모든 클라이언트에 전달된다.

## 3. 결과 숨김 → 공개 — `settings.resultsReveal` + `OpenActivityState.revealResults`

밴드왜건 방지. 기본값 `after_close`.

- `after_close`: 투표를 열면 `revealResults=false`. 학생·프로젝터에는 `{ hidden: true, total }`만 브로드캐스트되고(강사 전용 소켓 룸 `${id}:instructor`에만 전체 분포), 화면엔 "🔒 결과는 마감 후 공개돼요 · N명 참여" 카드가 뜬다. 강사가 **📢 결과 공개**(콘솔 버튼 또는 원버튼 다음 단계)를 누르면 `revealResults=true, closed=true` — 응답이 마감되고(늦은 응답은 `errmsg`) 전체 분포가 모두에게 나간다.
- `live`: 열자마자 공개, 마감 없음(기존 동작).

상태 변경은 퀴즈 진행 상태를 건드리지 않도록 `activity:opened`가 아니라 `activity:updated` 이벤트로 전달한다. 늦게 입장한 뷰어/학생도 `sendCurrentActivityTo`에서 같은 필터를 거친다.

## 검증

```bash
# 단위 (정책 해석·덱 검증·ClassroomState·리포트 집계) — 10 케이스
node --import tsx --test server/test/anonymity.test.mjs

# E2E (소켓 브로드캐스트 필터링 19 + UI 21 + 리포트 API 3) — 포트 8792 / 5178
PORT=8792 CLIENT_ORIGIN=http://localhost:5178 DEV_LOGIN=1 AUTH_JWT_SECRET=dev npm -w server run dev
API_PORT=8792 VITE_DEV_PORT=5178 npm -w client run dev
node verify-anon.mjs http://localhost:5178 http://localhost:8792
```

UI 검증은 dev-login이 필요하므로 `.env`의 `SUPABASE_URL`이 `axedu_users` 테이블이 있는 dev DB(`…/dev`)를 가리켜야 한다. 스크린샷은 `shots/anon-0*.png`.
