# 덱 저작 플랫폼 — 플랜 1: 저장 토대 + 페이지 편집기 (수동)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 강사가 슬라이드·퀴즈·투표로 구성된 덱을 **직접 만들고 페이지마다 수정**해 Supabase에 저장하고, 그 덱으로 라이브 수업(기존 원버튼 진행)을 시작할 수 있게 한다.

**Architecture:** 새 테이블 `axedu_decks`(JSON 덱+편집 PIN). 서버는 built-in 덱과 DB 덱을 하나의 **메모리 레지스트리**로 통합하고, 강의실 생성/편집 시점에만 `ensureDeckLoaded`로 DB에서 지연 로드 — 런타임(`socket.ts`)의 동기 `getDeck/getActivity`는 그대로 둔다. 클라이언트는 `/build`(덱 목록·새 덱)와 `/build/:deckId`(페이지 편집기)를 추가한다.

**Tech Stack:** Node + Fastify + Supabase(service_role), React + Vite + Tailwind, 단위 테스트는 Node 내장 `node --test`, e2e는 Playwright `.mjs`(기존 패턴).

> **참고:** 이 저장소는 git이 아니다. 각 Task 끝의 **Checkpoint**는 commit 대신 빌드/테스트 실행으로 검증한다. AI 생성(마법사)은 **플랜 2**에서 다룬다. 이 플랜은 수동 저작만으로 완결된다.

---

## File Structure

**서버 (신규)**
- `server/src/decks/store.ts` — Supabase CRUD (`loadDeckRow`, `insertDeckRow`, `updateDeckRow`, `listDeckRows`)
- `server/src/decks/registry.ts` — 메모리 덱 맵 + `ensureDeckLoaded`, `registerDeck`
- `server/src/decks/validate.ts` — `validateDeck`(정규화/검증), `blankDeck`, `makeDeckId`, `makePin`
- `server/test/validate.test.mjs` — validate 단위 테스트 (node --test)

**서버 (수정)**
- `server/src/decks/index.ts` — `getDeck`를 레지스트리 기반으로 변경, 재노출
- `server/src/routes.ts` — `/api/decks` CRUD 추가, `POST /api/classrooms`·`GET /api/decks/:id`에 `ensureDeckLoaded` 연결

**공용 (수정)**
- `shared/types.ts` — `DeckSummary`, `CreateDeckResponse`, `SaveDeckRequest`, `DeckEditResponse` DTO 추가

**클라이언트 (신규)**
- `client/src/lib/deckDraft.ts` — 편집 헬퍼(blank 페이지 생성, 추가/삭제/이동)
- `client/src/lib/buildApi.ts` — 저작 API 호출 + 내 덱 localStorage 목록
- `client/src/pages/Build.tsx` — 내 덱 목록 + 새 덱 만들기
- `client/src/pages/DeckEditor.tsx` — 페이지 편집기

**클라이언트 (수정)**
- `client/src/App.tsx` — `/build`, `/build/:deckId` 라우트
- `client/src/pages/Home.tsx` — "강의 만들기" 진입점

**e2e (신규)**
- `verify-authoring.mjs` — 생성→편집→저장→수업 시작→학생 동기화 검증

---

## Task 1: DB 마이그레이션 + 공용 DTO

**Files:**
- Migration: Supabase `axedu_decks` 테이블
- Modify: `shared/types.ts` (끝에 DTO 추가)

- [ ] **Step 1: 마이그레이션 적용 (Supabase MCP `apply_migration`)**

name: `create_axedu_decks`, query:

```sql
create table if not exists public.axedu_decks (
  id text primary key,
  title text not null default '제목 없는 강의',
  data jsonb not null,
  edit_pin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.axedu_decks enable row level security;
-- 서버는 anon 키 + 허용 정책으로 동작(기존 axedu_* 와 동일). 같은 정책 부여.
create policy axedu_anon_all on public.axedu_decks
  for all to anon, authenticated
  using (true) with check (true);
```

> **확인된 사실:** 기존 `axedu_*` 테이블은 모두 `axedu_anon_all`(anon/authenticated, ALL) 정책을 가지며 서버는 anon 키로 접근한다. 정책 없이 RLS만 켜면 insert가 막히므로 **반드시 위 정책을 함께 적용**한다. (이 마이그레이션은 이미 적용 완료: `create_axedu_decks` + `axedu_decks_anon_policy`.)

- [ ] **Step 2: 적용 확인 (Supabase MCP `list_tables`, schemas=["public"])**

Expected: 결과에 `public.axedu_decks` 가 있고 `rls_enabled: true`.

- [ ] **Step 3: `shared/types.ts` 끝에 DTO 추가**

```ts
// ───────────────────────── 저작(덱 빌더) DTO ─────────────────────────

export interface DeckSummary {
  id: string;
  title: string;
  slideCount: number;
  updatedAt: string;
}

export interface CreateDeckResponse {
  deckId: string;
  editPin: string;
}

/** 편집기 진입: PIN 검증 후 정답 포함 전체 덱 반환 */
export interface DeckEditResponse {
  deck: Deck;
  title: string;
}

export interface SaveDeckRequest {
  deckId: string;
  editPin: string;
  deck: Deck;
}
```

- [ ] **Step 4: Checkpoint — 타입 컴파일 확인**

Run: `npm -w client run build`
Expected: 빌드 성공(타입 에러 없음). 아직 사용처 없으므로 통과.

---

## Task 2: 덱 검증/정규화 (`validate.ts`) — TDD

