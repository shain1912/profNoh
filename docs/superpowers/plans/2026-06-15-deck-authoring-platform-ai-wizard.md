# 덱 저작 플랫폼 — 플랜 2: AI 순차 생성 마법사

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** 강사가 주제·대상·분량을 순차로 입력하면 MiniMax가 **슬라이드+퀴즈 초안을 통째로** 생성해 덱으로 저장하고, 플랜 1의 편집기로 바로 넘어가 다듬을 수 있게 한다.

**Architecture:** 서버 `generateDeck`가 MiniMax(`chatComplete`)로 JSON을 받아 `parseDeckJson`(순수)으로 Deck 구조로 변환 → `validateDeck`로 정규화. 표지 슬라이드 + 워밍업 투표는 코드로 항상 보장, 본문 슬라이드·퀴즈는 AI가 채운다. JSON 파싱/호출 실패 시 빈 덱으로 폴백(절대 크래시 없음). 클라이언트는 `Build.tsx`에 2단계 위저드(주제→옵션→생성)를 추가.

**Tech Stack:** 기존 `server/src/ai/minimax.ts`의 `chatComplete`, 플랜 1의 `validateDeck`/`insertDeckRow`/`registerDeck`, React/Vite, 단위테스트 `tsx --test`, e2e Playwright.

> 전제: 플랜 1이 적용·동작 중. `.env`에 MiniMax 키가 있으면 실제 생성, 없으면 데모 모드로 빈 덱+표지+투표만 생성된다(폴백). git 아님 → Checkpoint로 검증.

---

## File Structure
- Create: `server/src/ai/generateDeck.ts` — `parseDeckJson`(순수), `generateDeck`(async), `buildPrompt`
- Create: `server/test/generateDeck.test.mjs` — parseDeckJson 단위 테스트
- Modify: `server/src/routes.ts` — `POST /api/decks/generate`
- Modify: `shared/types.ts` — `GenerateDeckRequest` DTO
- Modify: `client/src/lib/buildApi.ts` — `generateDeck` 호출
- Modify: `client/src/pages/Build.tsx` — AI 위저드 섹션
- Create: `verify-aiwizard.mjs` — e2e

---

## Task 1: 생성 로직 (`generateDeck.ts`) — TDD

**Files:**
- Modify: `shared/types.ts` (DTO 추가)
- Create: `server/src/ai/generateDeck.ts`
- Test: `server/test/generateDeck.test.mjs`

- [ ] **Step 1: `shared/types.ts` 끝에 DTO 추가**

```ts
export interface GenerateDeckRequest {
  topic: string;
  audience?: string;   // 예: "고등학교 1학년"
  parts?: number;      // 파트 수 2~6
  quizPerPart?: number; // 0~3
  tone?: string;       // 예: "쉽게"
}
```

- [ ] **Step 2: 실패 테스트 작성** — `server/test/generateDeck.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeckJson } from '../src/ai/generateDeck.ts';

const SAMPLE = JSON.stringify({
  title: '생성형 AI 입문',
  sections: [
    { partTitle: 'AI란?', slides: [{ title: 'AI 정의', subtitle: '', bullets: ['컴퓨터가 학습', '예측한다'], notes: '천천히' }],
      quiz: [{ question: 'AI는 검색인가?', options: ['그렇다', '아니다', '가끔', '모름'], correctIndex: 1, explanation: '예측이다' }] },
  ],
});

test('parseDeckJson: 정상 JSON → 슬라이드+퀴즈+표지+투표', () => {
  const d = parseDeckJson(SAMPLE, 'DCKAI1', '생성형 AI 입문');
  assert.equal(d.id, 'DCKAI1');
  // 표지(1) + 워밍업 투표(1) + 섹션 표지(1) + 본문(1) + 퀴즈(1) = 5장 이상
  assert.ok(d.slides.length >= 4, 'slides=' + d.slides.length);
  const hasPoll = Object.values(d.activities).some((a) => a.type === 'poll');
  const hasQuiz = Object.values(d.activities).some((a) => a.type === 'quiz');
  assert.ok(hasPoll, 'poll 있어야');
  assert.ok(hasQuiz, 'quiz 있어야');
});

test('parseDeckJson: 코드펜스로 감싼 JSON도 파싱', () => {
  const fenced = '```json\n' + SAMPLE + '\n```';
  const d = parseDeckJson(fenced, 'DCKAI2', '제목');
  assert.ok(d.slides.length >= 4);
});

test('parseDeckJson: 쓰레기 입력 → 폴백(표지+투표 보장, 크래시 없음)', () => {
  const d = parseDeckJson('이건 JSON이 아니야 미안', 'DCKAI3', '안전강의');
  assert.ok(d.slides.length >= 1);
  assert.equal(d.id, 'DCKAI3');
});

test('parseDeckJson: 퀴즈 correctIndex 범위 밖 → validateDeck가 보정', () => {
  const bad = JSON.stringify({ title: 't', sections: [{ partTitle: 'p', slides: [], quiz: [{ question: 'q', options: ['a', 'b'], correctIndex: 9, explanation: '' }] }] });
  const d = parseDeckJson(bad, 'DCKAI4', 't');
  const q = Object.values(d.activities).find((a) => a.type === 'quiz');
  assert.ok(q && q.questions[0].correctIndex >= 0 && q.questions[0].correctIndex < q.questions[0].options.length);
});
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `npx tsx --test server/test/generateDeck.test.mjs`
Expected: FAIL — `generateDeck.ts` 없음.

- [ ] **Step 4: `server/src/ai/generateDeck.ts` 구현**

```ts
import type { Deck, Slide, Activity, GenerateDeckRequest } from '../../../shared/types';
import { validateDeck, makeActId } from '../decks/validate';
import { chatComplete } from './minimax';

