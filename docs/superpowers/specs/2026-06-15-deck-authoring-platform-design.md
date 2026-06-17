# 덱 저작 플랫폼 — 설계 (v1)

> 작성일: 2026-06-15
> 대상 저장소: `H:\profNoh` (AI·AX 교육 플랫폼)

## 1. 목표

강사가 **직접 슬라이드·퀴즈·투표를 손쉽게 만들어** 라이브 수업에 쓸 수 있게 한다. 핵심 흐름:

> 주제 입력 → AI가 덱 한 벌 통째 생성 → 페이지마다 수정 → "이 덱으로 수업 시작"

현재는 덱이 코드에 1개 고정(`server/src/decks/ai-ax-4h.ts`)이라 강사가 콘텐츠를 못 바꾼다. 이걸 **저장 가능한 사용자 덱 + 저작 UI**로 확장한다.

## 2. 범위 (v1)

### 포함
- 강사 덱을 Supabase에 저장 (built-in 덱과 공존)
- AI 순차 생성 마법사 (`/build`): 주제·대상·분량 입력 → 슬라이드+퀴즈+투표 초안 생성
- 페이지 편집기: 슬라이드/퀴즈/투표 인라인 수정, 추가·삭제·순서이동
- 덱별 **편집 PIN**(소유/권한)
- "이 덱으로 수업 시작" → 기존 라이브(원버튼 진행) 흐름에 연결

### 제외 (v2 이후) — YAGNI
- 채팅·이미지·랩 활동 저작 (AI 키·안전필터·맞춤 systemPrompt 위험 → 기존 고정 덱에서만 유지)
- 협업 동시편집, 버전관리/히스토리, 이미지 업로드, 계정(이메일) 로그인, 덱 공개 갤러리

## 3. 권한 모델

- 덱 생성 시 **편집 PIN**(6자리)을 발급. 수정·삭제는 PIN 일치 필요. (현 `instructorSecret`과 동일 철학, 로그인 없음)
- 읽기(수업 진행)는 `deckId`만 있으면 가능 — 정답은 서버에서 `toPublicDeck`로 제거되므로 안전.
- 강사 브라우저는 **자기 덱 목록**을 `localStorage`에 `{deckId, title, pin}` 로 보관(편의). 분실 시 PIN 없으면 수정 불가.

## 4. 데이터 모델

### 새 테이블 `axedu_decks`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | text PK | 덱 코드 (예: `DCK7K2`, nanoid 6자, 대문자) |
| `title` | text | 덱 제목 |
| `data` | jsonb | **전체 `Deck`** (정답 `correctIndex`·`explanation` 포함, 서버 전용) |
| `edit_pin` | text | 6자리 편집 PIN |
| `created_at` | timestamptz | 기본 now() |
| `updated_at` | timestamptz | 수정 시 갱신 |

- RLS: 활성. service_role(서버)만 접근 — 클라이언트 직접 접근 차단. (기존 `axedu_*` 정책과 동일)
- `data`는 `shared/types.ts`의 `Deck` 스키마를 그대로 저장. `id`(덱)와 `data.id`는 동일하게 맞춘다.

### 타입 (shared/types.ts 추가)
- 기존 `Deck`, `Slide`, `Activity` 재사용. 새 DTO만 추가:
  - `DeckSummary { id, title, slideCount, updatedAt }`
  - `GenerateDeckRequest { topic, audience, parts, quizPerPart, tone? }`
  - `CreateDeckResponse { deckId, editPin }`
  - `SaveDeckRequest { deckId, editPin, deck }`

## 5. 저장 계층 (서버)

핵심 제약: **런타임 코드(`socket.ts`)는 `getDeck/getActivity`를 동기로 호출**한다. 비동기로 바꾸면 변경 폭이 크므로 피한다.

**전략: 메모리 레지스트리 + 지연 로드**
- `server/src/decks/registry.ts` (신규): `Map<id, Deck>`. built-in 덱은 시작 시 등록.
- `getDeck(id)`는 **동기** 유지 — 레지스트리에서 읽음.
- `ensureDeckLoaded(id): Promise<Deck|null>` (신규, 비동기): 레지스트리에 없으면 DB에서 로드해 등록. **호출 지점은 비동기가 허용되는 곳만**:
  - 강의실 생성(`POST /api/classrooms`) 직전
  - 편집기 조회(`GET /api/decks/:id`)
  - 저장(`PUT`) 후 레지스트리 갱신
- 즉, 수업이 시작될 때 이미 메모리에 있으므로 `socket.ts`의 동기 `getDeck`는 그대로 동작.
- built-in 덱(`ai-ax-4h`)은 항상 레지스트리에 존재. 사용자 덱은 필요 시 로드.
- 서버 재시작 시 사용자 덱은 비어 있다가, 강의실 생성/편집기 접근 때 DB에서 자동 로드.

`server/src/decks/store.ts` (신규): Supabase CRUD 래퍼
- `loadDeck(id)`, `insertDeck(deck, pin)`, `updateDeck(id, pin, deck)`(PIN 검증), `listDecks()`(요약), `deleteDeck(id, pin)`.

## 6. AI 생성 마법사 (`/build`)

