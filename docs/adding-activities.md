# 새 활동(Activity) 추가 가이드

"활동 1종 = 정의 1곳" 레지스트리 구조를 따른다. 새 활동 `foo`를 추가하는 전체 절차는 아래 6단계이며,
1·2단계(타입)와 5단계(서버 검증)를 제외하면 **파일 하나 + 등록 한 줄**이 전부다.

## 1. 공유 타입 정의 — `shared/types.ts`

```ts
export interface FooActivity {
  type: 'foo';
  id: string;
  title: string;
  intro?: string;
  // ...활동 고유 필드
}
```

- `ActivityType` 유니온에 `'foo'` 추가.
- `Activity` 유니온에 `FooActivity` 추가.
- 학생 답을 서버가 채점/검사해야 하면 서버 전용 필드(예: 퀴즈 `correctIndex`)는 주석으로 표시하고
  `server/src/decks/index.ts`의 `toPublicDeck`에서 제거되는지 확인.

## 2. 서버 저장 정규화 — `server/src/decks/validate.ts`

`validateDeck`의 활동 분기에 `foo` 케이스 추가 (신뢰 불가 입력 → 안전한 필드 클램핑, 절대 throw 금지).
이걸 빠뜨리면 **저장 시 활동이 조용히 사라진다.**

## 3. 서버 AI 생성 스펙 — `server/src/ai/activitySpecs.ts` ★핵심

`ACTIVITY_GEN_SPECS`에 항목 하나 추가:

```ts
foo: {
  label: '푸 활동',            // 프롬프트·메시지에 쓰는 한국어 이름
  fields: '...',              // AI 조교 단건 생성 프롬프트의 필드 상세 지시
  example: '{"title":"..."}', // JSON 예시
  oneShot: '"barField": string(...)', // 원버튼 생성 프롬프트용 추가 필드 한 줄 요약
  normalize: (a) => { ... },  // AI 원시 출력 → 안전한 필드 객체 (필수 필드 없으면 null → 재생성 유도)
},
```

이것만으로 자동 반영되는 것:
- AI 조교 퀵 생성·자유 대화 (`deckAgent.ts` — `GEN_TYPES` 순회)
- 원버튼 AI 덱 생성 (`generateDeck.ts` — 요청된 타입의 `oneShot` 스키마 삽입 + `normalize` 파싱)
- `/api/decks/quick-generate`의 허용 타입 검사 (`routes.ts` — `GEN_TYPES`)

생성 품질 검증(정답 풀이 대조, 사실 검사 등)이 필요하면 `deckAgent.ts`의 `verifyActivity()`에 타입 분기 추가 (선택).

원버튼 경로에서 체크박스로 노출하려면 `shared/types.ts`의 `GenerateDeckRequest.activities` 유니온과
`Build.tsx`의 체크박스 목록에 `foo` 추가.

## 4. 클라이언트 정의 파일 — `client/src/activities/defs/foo.tsx` ★핵심

파일 하나에 활동의 클라이언트 정의 전부를 담는다:

```tsx
import type { FooActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField /* , TextAreaField, ChoiceChips, StringListEditor */ } from '../editorKit';
import FooStudent from '../../components/activities/FooStudent'; // 학생 화면 컴포넌트

function Editor({ act, onChange }: { act: FooActivity; onChange: (a: FooActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      {/* 활동 고유 필드 편집 위젯 */}
    </div>
  );
}

const def: ActivityDef<FooActivity> = {
  type: 'foo',
  label: '푸 활동',
  icon: '🦊',
  aiQuick: true,                       // AI 퀵 생성 버튼 노출 여부
  blank: (id) => ({ type: 'foo', id, title: '새 푸 활동' /* 기본값 */ }),
  fromAI: (raw, id) => ({ /* AI operations 페이로드 → 활동 객체 (클램핑 포함) */ }),
  Editor,
  Student: ({ activity, ctx }) => (    // ctx: { token, sessionId, live(소켓·퀴즈·투표 상태) }
    <FooStudent activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};
export default def;
```

그리고 `client/src/activities/registry.ts`에 **한 줄 등록**:

```ts
import foo from './defs/foo';
export const ACTIVITY_DEFS = { ..., foo };
```

이것만으로 자동 반영되는 것:
- `DeckEditor` 좌측 "＋활동" 추가 버튼 · 슬라이드 목록 아이콘 · 타입별 편집 폼
- `DeckEditor` AI 조교 퀵 생성 버튼(`aiQuick: true`일 때) 및 AI 결과(`add_foo` operation) 적용
- `Student` 페이지의 활동 렌더링 (활동이 열리면 `def.Student` 렌더)

## 5. 학생 화면 컴포넌트 (렌더러)

- **이미 있는 활동을 편집/생성 경로에만 추가하는 경우: 새로 만들지 말고 `components/activities/*`의 기존 컴포넌트를 def의 `Student` 래퍼에서 재사용한다.**
- 완전히 새로운 활동이면 `client/src/components/activities/FooStudent.tsx`를 만들고 def에서 래핑.
- 학생 입력을 AI로 처리해야 하면 서버 `routes.ts`에 `/api/ai/foo` 류 엔드포인트 추가 (쿼터 `checkUsage`·`checkSafety` 패턴 준수).

## 6. 프로젝터 화면 (선택)

프로젝터(`client/src/pages/Projector.tsx`)는 기본적으로 활동이 열려도 **현재 슬라이드**를 크게 보여준다.
`quiz`(문항·카운트다운·정답 분포·리더보드)와 `poll`(워드클라우드/롤링페이퍼/막대그래프 — `PollView.tsx`)만
실시간 전용 뷰가 있다. 새 활동에 전용 프로젝터 뷰가 필요할 때만 `Projector.tsx`에 분기를 추가한다.

## 체크리스트

- [ ] `shared/types.ts`: 인터페이스 + `ActivityType`/`Activity` 유니온
- [ ] `server/src/decks/validate.ts`: 저장 정규화 분기
- [ ] `server/src/ai/activitySpecs.ts`: 생성 스펙 등록 (AI 3경로 자동 반영)
- [ ] `client/src/activities/defs/foo.tsx` + `registry.ts` 한 줄 (편집·추가·학생뷰 자동 반영)
- [ ] (선택) `GenerateDeckRequest.activities` + `Build.tsx` 체크박스
- [ ] (선택) `deckAgent.ts` `verifyActivity` 품질 검증
- [ ] (선택) `Projector.tsx` 전용 뷰
- [ ] 검증: `node verify-activity-parity.mjs` (서버 8795 기동 후)