// validate.ts 는 makeActId 를 export 하지 않으므로 로컬 id 생성기 사용
function rid() { return Math.random().toString(36).slice(2, 10); }

interface GenSlide { title?: string; subtitle?: string; bullets?: string[]; notes?: string; }
interface GenQuiz { question?: string; options?: string[]; correctIndex?: number; explanation?: string; }
interface GenSection { partTitle?: string; slides?: GenSlide[]; quiz?: GenQuiz[]; }
interface GenDeck { title?: string; sections?: GenSection[]; }

export function buildPrompt(opts: GenerateDeckRequest): { system: string; user: string } {
  const parts = Math.min(6, Math.max(1, opts.parts ?? 3));
  const quizN = Math.min(3, Math.max(0, opts.quizPerPart ?? 1));
  const audience = opts.audience || '고등학생';
  return {
    system:
      '너는 한국 학교 수업용 슬라이드를 설계하는 교육 콘텐츠 전문가야. 안전하고 교육적이며, 미성년자에게 부적절하거나 위험한 내용은 절대 넣지 않는다. 반드시 JSON 객체 하나만 출력하고 그 외 설명/말머리/코드펜스 텍스트는 쓰지 않는다.',
    user:
      `주제: "${opts.topic}"\n대상: ${audience}\n파트 수: ${parts}\n파트당 퀴즈: ${quizN}문제\n톤: ${opts.tone || '쉽고 친근하게'}\n\n` +
      `아래 JSON 스키마로만 응답해:\n` +
      `{"title": string, "sections": [{"partTitle": string, "slides": [{"title": string, "subtitle": string, "bullets": [string], "notes": string}], "quiz": [{"question": string, "options": [string, string, string, string], "correctIndex": number, "explanation": string}]}]}\n\n` +
      `규칙: 파트는 정확히 ${parts}개. 파트마다 슬라이드 2~4장, bullets 2~5개(짧은 문장). 퀴즈는 파트마다 ${quizN}문제, 보기 정확히 4개, correctIndex는 0~3, explanation 한 문장. 한국어. JSON 외 텍스트 금지.`,
  };
}

