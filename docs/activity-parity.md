# 활동 생성 기능 패리티 조사 및 구현 결과

기준: `shared/types.ts`의 `ActivityType` 9종(`chat | image | lab | quiz | poll | roleplay | analogy | writing | tutor`)과
예시 덱 `server/src/decks/ai-ax-4h.ts`가 실제로 사용하는 모든 활동/옵션.

세 가지 생성 경로를 조사했다.

- **(a) 원버튼 AI 생성** — `Build.tsx` → `POST /api/decks/generate` → `server/src/ai/generateDeck.ts`
- **(b) 수동 편집** — `DeckEditor.tsx` (＋추가 버튼, 편집 폼)
- **(c) AI 조교 파이프라인** — `DeckEditor.tsx` AI 패널 → `POST /api/decks/quick-generate`·`/api/decks/chat-agent` → `server/src/ai/deckAgent.ts`

## 1. 조사 결과 (작업 전 갭 전수조사)

✅ = 생성 가능 / ❌ = 생성 불가 / ⚠️ = 부분 지원

| 활동 타입 | (a) 원버튼 AI | (b) 수동 편집 | (c) AI 조교 | 학생 뷰 | 프로젝터 뷰 |
|---|---|---|---|---|---|
| `quiz` | ✅ (파트당 자동) | ⚠️ 폼 있음 — intro·제한시간 편집 불가 | ✅ | 있음 | 있음 (전용) |
| `poll` | ⚠️ 워밍업 워드클라우드 1개 하드코딩만 | ⚠️ 폼 있음 — 제목 편집 불가 | ✅ | 있음 | 있음 (전용) |
| `roleplay` | ✅ (선택 시) | ❌ 추가·편집 폼 없음 | ✅ | 있음 | 슬라이드 |
| `analogy` | ✅ (선택 시) | ❌ 추가·편집 폼 없음 | ✅ | 있음 | 슬라이드 |
| `writing` | ✅ (선택 시) | ❌ 추가·편집 폼 없음 | ✅ | 있음 | 슬라이드 |
| `tutor` | ✅ (선택 시) | ❌ 추가·편집 폼 없음 | ✅ | 있음 | 슬라이드 |
| `chat` | ❌ | ❌ | ❌ | 있음 | 슬라이드 |
| `image` | ❌ | ❌ | ❌ | 있음 | 슬라이드 |
| `lab` | ❌ | ❌ | ❌ | 있음 | 슬라이드 |

### 옵션(필드) 단위 갭

| 옵션 | 예시 덱 사용 | 작업 전 상태 |
|---|---|---|
| `quiz.intro` (워밍업 안내 문구) | ✔ (`quiz-warmup`) | 편집 폼·AI 스키마 모두 없음 |
| `quiz.questions[].timeLimitSec` | ✔ (문항별 15~25초) | 편집 폼 없음(20초 고정), AI는 생성함 |
| `poll.title` | ✔ | 편집 폼 없음 |
| `poll.mode: 'wordcloud'` 결과 표시(워드클라우드 ↔ 롤링페이퍼/문구 대시보드) | ✔ (`poll-warmup`, `poll-feedback`) | 렌더링(`PollView.tsx`)은 이미 지원 — 편집 폼에 안내 없음 |
| `chat.systemPrompt` / `chat.missions` | ✔ (`chat-first`) | 생성/편집 경로 전무 |
| `image.suggestions` | ✔ (`image-gen`) | 생성/편집 경로 전무 |
| `lab.labType: 'prompt'|'context'|'harness'` | ✔ (3종 모두 사용) | 생성/편집 경로 전무 |
| `lab.examplePrompts` (원클릭 칩) | ✔ (`lab-harness`) | 생성/편집 경로 전무 |
| `lab.cannedResults` (예시별 고정 결과) | ✔ (`lab-harness`) | 생성/편집 경로 전무 |
| `lab.labelA/labelB` | ✔ | 생성/편집 경로 전무 |
| `GenerateDeckRequest.activities` | — | `roleplay|analogy|writing|tutor` 4종으로 타입 제한 |

기타: 서버 `validateDeck`(저장 경로)은 9종 전부 정규화 지원 — 저장/로드는 문제 없었고 **생성·편집 UI가 병목**이었다.

## 2. 구현 결과 (작업 후)

| 활동 타입 | (a) 원버튼 AI | (b) 수동 편집 | (c) AI 조교 |
|---|---|---|---|
| `quiz` | ✅ | ✅ 전용 폼 (intro·제한시간 포함) | ✅ |
| `poll` | ✅ (워밍업 자동) | ✅ 전용 폼 (제목·모드·표시 안내 포함) | ✅ |
| `roleplay` | ✅ | ✅ 전용 폼 | ✅ |
| `analogy` | ✅ | ✅ 전용 폼 | ✅ |
| `writing` | ✅ | ✅ 전용 폼 | ✅ |
| `tutor` | ✅ | ✅ 전용 폼 | ✅ |
| `chat` | ✅ (신규) | ✅ 전용 폼 (신규) | ✅ (신규) |
| `image` | ✅ (신규) | ✅ 전용 폼 (신규) | ✅ (신규) |
| `lab` | ✅ (신규) | ✅ 전용 폼 (신규 — cannedResults 고정 결과 편집 포함) | ✅ (신규) |

- 수동 편집: 좌측 슬라이드 목록 하단 "＋" 그리드에서 9종 전부 추가 가능, 타입별 전용 편집 폼 제공.
- AI 조교: 퀵 생성 버튼 9종 + 자유 대화 지시 모두 지원 (`add_<type>` operations).
- 원버튼: "포함할 신규 AI 실습 활동" 체크박스에 💬 AI 자유 대화 / 🎨 이미지 생성 / 🔬 비교 실습 랩 추가.
- `lab.cannedResults`는 **AI가 생성하지 않는다**(장문 고정 대본을 모델이 지어내면 품질·토큰 문제) — 수동 편집 폼에서 예시 프롬프트별로 "고정 결과 넣기"로 작성한다. AI 생성 랩은 실시간 AI 호출로 동작.
- 학생/프로젝터 렌더러는 기존 컴포넌트(`client/src/components/activities/*`, `PollView`, `Projector.tsx`)를 그대로 재사용 — 신규 렌더러 없음.

## 3. 구조 (레지스트리 리팩토링)

- **서버**: `server/src/ai/activitySpecs.ts` — 활동별 AI 생성 스펙(라벨·프롬프트 필드·예시·normalize) 단일 정의처.
  `deckAgent.ts`(퀵 생성·조교 대화)와 `generateDeck.ts`(원버튼)가 모두 이 레지스트리를 참조. `routes.ts`의 허용 타입도 `GEN_TYPES`로 일원화.
- **클라이언트**: `client/src/activities/defs/<type>.tsx` — 활동 1종 = 파일 1개(라벨/아이콘/blank/fromAI/편집 폼/학생 뷰 래퍼),
  `client/src/activities/registry.ts` 에 한 줄 등록. `DeckEditor`(아이콘·＋추가·편집 폼·AI 적용)와 `Student`(활동 렌더링)가 레지스트리만 참조.
- 새 활동 추가 절차: `docs/adding-activities.md` 참고.