### UI 흐름 (순차 + 예시 버튼)
1. **주제** — 텍스트 입력 + 예시칩 버튼: `생성형 AI 입문`, `AI 윤리와 안전`, `프롬프트 기초`, `AI와 진로` … (클릭 시 입력칸 채움)
2. **대상·분량** — 학년/대상(예시칩: 중1, 고1, 일반), 파트 수(2~6), 파트당 퀴즈 수(0~3), 톤(쉽게/보통).
3. **생성** — 버튼 클릭 → 진행표시(Thinking) → 미리보기 → "편집기로 열기".

### 서버 `POST /api/decks/generate`
- 입력 검증 → MiniMax 호출(기존 `server/src/ai/` 재사용).
- 프롬프트: 한국어, 미성년자 안전, **엄격한 JSON 스키마**(슬라이드 layout/blocks, 퀴즈 question/options/correctIndex/explanation, 투표 prompt/mode)를 지시.
- 응답 파싱 → **서버측 검증/정규화**(`validateDeck`): 필수 필드, 길이 제한, 활동-슬라이드 연결, id 생성. 보기 개수·정답 인덱스 범위 체크.
- 실패 시: 1회 재시도 → 그래도 실패면 **제목만 있는 빈 덱** 생성(강사가 수동 작성). 절대 크래시 금지.
- 저장(`insertDeck`) → `{deckId, editPin}` 반환 + 레지스트리 등록.

### 비용/안전
- 생성은 1회 호출(덱 통째). 길이 상한으로 토큰 폭주 방지.
- 안전: 프롬프트에 "고등학생 대상, 부적절/위험 내용 금지" 명시. 생성 결과도 기존 안전필터 통과.

## 7. 페이지 편집기 (`/build/:deckId`)

- 진입 시 PIN 입력(또는 localStorage에 있으면 자동). PIN 없으면 읽기전용.
- 좌측(또는 상단): **페이지 목록**(슬라이드 썸네일/제목). 선택 시 우측 편집 폼.
- 페이지 타입별 폼:
  - **슬라이드**: layout 선택, 제목, 소제목, 불릿(여러 줄), 강사 노트.
  - **퀴즈**: 문제별 question/보기(2~4)/정답 선택/해설/제한시간. 문제 추가·삭제.
  - **투표**: prompt, mode(wordcloud/choice), choice면 보기 목록.
- 페이지 **추가**(타입 선택), **삭제**, **순서 ↑/↓**.
- **저장**: `PUT /api/decks/:id` (body에 PIN+전체 deck). 낙관적 저장, 실패 시 알림.
- **"이 덱으로 수업 시작"**: `POST /api/classrooms {deckId}` → 강사 콘솔로 이동.

데이터 흐름: 편집기는 전체 `Deck`을 로컬 상태로 들고 편집 → 저장 시 통째 PUT(작은 덱이라 단순/안전). 서버는 검증 후 덮어쓰기.

## 8. 라이브 연결

- `POST /api/classrooms`가 이미 `deckId`를 받음(기본 `ai-ax-4h`). 사용자 덱 id를 넘기면 `ensureDeckLoaded` 후 그 덱으로 강의실 생성.
- 강사 콘솔(원버튼 진행)·학생·프로젝터는 **수정 없이** 동작 (덱 구조 동일).
- Home(`/`)에 "강의 만들기" 진입점 추가(`/build`).

## 9. 모듈 경계 (격리/테스트 단위)

| 모듈 | 책임 | 의존 |
|---|---|---|
| `server/src/decks/store.ts` | DB CRUD | supabase |
| `server/src/decks/registry.ts` | 메모리 덱 + ensureDeckLoaded | store, built-in |
| `server/src/decks/validate.ts` | 덱/활동 검증·정규화 | types |
| `server/src/ai/generateDeck.ts` | 프롬프트→Deck 초안 | ai 프록시, validate |
| `server/src/routes.ts` | `/api/decks/*` 엔드포인트 | 위 모듈 |
| `client/src/pages/Build.tsx` | 마법사+덱 목록 | api |
| `client/src/pages/DeckEditor.tsx` | 페이지 편집기 | api |
| `client/src/lib/deckDraft.ts` | 편집 상태 헬퍼(추가/삭제/이동) | types |

각 모듈은 인터페이스로만 소통, 독립 테스트 가능.

## 10. 오류 처리

- DB 미설정(데모 모드): 저장은 메모리 레지스트리에만(휘발). UI에 "데모 모드: 저장 안 됨" 경고. 라이브 진행은 가능.
- PIN 불일치: 403, "편집 암호가 달라요".
- AI 생성 실패: 재시도→빈 덱 폴백, 사용자에 안내.
- 잘못된 덱 저장: 검증 실패 필드 메시지 반환, 저장 거부.

## 11. 검증 (테스트)

- `validateDeck` 단위 테스트: 정상/누락/범위초과 케이스.
- 브라우저 e2e(playwright, 기존 패턴): 생성→편집→저장→"수업 시작"→학생 입장→슬라이드/퀴즈/투표 동기화→정답 공개. 콘솔 에러 0 확인.
- 회귀: 기존 고정 덱(`ai-ax-4h`) 수업이 그대로 동작하는지.

## 12. 빌드 순서(구현 단계 개요)

1. 타입/DTO + `axedu_decks` 마이그레이션 + store/registry/validate.
2. `/api/decks` CRUD + 라이브 연결(사용자 덱으로 강의실 생성).
3. 페이지 편집기(수동 생성/수정) — A+B 동작 확인.
4. AI 생성 마법사(`/build`) + `generate` 엔드포인트.
5. Home 진입점 + e2e 검증 + 배포.