`validateDeck`은 신뢰할 수 없는 입력(편집기 저장, 이후 AI 생성)을 받아 안전한 `Deck`으로 정규화한다. 순수 함수라 단위 테스트한다.

**Files:**
- Create: `server/src/decks/validate.ts`
- Test: `server/test/validate.test.mjs`

- [ ] **Step 1: 실패 테스트 작성** — `server/test/validate.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeck, blankDeck, blankSlide, blankQuiz, blankPoll } from '../src/decks/validate.ts';

test('blankDeck: 최소 유효 덱', () => {
  const d = blankDeck('DCK001', '테스트 강의');
  const v = validateDeck(d, 'DCK001');
  assert.equal(v.id, 'DCK001');
  assert.equal(v.title, '테스트 강의');
  assert.ok(Array.isArray(v.slides));
});

test('validateDeck: 슬라이드 제목 길이 제한(120자)', () => {
  const d = blankDeck('DCK002', 't');
  d.slides.push({ ...blankSlide(), title: 'x'.repeat(500) });
  const v = validateDeck(d, 'DCK002');
  assert.ok(v.slides[v.slides.length - 1].title.length <= 120);
});

test('validateDeck: 퀴즈 보기 2~4개 강제, correctIndex 범위 보정', () => {
  const d = blankDeck('DCK003', 't');
  const q = blankQuiz('q1');
  q.questions[0].options = ['a', 'b', 'c', 'd', 'e', 'f']; // 6개
  q.questions[0].correctIndex = 99; // 범위 밖
  d.activities['q1'] = q;
  d.slides.push({ ...blankSlide(), activityId: 'q1' });
  const v = validateDeck(d, 'DCK003');
  const vq = v.activities['q1'];
  assert.equal(vq.type, 'quiz');
  assert.ok(vq.questions[0].options.length <= 4 && vq.questions[0].options.length >= 2);
  assert.ok(vq.questions[0].correctIndex >= 0 && vq.questions[0].correctIndex < vq.questions[0].options.length);
});

test('validateDeck: 활동 없는 activityId 참조 제거', () => {
  const d = blankDeck('DCK004', 't');
  d.slides.push({ ...blankSlide(), activityId: 'ghost' });
  const v = validateDeck(d, 'DCK004');
  assert.equal(v.slides[v.slides.length - 1].activityId, undefined);
});

test('validateDeck: 빈 슬라이드 0개면 기본 표지 1장 보장', () => {
  const d = blankDeck('DCK005', '강의X');
  d.slides = [];
  const v = validateDeck(d, 'DCK005');
  assert.ok(v.slides.length >= 1);
});

test('blankPoll: wordcloud 기본', () => {
  const p = blankPoll('p1');
  assert.equal(p.type, 'poll');
  assert.equal(p.mode, 'wordcloud');
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test --experimental-strip-types server/test/validate.test.mjs`
Expected: FAIL — `validate.ts` 없음 / export 없음.
(참고: Node 22.7+ 의 `--experimental-strip-types` 로 `.ts` import. 동작 안 하면 Step 3 후 `tsx --test` 대안: `npx tsx --test server/test/validate.test.mjs`.)

- [ ] **Step 3: `server/src/decks/validate.ts` 구현**