/** AI 텍스트(또는 임의 텍스트)를 안전한 Deck 으로 변환. 절대 throw 안 함. */
export function parseDeckJson(text: string, id: string, fallbackTitle: string): Deck {
  const title = (fallbackTitle || '새 강의').slice(0, 80);
  const slides: Slide[] = [];
  const activities: Record<string, Activity> = {};

  // 표지 + 워밍업 투표는 항상 보장
  slides.push({ id: rid(), part: 0, partTitle: '시작', layout: 'title', title, subtitle: 'AI가 만든 초안 — 자유롭게 수정하세요', blocks: [], notes: '' });
  const pollId = 'poll_warm';
  activities[pollId] = { type: 'poll', id: pollId, title: '워밍업 투표', prompt: `${title} 하면 떠오르는 단어 하나!`, mode: 'wordcloud', options: [] };
  slides.push({ id: rid(), part: 0, partTitle: '시작', layout: 'content', title: '떠오르는 단어는?', subtitle: '폰으로 한 단어 입력!', blocks: [], notes: '', activityId: pollId });

  let parsed: GenDeck | null = null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch { parsed = null; }

  const realTitle = (parsed?.title || title).slice(0, 80);
  slides[0].title = realTitle;

  (parsed?.sections ?? []).slice(0, 8).forEach((sec, si) => {
    const partTitle = (sec.partTitle || `파트 ${si + 1}`).slice(0, 60);
    // 섹션 표지
    slides.push({ id: rid(), part: si + 1, partTitle, layout: 'section', title: partTitle, subtitle: '', blocks: [], notes: '' });
    // 본문 슬라이드
    (sec.slides ?? []).slice(0, 6).forEach((sl) => {
      slides.push({
        id: rid(), part: si + 1, partTitle, layout: 'content',
        title: (sl.title || '').slice(0, 120), subtitle: (sl.subtitle || '').slice(0, 160),
        blocks: (sl.bullets ?? []).slice(0, 6).map((b) => ({ kind: 'bullet' as const, text: String(b).slice(0, 400) })),
        notes: (sl.notes || '').slice(0, 400),
      });
    });
    // 퀴즈
    const qs = (sec.quiz ?? []).slice(0, 5).filter((q) => q.question);
    if (qs.length) {
      const qid = 'quiz_' + rid();
      activities[qid] = {
        type: 'quiz', id: qid, title: `${partTitle} 퀴즈`,
        questions: qs.map((q) => ({
          id: rid(), question: String(q.question).slice(0, 200),
          options: (q.options ?? []).slice(0, 4).map((o) => String(o).slice(0, 120)),
          correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          timeLimitSec: 20, explanation: (q.explanation || '').slice(0, 300),
        })),
      };
      slides.push({ id: rid(), part: si + 1, partTitle, layout: 'content', title: `${partTitle} 퀴즈 🎮`, subtitle: '', blocks: [], notes: '', activityId: qid });
    }
  });

  // validateDeck 로 최종 정규화(보기 2~4개, correctIndex 범위, 유령 activityId 제거 등)
  return validateDeck({ id, title: realTitle, slides, activities }, id);
}

/** MiniMax 호출 → 초안 Deck. 실패해도 표지+투표 빈 덱 반환. */
export async function generateDeck(opts: GenerateDeckRequest, id: string): Promise<Deck> {
  const { system, user } = buildPrompt(opts);
  const title = opts.topic?.slice(0, 80) || '새 강의';
  try {
    const { text } = await chatComplete(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.7, maxTokens: 4000 },
    );
    return parseDeckJson(text, id, title);
  } catch {
    return parseDeckJson('', id, title); // 폴백
  }
}
```

> 주의: `validate.ts`에 `makeActId` export가 없다. 위 코드는 로컬 `rid()`를 쓰므로 `import { validateDeck, makeActId }` 에서 **`makeActId`를 빼고** `import { validateDeck } from '../decks/validate';` 로 작성한다. (이 줄을 그대로 반영할 것.)

- [ ] **Step 5: import 줄 교정 후 테스트 통과 확인**

`generateDeck.ts` 첫 import를 `import { validateDeck } from '../decks/validate';` 로 두고 `makeActId` 미사용 확인.
Run: `npx tsx --test server/test/generateDeck.test.mjs`
Expected: 4 tests PASS.

- [ ] **Step 6: Checkpoint** — `npm -w client run build` 성공.

---

## Task 2: 생성 라우트 (`POST /api/decks/generate`)

**Files:**
- Modify: `server/src/routes.ts`

- [ ] **Step 1: import 추가** (기존 저작 import 묶음 근처)

```ts
import { generateDeck } from './ai/generateDeck';
import type { GenerateDeckRequest } from '../../shared/types';
```

- [ ] **Step 2: 라우트 추가** (`POST /api/decks` 옆, `registerRoutes` 내부)

```ts
  // AI 생성: 주제 → 초안 덱 생성 후 저장
  app.post('/api/decks/generate', async (req, reply) => {
    const body = (req.body ?? {}) as GenerateDeckRequest;
    if (!body.topic || !body.topic.trim()) return reply.code(400).send({ error: 'bad', message: '주제를 입력해줘!' });
    const id = makeDeckId();
    const pin = makePin();
    const deck = await generateDeck(body, id);
    const ok = await insertDeckRow(deck, pin);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장소가 꺼져 있어 저장할 수 없어요. (.env 확인)' });
    registerDeck(deck);
    return { deckId: id, editPin: pin };
  });