```ts
import { customAlphabet } from 'nanoid';
import type {
  Deck, Slide, Activity, QuizActivity, PollActivity, SlideLayout,
} from '../../../shared/types';

export const makeDeckId = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
export const makePin = customAlphabet('0123456789', 6);
const makeActId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const clamp = (s: unknown, max: number): string =>
  (typeof s === 'string' ? s : '').slice(0, max);

const LAYOUTS: SlideLayout[] = ['title', 'section', 'content', 'big', 'twocol'];

export function blankSlide(): Slide {
  return { id: makeActId(), part: 0, partTitle: '', layout: 'content', title: '', subtitle: '', blocks: [], notes: '' };
}

export function blankQuiz(id: string): QuizActivity {
  return {
    type: 'quiz', id, title: '새 퀴즈',
    questions: [{ id: makeActId(), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' }],
  };
}

export function blankPoll(id: string): PollActivity {
  return { type: 'poll', id, title: '새 투표', prompt: '', mode: 'wordcloud', options: [] };
}

export function blankDeck(id: string, title: string): Deck {
  return {
    id, title: clamp(title, 80) || '제목 없는 강의',
    slides: [{ ...blankSlide(), layout: 'title', title: clamp(title, 80) || '새 강의', partTitle: '시작' }],
    activities: {},
  };
}

/** 신뢰할 수 없는 덱을 안전한 Deck 으로 정규화. 절대 throw 하지 않음. */
export function validateDeck(input: unknown, id: string): Deck {
  const raw = (input ?? {}) as Partial<Deck>;
  const activities: Record<string, Activity> = {};

  for (const [key, a0] of Object.entries(raw.activities ?? {})) {
    const a = a0 as Activity;
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'quiz') {
      const questions = (a.questions ?? []).slice(0, 30).map((q) => {
        let options = (q.options ?? []).map((o) => clamp(o, 120)).filter((o, i) => i < 4);
        while (options.length < 2) options.push('');
        let ci = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
        if (ci < 0 || ci >= options.length) ci = 0;
        let t = typeof q.timeLimitSec === 'number' ? q.timeLimitSec : 20;
        t = Math.min(120, Math.max(5, t));
        return { id: clamp(q.id, 40) || makeActId(), question: clamp(q.question, 200), options, correctIndex: ci, timeLimitSec: t, explanation: clamp(q.explanation, 300) };
      });
      activities[key] = { type: 'quiz', id: key, title: clamp(a.title, 80) || '퀴즈', intro: clamp(a.intro, 200) || undefined, questions: questions.length ? questions : blankQuiz(key).questions };
    } else if (a.type === 'poll') {
      const mode = a.mode === 'choice' ? 'choice' : 'wordcloud';
      const options = mode === 'choice' ? (a.options ?? []).slice(0, 8).map((o) => clamp(o, 60)).filter(Boolean) : [];
      activities[key] = { type: 'poll', id: key, title: clamp(a.title, 80) || '투표', prompt: clamp(a.prompt, 200), mode, options };
    }
    // chat/image/lab 은 v1 저작 대상 아님 → built-in 덱에만 존재. 들어오면 무시.
  }

  let slides: Slide[] = (raw.slides ?? []).slice(0, 200).map((s) => {
    const layout: SlideLayout = LAYOUTS.includes(s.layout as SlideLayout) ? (s.layout as SlideLayout) : 'content';
    const blocks = (s.blocks ?? []).slice(0, 12)
      .map((b) => ({ kind: (['h', 'p', 'bullet', 'note', 'quote', 'callout'].includes(b.kind) ? b.kind : 'p') as Slide['blocks'][number]['kind'], text: clamp(b.text, 400) }))
      .filter((b) => b.text);
    const activityId = s.activityId && activities[s.activityId] ? s.activityId : undefined;
    return {
      id: clamp(s.id, 40) || makeActId(),
      part: typeof s.part === 'number' ? s.part : 0,
      partTitle: clamp(s.partTitle, 60),
      layout,
      title: clamp(s.title, 120) || undefined,
      subtitle: clamp(s.subtitle, 160) || undefined,
      blocks,
      notes: clamp(s.notes, 400) || undefined,
      activityId,
    };
  });

  if (slides.length === 0) {
    slides = blankDeck(id, clamp(raw.title, 80) || '새 강의').slides;
  }

  return { id, title: clamp(raw.title, 80) || '제목 없는 강의', slides, activities };
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx tsx --test server/test/validate.test.mjs`
Expected: PASS (6 tests). (`--experimental-strip-types`가 되면 그쪽도 통과.)

- [ ] **Step 5: Checkpoint**

Run: `npm -w client run build`
Expected: 빌드 성공.

---

## Task 3: Supabase 저장 계층 (`store.ts`)

**Files:**
- Create: `server/src/decks/store.ts`

- [ ] **Step 1: `store.ts` 구현**

```ts
import { dbSafe } from '../db';
import type { Deck, DeckSummary } from '../../../shared/types';

interface DeckRow { id: string; title: string; data: Deck; edit_pin: string; updated_at: string; }

export async function loadDeckRow(id: string): Promise<DeckRow | null> {
  return dbSafe(async (sb) => {
    const r = await sb.from('axedu_decks').select('id,title,data,edit_pin,updated_at').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as DeckRow) ?? null;
  });
}

export async function insertDeckRow(deck: Deck, pin: string): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').insert({ id: deck.id, title: deck.title, data: deck, edit_pin: pin });
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function updateDeckRow(deck: Deck): Promise<boolean> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').update({ title: deck.title, data: deck, updated_at: new Date().toISOString() }).eq('id', deck.id);
    if (res.error) throw res.error;
    return true;
  });
  return !!r;
}

export async function listDeckRows(): Promise<DeckSummary[]> {
  const r = await dbSafe(async (sb) => {
    const res = await sb.from('axedu_decks').select('id,title,data,updated_at').order('updated_at', { ascending: false }).limit(100);
    if (res.error) throw res.error;
    return (res.data ?? []) as { id: string; title: string; data: Deck; updated_at: string }[];
  });
  return (r ?? []).map((row) => ({ id: row.id, title: row.title, slideCount: row.data?.slides?.length ?? 0, updatedAt: row.updated_at }));
}
```

> 참고: `new Date().toISOString()` 은 서버 런타임에서 정상(워크플로 스크립트 제약과 무관).

- [ ] **Step 2: Checkpoint — 타입 확인**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: 에러 없음. (tsconfig에 noEmit 옵션 없으면 `npx tsx server/src/index.ts` 가 기동되는지로 대체 — Task 5 후 종합 확인.)

---

## Task 4: 메모리 레지스트리 + 지연 로드 (`registry.ts`, `index.ts`)

런타임 동기 호출을 유지하기 위해, 덱을 메모리 맵에 보관하고 필요 시 DB에서 로드해 등록한다.

**Files:**
- Create: `server/src/decks/registry.ts`
- Modify: `server/src/decks/index.ts`

- [ ] **Step 1: `registry.ts` 구현**

```ts
import type { Deck } from '../../../shared/types';
import { aiAx4h } from './ai-ax-4h';
import { loadDeckRow } from './store';

const registry = new Map<string, Deck>();
registry.set(aiAx4h.id, aiAx4h); // built-in

export function registerDeck(deck: Deck): void {
  registry.set(deck.id, deck);
}

/** 동기: 레지스트리에 있는 덱만 반환 (런타임 socket.ts 용) */
export function getDeckSync(id: string): Deck | undefined {
  return registry.get(id);
}

/** 비동기: 없으면 DB에서 로드해 등록 후 반환 (강의실 생성/편집 진입점 용) */
export async function ensureDeckLoaded(id: string): Promise<Deck | null> {
  const cached = registry.get(id);
  if (cached) return cached;
  const row = await loadDeckRow(id);
  if (!row?.data) return null;
  registry.set(id, row.data);
  return row.data;
}
```

- [ ] **Step 2: `index.ts` 수정 — `getDeck`를 레지스트리 기반으로**

`server/src/decks/index.ts` 의 상단 import와 `DECKS`/`getDeck` 정의를 교체한다. 기존:

```ts
import type { Deck, Activity } from '../../../shared/types';
import { aiAx4h } from './ai-ax-4h';

const DECKS: Record<string, Deck> = {
  [aiAx4h.id]: aiAx4h,
};

export function getDeck(id: string): Deck | undefined {
  return DECKS[id];
}
```

를 다음으로 교체:

```ts
import type { Deck, Activity } from '../../../shared/types';
import { getDeckSync } from './registry';

export { ensureDeckLoaded, registerDeck } from './registry';

export function getDeck(id: string): Deck | undefined {
  return getDeckSync(id);
}
```

(`toPublicDeck`, `getQuizActivity`, `getActivity` 등 나머지 함수는 그대로 유지 — `getDeck`만 출처가 레지스트리로 바뀜.)

- [ ] **Step 3: Checkpoint — 기존 수업이 여전히 동작하는지**

Run: `npm run build` 후 서버 재시작(로컬), `node verify-onebutton.mjs http://localhost:8787`
Expected: 활동 4개 열림, 퀴즈 진행, ERRORS 0 (기존 built-in 덱 회귀 없음).

---

## Task 5: `/api/decks` CRUD + 라이브 연결 (`routes.ts`)

**Files:**
- Modify: `server/src/routes.ts`

- [ ] **Step 1: import 추가** (`routes.ts` 상단)

기존 `import { getDeck, toPublicDeck, getActivity } from './decks';` 를:

```ts
import { getDeck, toPublicDeck, getActivity, ensureDeckLoaded, registerDeck } from './decks';
import { validateDeck, blankDeck, makeDeckId, makePin } from './decks/validate';
import { loadDeckRow, insertDeckRow, updateDeckRow, listDeckRows } from './decks/store';
import type { SaveDeckRequest, CreateDeckResponse, DeckEditResponse, DeckSummary } from '../../shared/types';
```

- [ ] **Step 2: `POST /api/classrooms` 에 지연 로드 연결**

기존:

```ts
    const deckId = body.deckId ?? 'ai-ax-4h';
    const deck = getDeck(deckId);
    if (!deck) return reply.code(400).send({ error: 'bad', message: '존재하지 않는 덱입니다.' });
```

를:

```ts
    const deckId = body.deckId ?? 'ai-ax-4h';
    const deck = (await ensureDeckLoaded(deckId)) ?? getDeck(deckId);
    if (!deck) return reply.code(400).send({ error: 'bad', message: '존재하지 않는 덱입니다.' });
```

- [ ] **Step 3: `GET /api/decks/:id` 공개 조회에도 지연 로드**

기존:

```ts
  app.get('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = getDeck(id);
    if (!deck) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없습니다.' });
    return toPublicDeck(deck);
  });
```

를:

```ts
  app.get('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = (await ensureDeckLoaded(id)) ?? getDeck(id);
    if (!deck) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없습니다.' });
    return toPublicDeck(deck);
  });
```

- [ ] **Step 4: 저작 엔드포인트 추가** (`registerRoutes` 함수 안, 기존 라우트 뒤에)

```ts
  // ── 덱 저작(빌더) ──

  // 새 빈 덱 생성 → 코드+PIN 발급
  app.post('/api/decks', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string };
    const id = makeDeckId();
    const pin = makePin();
    const deck = blankDeck(id, (body.title ?? '').slice(0, 80) || '새 강의');
    const ok = await insertDeckRow(deck, pin);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장소(Supabase)가 꺼져 있어 덱을 저장할 수 없어요. (.env 확인)' });
    registerDeck(deck);
    const res: CreateDeckResponse = { deckId: id, editPin: pin };
    return res;
  });

  // 내 덱 요약 목록
  app.get('/api/decks', async () => {
    const list: DeckSummary[] = await listDeckRows();
    return list;
  });

  // 편집기 진입: PIN 검증 후 전체 덱(정답 포함) 반환
  app.post('/api/decks/:id/edit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { editPin?: string };
    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });
    if (row.edit_pin !== (body.editPin ?? '')) return reply.code(403).send({ error: 'bad', message: '편집 암호가 달라요.' });
    const res: DeckEditResponse = { deck: row.data, title: row.title };
    return res;
  });

  // 저장(통째 덮어쓰기): PIN 검증 + 검증/정규화
  app.put('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as SaveDeckRequest;
    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });
    if (row.edit_pin !== (body.editPin ?? '')) return reply.code(403).send({ error: 'bad', message: '편집 암호가 달라요.' });
    const deck = validateDeck(body.deck, id); // id 고정
    const ok = await updateDeckRow(deck);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장에 실패했어요. 잠시 후 다시 시도해줘.' });
    registerDeck(deck); // 메모리도 갱신 → 진행 중 수업 반영
    return { ok: true };
  });
```

- [ ] **Step 5: Checkpoint — 서버 API 스모크 테스트**

Run (서버 로컬 기동 상태에서):