```

(`makeDeckId`, `makePin`, `insertDeckRow`, `registerDeck` 는 플랜 1에서 이미 import됨.)

- [ ] **Step 3: Checkpoint — 생성 스모크** (서버 로컬 기동 상태)

```bash
node -e "(async()=>{const r=await(await fetch('http://localhost:8787/api/decks/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic:'생성형 AI 입문',audience:'고1',parts:2,quizPerPart:1})})).json();console.log('gen',r);const e=await(await fetch('http://localhost:8787/api/decks/'+r.deckId+'/edit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({editPin:r.editPin})})).json();console.log('slides',e.deck?.slides?.length,'acts',Object.keys(e.deck?.activities||{}).length)})()"
```

Expected: `gen { deckId, editPin }`, `slides` >= 4 (키 있으면 더 많음), `acts` >= 2 (poll+quiz). (데모 모드면 slides 2, acts 1 — 폴백 정상.)

---

## Task 3: 클라이언트 AI 위저드 (`Build.tsx`)

**Files:**
- Modify: `client/src/lib/buildApi.ts`
- Modify: `client/src/pages/Build.tsx`

- [ ] **Step 1: `buildApi.ts` 에 `generateDeck` 추가**

import 줄에 타입 추가하고 함수 추가:

```ts
import type { Deck, DeckSummary, CreateDeckResponse, DeckEditResponse, GenerateDeckRequest } from '@shared/types';
// ...
export const generateDeck = (body: GenerateDeckRequest) =>
  apiPost<CreateDeckResponse>('/api/decks/generate', body);
```

- [ ] **Step 2: `Build.tsx` 에 AI 위저드 섹션 추가**

`Build.tsx` 전체를 아래로 교체:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDeck, generateDeck, getMyDecks, rememberDeck } from '../lib/buildApi';

const TOPIC_CHIPS = ['생성형 AI 입문', 'AI 윤리와 안전', '프롬프트 기초', 'AI와 진로', '딥러닝 쉽게 이해하기'];
const AUDIENCE_CHIPS = ['중학교 1학년', '고등학교 1학년', '고등학교 2학년', '일반 성인'];

export default function Build() {
  const nav = useNavigate();
  const mine = getMyDecks();

  // 수동 생성
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function makeBlank() {
    setBusy(true); setErr('');
    try {
      const r = await createDeck(title.trim() || '새 강의');
      rememberDeck({ deckId: r.deckId, title: title.trim() || '새 강의', pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setErr(e.message ?? '생성 실패'); } finally { setBusy(false); }
  }

  // AI 위저드
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('고등학교 1학년');
  const [parts, setParts] = useState(3);
  const [quizPerPart, setQuizPerPart] = useState(1);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  async function makeAi() {
    setGenBusy(true); setGenErr('');
    try {
      const r = await generateDeck({ topic: topic.trim(), audience, parts, quizPerPart });
      rememberDeck({ deckId: r.deckId, title: topic.trim(), pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setGenErr(e.message ?? '생성 실패'); } finally { setGenBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-extrabold">강의 만들기 🛠️</h1>

      {/* AI 위저드 */}
      <div className="card mt-4 space-y-3 ring-1 ring-brand/30">
        <div className="text-sm font-bold text-brand">✨ AI로 만들기</div>
        {step === 1 ? (
          <>
            <input className="input" placeholder="강의 주제를 적어줘" value={topic} maxLength={80} onChange={(e) => setTopic(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {TOPIC_CHIPS.map((c) => (
                <button key={c} className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setTopic(c)}>{c}</button>
              ))}
            </div>
            <button className="btn-primary w-full" disabled={!topic.trim()} onClick={() => setStep(2)}>다음 ▶</button>
          </>
        ) : (
          <>
            <div className="text-sm text-white/70">주제: <b>{topic}</b></div>
            <div>
              <div className="mb-1 text-sm text-white/60">대상</div>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_CHIPS.map((c) => (
                  <button key={c} className={['rounded-full px-3 py-1 text-sm', audience === c ? 'bg-brand text-on-brand' : 'bg-white/10 hover:bg-white/20'].join(' ')} onClick={() => setAudience(c)}>{c}</button>
                ))}
              </div>
            </div>
            <label className="block text-sm text-white/60">파트 수: {parts}
              <input type="range" min={2} max={6} value={parts} className="w-full" onChange={(e) => setParts(Number(e.target.value))} />
            </label>
            <label className="block text-sm text-white/60">파트당 퀴즈: {quizPerPart}
              <input type="range" min={0} max={3} value={quizPerPart} className="w-full" onChange={(e) => setQuizPerPart(Number(e.target.value))} />
            </label>
            {genBusy ? (
              <div className="rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
                <div className="text-sm text-white/80">✨ AI가 강의를 만드는 중… 최대 30초 정도 걸려요</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" /></div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="btn-ghost px-4" onClick={() => setStep(1)}>← 이전</button>
                <button className="btn-primary flex-1" onClick={makeAi}>✨ 강의 만들기</button>
              </div>
            )}
            {genErr && <p className="text-sm text-down">{genErr}</p>}
          </>
        )}
      </div>

      {/* 빈 강의(수동) */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-white/50">또는 빈 강의로 직접 만들기</summary>
        <div className="card mt-2 space-y-3">
          <input className="input" placeholder="강의 제목" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-ghost w-full" onClick={makeBlank} disabled={busy}>{busy ? '만드는 중…' : '＋ 빈 강의 만들기'}</button>
          {err && <p className="text-sm text-down">{err}</p>}
        </div>
      </details>

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

- [ ] **Step 3: Checkpoint** — `npm run build` 성공.

---

## Task 4: e2e 검증

**Files:**
- Create: `verify-aiwizard.mjs`

- [ ] **Step 1: `verify-aiwizard.mjs` 작성**

```js
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const errs = [];
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on('pageerror', (e) => errs.push('' + e.message));