```bash
node -e "(async()=>{const c=await(await fetch('http://localhost:8787/api/decks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'스모크'})})).json();console.log('create',c);const e=await(await fetch('http://localhost:8787/api/decks/'+c.deckId+'/edit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({editPin:c.editPin})})).json();console.log('edit slides',e.deck.slides.length);const bad=await fetch('http://localhost:8787/api/decks/'+c.deckId+'/edit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({editPin:'000000'})});console.log('wrong pin status',bad.status)})()"
```

Expected: `create { deckId, editPin }`, `edit slides 1`, `wrong pin status 403`.

---

## Task 6: 클라이언트 편집 헬퍼 (`deckDraft.ts`, `buildApi.ts`)

**Files:**
- Create: `client/src/lib/deckDraft.ts`
- Create: `client/src/lib/buildApi.ts`

- [ ] **Step 1: `deckDraft.ts` 구현**

```ts
import type { Deck, Slide, QuizActivity, PollActivity } from '@shared/types';

const rid = () => Math.random().toString(36).slice(2, 10);

export type PageKind = 'slide' | 'quiz' | 'poll';

export function pageKind(deck: Deck, slide: Slide): PageKind {
  if (!slide.activityId) return 'slide';
  const a = deck.activities[slide.activityId];
  return a?.type === 'quiz' ? 'quiz' : a?.type === 'poll' ? 'poll' : 'slide';
}

export function newSlide(): Slide {
  return { id: rid(), part: 0, partTitle: '', layout: 'content', title: '새 슬라이드', subtitle: '', blocks: [], notes: '' };
}

export function addPage(deck: Deck, kind: PageKind, at: number): Deck {
  const slides = [...deck.slides];
  const activities = { ...deck.activities };
  const slide = newSlide();
  if (kind === 'quiz') {
    const id = 'q_' + rid();
    const q: QuizActivity = { type: 'quiz', id, title: '새 퀴즈', questions: [{ id: rid(), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' }] };
    activities[id] = q; slide.activityId = id; slide.title = '퀴즈';
  } else if (kind === 'poll') {
    const id = 'p_' + rid();
    const p: PollActivity = { type: 'poll', id, title: '새 투표', prompt: '', mode: 'wordcloud', options: [] };
    activities[id] = p; slide.activityId = id; slide.title = '투표';
  }
  slides.splice(at + 1, 0, slide);
  return { ...deck, slides, activities };
}

export function deletePage(deck: Deck, index: number): Deck {
  const slides = deck.slides.filter((_, i) => i !== index);
  return { ...deck, slides: slides.length ? slides : deck.slides };
}

export function movePage(deck: Deck, index: number, dir: -1 | 1): Deck {
  const j = index + dir;
  if (j < 0 || j >= deck.slides.length) return deck;
  const slides = [...deck.slides];
  [slides[index], slides[j]] = [slides[j], slides[index]];
  return { ...deck, slides };
}

export function updateSlide(deck: Deck, index: number, patch: Partial<Slide>): Deck {
  const slides = deck.slides.map((s, i) => (i === index ? { ...s, ...patch } : s));
  return { ...deck, slides };
}

export function updateActivity(deck: Deck, activityId: string, next: QuizActivity | PollActivity): Deck {
  return { ...deck, activities: { ...deck.activities, [activityId]: next } };
}
```

- [ ] **Step 2: `buildApi.ts` 구현**

```ts
import type { Deck, DeckSummary, CreateDeckResponse, DeckEditResponse } from '@shared/types';
import { apiGet, apiPost } from './api';

const MINE = 'axedu_my_decks';
export interface MyDeck { deckId: string; title: string; pin: string; }

export function getMyDecks(): MyDeck[] {
  try { return JSON.parse(localStorage.getItem(MINE) ?? '[]'); } catch { return []; }
}
export function rememberDeck(d: MyDeck) {
  const list = getMyDecks().filter((x) => x.deckId !== d.deckId);
  list.unshift(d);
  localStorage.setItem(MINE, JSON.stringify(list.slice(0, 50)));
}
export function getPin(deckId: string): string {
  return getMyDecks().find((d) => d.deckId === deckId)?.pin ?? '';
}

export const createDeck = (title: string) => apiPost<CreateDeckResponse>('/api/decks', { title });
export const listDecks = () => apiGet<DeckSummary[]>('/api/decks');
export const openDeckForEdit = (deckId: string, editPin: string) =>
  apiPost<DeckEditResponse>(`/api/decks/${deckId}/edit`, { editPin });
export const saveDeck = (deckId: string, editPin: string, deck: Deck) =>
  apiPost<{ ok: boolean }>(`/api/decks/${deckId}`, { deckId, editPin, deck }).catch((e) => { throw e; });
```

> 주의: `saveDeck`는 PUT이어야 한다. `apiPost`는 POST만 보내므로, `api.ts`에 `apiPut`을 추가하거나 라우트를 POST로 맞춘다. **선택: 아래 Step 3에서 `apiPut` 추가.**

- [ ] **Step 3: `client/src/lib/api.ts` 에 `apiPut` 추가**

```ts
export async function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as any)?.message ?? '요청 실패'), { data });
  return data as T;
}
```

그리고 `buildApi.ts` 의 `saveDeck`를 `apiPut` 사용으로 교정:

```ts
import { apiGet, apiPost, apiPut } from './api';
// ...
export const saveDeck = (deckId: string, editPin: string, deck: Deck) =>
  apiPut<{ ok: boolean }>(`/api/decks/${deckId}`, { deckId, editPin, deck });
```

- [ ] **Step 4: Checkpoint**

Run: `npm -w client run build`
Expected: 빌드 성공.

---

## Task 7: 페이지 편집기 UI (`Build.tsx`, `DeckEditor.tsx`, 라우트, Home)

**Files:**
- Create: `client/src/pages/Build.tsx`
- Create: `client/src/pages/DeckEditor.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/Home.tsx`

- [ ] **Step 1: `Build.tsx` — 내 덱 목록 + 새 덱**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDeck, getMyDecks, rememberDeck } from '../lib/buildApi';

export default function Build() {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mine = getMyDecks();

  async function make() {
    setBusy(true); setErr('');
    try {
      const r = await createDeck(title.trim() || '새 강의');
      rememberDeck({ deckId: r.deckId, title: title.trim() || '새 강의', pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setErr(e.message ?? '생성 실패'); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-extrabold">강의 만들기 🛠️</h1>
      <div className="card mt-4 space-y-3">
        <input className="input" placeholder="강의 제목 (예: 생성형 AI 입문)" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn-primary w-full" onClick={make} disabled={busy}>{busy ? '만드는 중…' : '＋ 새 강의 만들기'}</button>
        {err && <p className="text-sm text-down">{err}</p>}
      </div>

      <h2 className="mt-8 text-lg font-bold">내 강의</h2>
      {mine.length === 0 ? (
        <p className="mt-2 text-white/50">아직 만든 강의가 없어요.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {mine.map((d) => (
            <button key={d.deckId} className="btn-ghost justify-between" onClick={() => nav(`/build/${d.deckId}`)}>
              <span>{d.title}</span><span className="text-xs text-white/40">{d.deckId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `DeckEditor.tsx` — 페이지 편집기**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Deck, Slide, QuizActivity, PollActivity } from '@shared/types';
import { openDeckForEdit, saveDeck, getPin, rememberDeck } from '../lib/buildApi';
import { setInstructor } from '../lib/session';
import { apiPost } from '../lib/api';
import {
  pageKind, addPage, deletePage, movePage, updateSlide, updateActivity, type PageKind,
} from '../lib/deckDraft';

export default function DeckEditor() {
  const { deckId = '' } = useParams();
  const nav = useNavigate();
  const [pin, setPin] = useState(getPin(deckId));
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [needPin, setNeedPin] = useState(!getPin(deckId));
  const [pinInput, setPinInput] = useState('');
  const [status, setStatus] = useState('');

  async function load(p: string) {
    try {
      const r = await openDeckForEdit(deckId, p);
      setDeck(r.deck); setPin(p); setNeedPin(false);
      rememberDeck({ deckId, title: r.title, pin: p });
    } catch (e: any) { setStatus(e.message ?? '열기 실패'); }
  }
  useEffect(() => { if (pin) load(pin); /* eslint-disable-next-line */ }, []);

  async function save() {
    if (!deck) return;
    setStatus('저장 중…');
    try { await saveDeck(deckId, pin, deck); setStatus('저장됨 ✓'); }
    catch (e: any) { setStatus(e.message ?? '저장 실패'); }
    setTimeout(() => setStatus(''), 2000);
  }

  async function startClass() {
    if (!deck) return;
    await save();
    const r = await apiPost<{ token: string; instructorSecret: string; classroomId: string; deckId: string }>('/api/classrooms', { deckId });
    setInstructor(r);
    nav('/teach');
  }

  if (needPin) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-bold">편집 암호 입력</h1>
        <p className="mt-1 text-sm text-white/50">덱 {deckId} 의 6자리 편집 PIN</p>
        <input className="input mt-4 text-center text-2xl tracking-widest" value={pinInput} maxLength={6} onChange={(e) => setPinInput(e.target.value)} />
        <button className="btn-primary mt-3 w-full" onClick={() => load(pinInput)}>열기</button>
        {status && <p className="mt-2 text-sm text-down">{status}</p>}
      </div>
    );
  }
  if (!deck) return <div className="grid h-full place-items-center text-white/40">불러오는 중… ⏳</div>;

  const slide = deck.slides[sel] ?? deck.slides[0];
  const kind = pageKind(deck, slide);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <input className="input max-w-xs" value={deck.title} maxLength={80} onChange={(e) => setDeck({ ...deck, title: e.target.value })} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-emerald-400">{status}</span>
          <button className="btn-ghost px-3 py-1" onClick={save}>저장</button>
          <button className="btn-primary px-3 py-1" onClick={startClass}>이 덱으로 수업 시작 ▶</button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[220px_1fr] overflow-hidden">
        {/* 페이지 목록 */}
        <aside className="overflow-y-auto border-r border-white/10 p-2">
          {deck.slides.map((s, i) => (
            <button key={s.id} className={['mb-1 block w-full rounded px-2 py-2 text-left text-sm', i === sel ? 'bg-brand/20 text-brand' : 'hover:bg-white/5'].join(' ')} onClick={() => setSel(i)}>
              <span className="text-white/40">{i + 1}.</span> {pageKind(deck, s) === 'quiz' ? '🎮 ' : pageKind(deck, s) === 'poll' ? '🗳️ ' : '📄 '}{s.title || '(빈 슬라이드)'}
            </button>
          ))}
          <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'slide', sel)); setSel(sel + 1); }}>＋장</button>
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'quiz', sel)); setSel(sel + 1); }}>＋퀴즈</button>
            <button className="btn-ghost py-1" onClick={() => { setDeck(addPage(deck, 'poll', sel)); setSel(sel + 1); }}>＋투표</button>
          </div>
        </aside>

        {/* 편집 폼 */}
        <main className="overflow-y-auto p-4">
          <div className="mb-3 flex gap-2 text-sm">
            <button className="btn-ghost px-2 py-1" onClick={() => { setDeck(movePage(deck, sel, -1)); setSel(Math.max(0, sel - 1)); }}>↑ 위로</button>
            <button className="btn-ghost px-2 py-1" onClick={() => { setDeck(movePage(deck, sel, 1)); setSel(Math.min(deck.slides.length - 1, sel + 1)); }}>↓ 아래로</button>
            <button className="btn-ghost px-2 py-1 text-down" onClick={() => { setDeck(deletePage(deck, sel)); setSel(Math.max(0, sel - 1)); }}>🗑 삭제</button>
          </div>

          {kind === 'slide' && <SlideForm slide={slide} onChange={(p) => setDeck(updateSlide(deck, sel, p))} />}
          {kind === 'quiz' && <QuizForm act={deck.activities[slide.activityId!] as QuizActivity} onChange={(a) => setDeck(updateActivity(deck, slide.activityId!, a))} />}
          {kind === 'poll' && <PollForm act={deck.activities[slide.activityId!] as PollActivity} onChange={(a) => setDeck(updateActivity(deck, slide.activityId!, a))} />}
        </main>
      </div>
    </div>
  );
}