await p.goto(`${BASE}/build`, { waitUntil: 'networkidle' });
// 1단계: 주제 칩 클릭 → 다음
await p.getByText('생성형 AI 입문', { exact: true }).click();
await p.getByRole('button', { name: '다음 ▶' }).click();
await sleep(300);
// 2단계: 생성
await p.getByText('✨ 강의 만들기').click();
console.log('생성 시작, 대기…');
await p.waitForURL('**/build/**', { timeout: 60000 }).catch(() => {});
// /build/:id 로 이동했는지(편집기) — 페이지 목록의 슬라이드 수 확인
await sleep(1500);
const url = p.url();
const slideBtns = await p.locator('aside button').count();
console.log('편집기 URL:', /\/build\/[A-Z0-9]{4,}/.test(url), '| 페이지 버튼 수:', slideBtns);
await p.screenshot({ path: 'shots/aiwizard.png' });
console.log('ERRORS', errs.length); errs.slice(0, 8).forEach((e) => console.log(e));
await browser.close();
process.exit(0);
```

- [ ] **Step 2: 빌드+서버 재시작 후 실행**

Run: `npm run build` → `taskkill //F //IM node.exe` → `npm start`(백그라운드) → health 대기 → `node verify-aiwizard.mjs http://localhost:8787`
Expected: `편집기 URL: true`, `페이지 버튼 수` >= 3 (키 있으면 더 많음; 데모 폴백이어도 표지+투표=2 이상), `ERRORS 0`.

- [ ] **Step 3: 회귀 — 플랜 1 저작 e2e 재실행**

Run: `node verify-authoring.mjs http://localhost:8787`
Expected: 기존대로 통과(저장·수업시작·학생 동기화, ERRORS 0).

- [ ] **Step 4: 최종 — 서버 정지, 결과 보고.**

---

## Self-Review
- **스펙 커버리지(6절 AI 마법사)**: 순차 입력+예시칩(Task 3), 주제→통째 생성(Task 1·2), 검증/정규화+폴백(Task 1), 편집기로 인계(Task 3 nav), 안전 프롬프트(Task 1 system). 충족.
- **플레이스홀더**: 없음.
- **타입 일관성**: `parseDeckJson(text,id,title)`, `generateDeck(opts,id)`, `GenerateDeckRequest`, route `/api/decks/generate`, client `generateDeck(body)` 일치.
- **주의**: `generateDeck.ts`는 `validate.ts`의 `makeActId`를 import하지 않는다(없음). 로컬 `rid()` 사용. e2e는 MiniMax 키 유무와 무관하게 통과(폴백 보장).