function SlideForm({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  const bulletsText = (slide.blocks ?? []).map((b) => b.text).join('\n');
  return (
    <div className="space-y-3">
      <label className="block text-sm text-white/60">제목<input className="input mt-1" value={slide.title ?? ''} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} /></label>
      <label className="block text-sm text-white/60">소제목<input className="input mt-1" value={slide.subtitle ?? ''} maxLength={160} onChange={(e) => onChange({ subtitle: e.target.value })} /></label>
      <label className="block text-sm text-white/60">내용(줄마다 하나)
        <textarea className="input mt-1 h-40" value={bulletsText} onChange={(e) => onChange({ blocks: e.target.value.split('\n').filter(Boolean).map((t) => ({ kind: 'bullet', text: t })) })} />
      </label>
      <label className="block text-sm text-white/60">강사 노트<input className="input mt-1" value={slide.notes ?? ''} maxLength={400} onChange={(e) => onChange({ notes: e.target.value })} /></label>
    </div>
  );
}

function QuizForm({ act, onChange }: { act: QuizActivity; onChange: (a: QuizActivity) => void }) {
  const setQ = (qi: number, patch: Partial<QuizActivity['questions'][number]>) =>
    onChange({ ...act, questions: act.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-4">
      <input className="input" value={act.title} maxLength={80} onChange={(e) => onChange({ ...act, title: e.target.value })} />
      {act.questions.map((q, qi) => (
        <div key={q.id} className="card space-y-2">
          <input className="input" placeholder="문제" value={q.question} maxLength={200} onChange={(e) => setQ(qi, { question: e.target.value })} />
          {q.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input type="radio" checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} title="정답" />
              <input className="input" placeholder={`보기 ${oi + 1}`} value={o} maxLength={120} onChange={(e) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })} />
              {q.options.length > 2 && <button className="text-down" onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi), correctIndex: 0 })}>✕</button>}
            </div>
          ))}
          {q.options.length < 4 && <button className="btn-ghost px-2 py-1 text-sm" onClick={() => setQ(qi, { options: [...q.options, ''] })}>＋ 보기</button>}
          <input className="input" placeholder="해설(정답 공개 시 표시)" value={q.explanation ?? ''} maxLength={300} onChange={(e) => setQ(qi, { explanation: e.target.value })} />
          {act.questions.length > 1 && <button className="text-sm text-down" onClick={() => onChange({ ...act, questions: act.questions.filter((_, i) => i !== qi) })}>문제 삭제</button>}
        </div>
      ))}
      <button className="btn-ghost" onClick={() => onChange({ ...act, questions: [...act.questions, { id: Math.random().toString(36).slice(2, 10), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' }] })}>＋ 문제 추가</button>
    </div>
  );
}

function PollForm({ act, onChange }: { act: PollActivity; onChange: (a: PollActivity) => void }) {
  return (
    <div className="space-y-3">
      <input className="input" placeholder="투표 질문" value={act.prompt} maxLength={200} onChange={(e) => onChange({ ...act, prompt: e.target.value })} />
      <div className="flex gap-2 text-sm">
        <button className={['btn-ghost px-3 py-1', act.mode === 'wordcloud' ? 'text-brand' : ''].join(' ')} onClick={() => onChange({ ...act, mode: 'wordcloud' })}>워드클라우드</button>
        <button className={['btn-ghost px-3 py-1', act.mode === 'choice' ? 'text-brand' : ''].join(' ')} onClick={() => onChange({ ...act, mode: 'choice' })}>객관식</button>
      </div>
      {act.mode === 'choice' && (
        <div className="space-y-2">
          {(act.options ?? []).map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" placeholder={`보기 ${i + 1}`} value={o} maxLength={60} onChange={(e) => onChange({ ...act, options: (act.options ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
              <button className="text-down" onClick={() => onChange({ ...act, options: (act.options ?? []).filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn-ghost px-2 py-1 text-sm" onClick={() => onChange({ ...act, options: [...(act.options ?? []), ''] })}>＋ 보기</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `App.tsx` 라우트 추가**

기존 import/Routes에 추가:

```tsx
import Build from './pages/Build';
import DeckEditor from './pages/DeckEditor';
// ...
      <Route path="/build" element={<Build />} />
      <Route path="/build/:deckId" element={<DeckEditor />} />
```

(`<Route path="*" element={<Home />} />` 보다 위에 둔다.)

- [ ] **Step 4: `Home.tsx` 진입점 추가**

기존 `<div className="mt-10 grid w-full gap-3">` 안, 강사 버튼 아래에 추가:

```tsx
        <Link to="/build" className="btn-ghost py-4 text-lg">
          🛠️ 강의 만들기 (직접 제작)
        </Link>
```

- [ ] **Step 5: Checkpoint — 빌드**

Run: `npm run build`
Expected: 빌드 성공(타입 에러 없음).

---

## Task 8: e2e 검증

**Files:**
- Create: `verify-authoring.mjs`

- [ ] **Step 1: e2e 스크립트 작성** — `verify-authoring.mjs`

```js
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errs = [];
const tp = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
tp.on('pageerror', (e) => errs.push('teacher ' + e.message));

// 1) 덱 생성
await tp.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
await tp.locator('input').first().fill('자동테스트 강의');
await tp.getByText('새 강의 만들기').click();
await tp.waitForURL('**/build/**', { timeout: 8000 });
await sleep(800);

// 2) 퀴즈 페이지 추가 + 문제 작성
await tp.getByText('＋퀴즈').click(); await sleep(400);
const inputs = tp.locator('main input');
await inputs.nth(1).fill('1+1은?'); // 문제 (0번은 퀴즈 제목)
// 보기 2개 채우고 정답 라디오 첫 보기
const optionInputs = tp.locator('main input[placeholder^="보기"]');
await optionInputs.nth(0).fill('2');
await optionInputs.nth(1).fill('3');
await tp.locator('main input[type=radio]').first().check();
await tp.getByText('저장', { exact: true }).click(); await sleep(800);
console.log('저장 상태 보임:', await tp.getByText('저장됨').count());

// 3) 이 덱으로 수업 시작
await tp.getByText('이 덱으로 수업 시작').click();
await tp.waitForURL('**/teach', { timeout: 8000 });
await sleep(1500);
const token = JSON.parse(await tp.evaluate(() => localStorage.getItem('axedu_instructor'))).token;
console.log('TOKEN', token);

// 4) 학생 입장 + 동기화
const sp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
sp.on('pageerror', (e) => errs.push('student ' + e.message));
await sp.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
await sp.locator('input').nth(1).fill('학생'); await sp.getByText('입장하기').click();
await sp.waitForURL('**/play**', { timeout: 8000 }); await sleep(1000);

// 5) 강사 원버튼으로 퀴즈 슬라이드까지 진행 후 활동 열기/문제 시작
const btn = tp.getByTestId('next-step');
let opened = false;
for (let i = 0; i < 12; i++) {
  const label = (await btn.textContent()).trim();
  if (/시작하기/.test(label)) { await btn.click(); opened = true; await sleep(800); break; }
  await btn.click(); await sleep(400);
}
console.log('활동 열림:', opened);
const studentText = (await sp.locator('#root').innerText()).replace(/\n+/g, ' | ').slice(0, 80);
console.log('학생 화면:', studentText);

console.log('ERRORS', errs.length); errs.slice(0, 10).forEach((e) => console.log(e));
await browser.close();
process.exit(0);
```

- [ ] **Step 2: 실행해 검증**

Run: `npm run build` → 서버 재시작(로컬) → `node verify-authoring.mjs http://localhost:8787`
Expected: `저장됨` 보임, `TOKEN` 발급, `활동 열림: true`, 학생 화면이 슬라이드/퀴즈 표시, `ERRORS 0`.

- [ ] **Step 3: 회귀 — 기존 덱 수업**

Run: `node verify-onebutton.mjs http://localhost:8787`
Expected: 활동 4개, 퀴즈 진행, ERRORS 0 (built-in 덱 영향 없음).

- [ ] **Step 4: 최종 Checkpoint**

- 로컬에서 `/build` → 새 강의 → 슬라이드/퀴즈/투표 추가·수정·저장 → "수업 시작" → 학생 동기화까지 수동으로 1회 확인.
- 배포는 사용자 승인 후 별도 진행(클라이언트 dist 교체 + 필요 시 서버 재시작, `.env` 불변).

---

## Self-Review 결과 (작성자 점검)

- **스펙 커버리지**: 저장(Task 1·3·4) / 권한 PIN(Task 5) / 페이지 편집·추가·삭제·이동(Task 6·7) / 라이브 연결(Task 5·7) / 검증·오류(Task 2·5) / 테스트(Task 2·8) — 스펙의 v1 항목 충족. **AI 생성(C)은 플랜 2로 분리**(스펙 명시).
- **플레이스홀더**: 없음(모든 스텝에 실제 코드/명령/기대값).
- **타입 일관성**: `validateDeck(input,id)`, `ensureDeckLoaded`, `getDeckSync`, `apiPut`, `saveDeck`(PUT), DTO 이름(`DeckEditResponse` 등) 전 Task 일치.
- **주의**: 단위 테스트 `.ts` import는 `tsx --test`가 가장 안전(기존 devDep `tsx` 보유). git 부재로 commit 대신 빌드/테스트 Checkpoint 사용.
