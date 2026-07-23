import type { FastifyInstance } from 'fastify';
import type { ChatRequest, ImageRequest, LabRequest, CreateClassroomResponse, GenerateDeckRequest, Deck } from '../../shared/types';
import { createClassroom, getByToken } from './state';
import { getSessionUser } from './auth/session';
import { getDeck, toPublicDeck, getActivity, ensureDeckLoaded, registerDeck, unregisterDeck } from './decks';
import { validateDeck, blankDeck, makeDeckId, makePin } from './decks/validate';
import { loadDeckRow, insertDeckRow, updateDeckRow, deleteDeckRow, listDeckRows } from './decks/store';
import type { SaveDeckRequest, CreateDeckResponse, DeckEditResponse, DeckSummary } from '../../shared/types';
import { checkSafety, safeImagePrompt } from './ai/safety';
import { chatComplete, type ChatMessage } from './ai/minimax';
import { generateImage } from './ai/stability';
import { runLab } from './ai/lab';
import { generateDeck } from './ai/generateDeck';
import { quickGenerate, chatWithAgent, type QuickGenType } from './ai/deckAgent';
import { persistClassroom, persistUsage, persistLabRun } from './persist';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { supabase } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(here, '../../uploads');

function getPdfPageCount(buffer: Buffer): number {
  const data = buffer.toString('binary');
  const matches = data.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s*(\d+)/);
  if (matches && matches[1]) {
    return parseInt(matches[1], 10);
  }
  const countMatches = data.match(/\/Count\s*(\d+)/g);
  if (countMatches) {
    let maxCount = 1;
    for (const m of countMatches) {
      const numMatch = m.match(/\d+/);
      if (numMatch) {
        const count = parseInt(numMatch[0], 10);
        if (count > maxCount) maxCount = count;
      }
    }
    return maxCount;
  }
  return 1;
}

export async function registerRoutes(app: FastifyInstance) {
  // 헬스체크
  app.get('/api/health', async () => ({ ok: true }));

  // 강의실 생성 (강사)
  app.post('/api/classrooms', async (req, reply) => {
    const body = (req.body ?? {}) as { deckId?: string; title?: string };
    const deckId = body.deckId ?? 'ai-ax-4h';
    const deck = (await ensureDeckLoaded(deckId)) ?? getDeck(deckId);
    if (!deck) return reply.code(400).send({ error: 'bad', message: '존재하지 않는 덱입니다.' });
    const c = createClassroom(deckId, body.title ?? deck.title);
    await persistClassroom(c); // 강의실을 먼저 기록(참가자 FK 보장)
    const res: CreateClassroomResponse = {
      classroomId: c.id,
      token: c.token,
      instructorSecret: c.instructorSecret,
      deckId: c.deckId,
    };
    return res;
  });

  // 강의실 정보 (학생 입장 화면)
  app.get('/api/classrooms/:token', async (req) => {
    const { token } = req.params as { token: string };
    const c = getByToken(token);
    if (!c) return { exists: false };
    return { exists: true, title: c.title, status: c.status };
  });

  // 공개 덱 (퀴즈 정답 제거본)
  app.get('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = (await ensureDeckLoaded(id)) ?? getDeck(id);
    if (!deck) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없습니다.' });
    return toPublicDeck(deck);
  });

  // ── AI 프록시 ──
  app.post('/api/ai/chat', async (req, reply) => {
    const body = req.body as ChatRequest;
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
    const safety = checkSafety(lastUser?.content ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    // systemPrompt 는 서버 덱에서 가져옴
    const act = getActivity(c.deckId, body.activityId);
    const sys: ChatMessage[] =
      act && act.type === 'chat' && act.systemPrompt
        ? [{ role: 'system', content: act.systemPrompt }]
        : [{ role: 'system', content: '너는 한국 고등학생을 위한 친절하고 안전한 학습 도우미야. 쉽고 짧게 한국어로 답해.' }];
    const history = (body.messages ?? []).slice(-10) as ChatMessage[];

    try {
      const { text, cost } = await chatComplete([...sys, ...history]);
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(cost);
      persistUsage(c, p.id, 'chat', 1, cost);
      return { reply: text };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 응답에 실패했어. 잠시 후 다시 시도해줘.' });
    }
  });

  app.post('/api/ai/image', async (req, reply) => {
    const body = req.body as ImageRequest;
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const safety = checkSafety(body.prompt ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'image');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    try {
      // 한글 프롬프트 → 간결한 영어 프롬프트로 변환 (Stability 품질↑ & 오탐 모더레이션↓)
      let enPrompt = body.prompt;
      try {
        const tr = await chatComplete(
          [
            { role: 'system', content: 'Convert the user idea into ONE concise English image-generation prompt (max 40 words). Wholesome and safe for a school classroom. Output ONLY the prompt, no quotes, no explanation.' },
            { role: 'user', content: body.style ? `${body.prompt}, style: ${body.style}` : body.prompt },
          ],
          { maxTokens: 120 },
        );
        if (tr.text && tr.text.trim().length > 1) {
          enPrompt = tr.text.trim();
          c.addCost(tr.cost);
        }
      } catch {
        /* 번역 실패 시 원문 사용 */
      }

      const { dataUrl, cost, demo } = await generateImage(safeImagePrompt(enPrompt));
      c.countUsage(body.sessionId, body.activityId, 'image');
      c.addCost(cost);
      persistUsage(c, p.id, 'image', 1, cost);
      return { dataUrl, demo: !!demo };
    } catch (e) {
      app.log.error(e);
      const msg = (e as Error).message ?? '';
      if (msg.includes('moderation') || msg.includes('403')) {
        return reply.code(400).send({ error: 'safety', message: '그 장면은 이미지로 만들 수 없었어. 다른 장면으로 표현해볼래? 🙂' });
      }
      return reply.code(502).send({ error: 'bad', message: '이미지 생성에 실패했어. 잠시 후 다시 시도해줘.' });
    }
  });

  app.post('/api/ai/lab', async (req, reply) => {
    const body = req.body as LabRequest;
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'lab')
      return reply.code(400).send({ error: 'bad', message: '실습을 찾을 수 없어.' });

    const safety = checkSafety(body.input ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    try {
      const r = await runLab(act.labType, body.input);
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(r.cost);
      persistUsage(c, p.id, 'lab', 1, r.cost);
      persistLabRun(c, p.id, act.labType, body.input, { configA: r.configA, configB: r.configB }, { outputA: r.outputA, outputB: r.outputB });
      return {
        outputA: r.outputA,
        outputB: r.outputB,
        labelA: act.labelA,
        labelB: act.labelB,
        configA: r.configA,
        configB: r.configB,
      };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: '실습 실행에 실패했어. 잠시 후 다시 시도해줘.' });
    }
  });

  // ── 덱 저작(빌더) — Phase 1부터 로그인 필수, 덱은 소유자에게 귀속 ──

  // 새 빈 덱 생성 → 코드+PIN 발급
  app.post('/api/decks', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    const body = (req.body ?? {}) as { title?: string };
    const id = makeDeckId();
    const pin = makePin();
    const deck = blankDeck(id, (body.title ?? '').slice(0, 80) || '새 강의');
    const ok = await insertDeckRow(deck, pin, user.id);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장소(Supabase)가 꺼져 있어 덱을 저장할 수 없어요. (.env 확인)' });
    registerDeck(deck);
    const res: CreateDeckResponse = { deckId: id, editPin: pin };
    return res;
  });

  // AI 생성: 주제 → 초안 덱 생성 후 저장
  app.post('/api/decks/generate', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    const body = (req.body ?? {}) as GenerateDeckRequest;
    if (!body.topic || !body.topic.trim()) return reply.code(400).send({ error: 'bad', message: '주제를 입력해줘!' });
    const id = makeDeckId();
    const pin = makePin();
    const deck = await generateDeck(body, id);
    const ok = await insertDeckRow(deck, pin, user.id);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장소가 꺼져 있어 저장할 수 없어요. (.env 확인)' });
    registerDeck(deck);
    return { deckId: id, editPin: pin };
  });

  // 내 강의 목록 (로그인 필수 — 내 덱만 보임)
  app.get('/api/decks', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    const list: DeckSummary[] = await listDeckRows(user.id);
    return list;
  });

  // 편집기 진입: PIN 검증 후 전체 덱(정답 포함) 반환
  app.post('/api/decks/:id/edit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { editPin?: string };

    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });

    if (row.edit_pin !== (body.editPin ?? '')) {
      return reply.code(403).send({ error: 'bad', message: '편집 암호가 달라요.' });
    }

    const res: DeckEditResponse = { deck: row.data, title: row.title };
    return res;
  });

  // 저장(통째 덮어쓰기): PIN 검증 + 검증/정규화
  app.put('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as SaveDeckRequest;

    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });

    if (row.edit_pin !== (body.editPin ?? '')) {
      return reply.code(403).send({ error: 'bad', message: '편집 권한이 없거나 암호가 다릅니다.' });
    }

    const deck = validateDeck(body.deck, id);
    const ok = await updateDeckRow(deck);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장에 실패했어요. 잠시 후 다시 시도해줘.' });
    registerDeck(deck);
    return { ok: true };
  });

  // 삭제: PIN 검증 후 덱과 (있다면) 업로드된 PDF 원본 파일까지 함께 삭제
  app.delete('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { editPin?: string };

    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });

    if (row.edit_pin !== (body.editPin ?? '')) {
      return reply.code(403).send({ error: 'bad', message: '편집 암호가 달라요.' });
    }

    const ok = await deleteDeckRow(id);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '삭제에 실패했어요. 잠시 후 다시 시도해줘.' });
    unregisterDeck(id);

    // 이 덱이 참조하던 업로드 PDF 원본도 정리 (여러 페이지 슬라이드가 같은 파일을 공유하므로 중복 제거)
    const pdfFilenames = new Set(
      (row.data.slides ?? [])
        .filter((s) => s.layout === 'pdf' && s.pdfUrl?.startsWith('/api/uploads/'))
        .map((s) => s.pdfUrl!.replace('/api/uploads/', '')),
    );
    for (const filename of pdfFilenames) {
      try { unlinkSync(resolve(uploadsDir, filename)); } catch { /* 이미 없거나 접근 불가하면 무시 */ }
    }

    return { ok: true };
  });

  // 업로드된 파일 다운로드/조회
  app.get('/api/uploads/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const filePath = resolve(uploadsDir, filename);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'notfound', message: '파일을 찾을 수 없습니다.' });
    }
    const buffer = readFileSync(filePath);
    if (filename.endsWith('.pdf')) {
      reply.header('Content-Type', 'application/pdf');
    }
    return reply.send(buffer);
  });

  // PDF 파일 업로드 및 덱 생성
  app.post('/api/decks/upload-pdf', async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    const body = (req.body ?? {}) as { filename: string; base64: string };
    if (!body.filename || !body.base64) {
      return reply.code(400).send({ error: 'bad', message: '파일명과 파일 데이터가 필요합니다.' });
    }
    if (!body.filename.toLowerCase().endsWith('.pdf')) {
      return reply.code(400).send({ error: 'bad', message: 'PDF 파일만 업로드할 수 있습니다.' });
    }

    try {
      const filename = `${randomUUID()}.pdf`;
      const filePath = resolve(uploadsDir, filename);
      const buffer = Buffer.from(body.base64, 'base64');
      writeFileSync(filePath, buffer);

      const pageCount = getPdfPageCount(buffer);
      const deckId = makeDeckId();
      const pin = makePin();
      
      const deckTitle = body.filename.replace(/\.[^/.]+$/, "").slice(0, 80);
      const slides = [];
      for (let i = 1; i <= pageCount; i++) {
        slides.push({
          id: `s_${Math.random().toString(36).slice(2, 10)}`,
          part: 1,
          partTitle: 'PDF 슬라이드',
          layout: 'pdf' as const,
          title: `${i}페이지`,
          pdfUrl: `/api/uploads/${filename}`,
          pageNumber: i,
          blocks: [],
          notes: '',
        });
      }

      const deck: Deck = {
        id: deckId,
        title: deckTitle || 'PDF 강의',
        slides,
        activities: {},
      };

      const ok = await insertDeckRow(deck, pin);
      if (!ok) {
        return reply.code(503).send({ error: 'bad', message: 'DB에 덱을 저장하는 데 실패했습니다.' });
      }
      registerDeck(deck);

      return { deckId, editPin: pin };
    } catch (e: any) {
      app.log.error(e);
      return reply.code(500).send({ error: 'bad', message: 'PDF 파일 처리 중 오류가 발생했습니다.' });
    }
  });

  // AI 강의 제작 조교 에이전트 대화
  app.post('/api/decks/chat-agent', async (req, reply) => {
    const body = (req.body ?? {}) as {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      deck: Deck;
      pdfText?: string;
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.code(400).send({ error: 'bad', message: '대화 내역(messages)이 유효하지 않습니다.' });
    }

    const deck = body.deck;
    const pdfText = body.pdfText ?? '';
    const chatOnly = body.messages.filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system');

    try {
      const result = await chatWithAgent({ deck, pdfText, messages: chatOnly });
      return result;
    } catch (e: any) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 조교 응답에 실패했습니다.' });
    }
  });

  // AI 슬라이드 자동 일괄 생성 — 위치 계획(plan) 후 항목별로 병렬 생성(generate)하는 2단계 파이프라인.
  // (단일 호출로 전체를 한번에 만들면 토큰 한도에 걸려 통째로 실패하는 문제가 있어 분리함)
  app.post('/api/decks/quick-generate', async (req, reply) => {
    const body = (req.body ?? {}) as { deck: Deck; pdfText?: string; type: QuickGenType; count: number };
    const validTypes: QuickGenType[] = ['quiz', 'poll', 'roleplay', 'analogy', 'writing', 'tutor'];
    if (!body.deck || !Array.isArray(body.deck.slides) || !validTypes.includes(body.type)) {
      return reply.code(400).send({ error: 'bad', message: '요청 형식이 올바르지 않습니다.' });
    }
    try {
      const result = await quickGenerate({ deck: body.deck, pdfText: body.pdfText ?? '', type: body.type, count: body.count });
      return result;
    } catch (e: any) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 슬라이드 생성에 실패했습니다.' });
    }
  });

  // AI 역할극 API
  app.post('/api/ai/roleplay', async (req, reply) => {
    const body = req.body as { token: string; sessionId: string; activityId: string; messages: any[] };
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
    const safety = checkSafety(lastUser?.content ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'roleplay') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없어.' });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    const sys = [
      { role: 'system' as const, content: `${act.systemPrompt}\n\n[미션 지침] 당신은 대화 중 학생이 특정 조건을 완료하도록 유도해야 합니다. 단, 인위적으로 정답 키워드를 알려주지 마세요. 학생의 미션: ${act.missionDescription}` }
    ];
    const history = (body.messages ?? []).slice(-10);

    try {
      const { text, cost } = await chatComplete([...sys, ...history]);
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(cost);
      persistUsage(c, p.id, 'roleplay', 1, cost);

      // 공백 무시 매칭: 키워드가 "병렬회로"로 생성돼도 AI 답변의 "병렬 회로"와 일치하도록 (반대 방향도 동일)
      const normalizeForMatch = (s: string) => s.toLowerCase().replace(/\s+/g, '');
      const cleared = act.missionKeyword && normalizeForMatch(text).includes(normalizeForMatch(act.missionKeyword));
      return { reply: text, missionClear: cleared };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 조교 응답에 실패했습니다.' });
    }
  });

  // 눈높이 비유 API
  app.post('/api/ai/analogy', async (req, reply) => {
    const body = req.body as { token: string; sessionId: string; activityId: string; topic: string };
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const safety = checkSafety(body.topic ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'analogy') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없어.' });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    const sys = [
      {
        role: 'system' as const,
        content: `너는 개념을 대조적으로 재미있게 설명해 주는 비유 학습 튜터야.
사용자가 용어나 개념을 입력하면, 다음 두 가지 캐릭터의 눈높이에 맞춰 친근한 비유로 설명해 줘.

캐릭터 A: ${act.personaA}
캐릭터 B: ${act.personaB}

답변은 반드시 아래의 JSON 형식으로만 응답해줘. 다른 텍스트는 일체 포함하지 마.
{
  "explanationA": "A 캐릭터의 3줄 비유 설명",
  "explanationB": "B 캐릭터의 3줄 비유 설명"
}`
      }
    ];

    try {
      const { text, cost } = await chatComplete([...sys, { role: 'user', content: body.topic }], { temperature: 0.7 });
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(cost);
      persistUsage(c, p.id, 'analogy', 1, cost);

      let explanationA = '비유를 생성할 수 없습니다.';
      let explanationB = '비유를 생성할 수 없습니다.';
      try {
        const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());
        explanationA = parsed.explanationA;
        explanationB = parsed.explanationB;
      } catch {
        explanationA = text;
      }

      return { explanationA, explanationB };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 응답에 실패했습니다.' });
    }
  });

  // 문학 창작 API
  app.post('/api/ai/writing', async (req, reply) => {
    const body = req.body as { token: string; sessionId: string; activityId: string; input: string; genre: string };
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const safety = checkSafety(body.input ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'writing') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없어.' });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    const genreText = body.genre === 'poem' ? '감성적이고 운율이 있는 짧은 시' : body.genre === 'story' ? '기승전결이 있는 흥미로운 극적 초단편 소설' : '자신의 생각을 논리적이고 친근하게 풀어낸 에세이 수필';
    const sys = [
      {
        role: 'system' as const,
        content: `너는 청소년을 위한 문학 창작을 돕는 감성 풍부한 AI 작가야.
사용자가 주제 키워드나 첫 문장을 입력하면, 그에 어울리는 아름다운 ${genreText}를 지어줘.
가독성이 좋게 적당한 줄바꿈을 포함하되 너무 길지 않게 250자 내외로 창작해 줘. 존댓말로 친근하게 인사말은 덧붙이지 말고 작품 본문만 즉시 작성해.`
      }
    ];

    try {
      const { text, cost } = await chatComplete([...sys, { role: 'user', content: body.input }], { temperature: 0.8 });
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(cost);
      persistUsage(c, p.id, 'writing', 1, cost);
      return { output: text };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 응답에 실패했습니다.' });
    }
  });

  // AI 튜터 API
  app.post('/api/ai/tutor', async (req, reply) => {
    const body = req.body as { token: string; sessionId: string; activityId: string; input: string };
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없어.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: '먼저 강의실에 입장해줘!' });

    const safety = checkSafety(body.input ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'tutor') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없어.' });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    const subjectText = act.subject === 'math' ? '수학 문제 풀이' : act.subject === 'coding' ? '프로그래밍 코드' : '학습 문제';
    const sys = [
      {
        role: 'system' as const,
        content: `너는 학생의 자기주도적 문제 해결을 돕는 친절한 AI 소크라테스 튜터야.
학생이 ${subjectText}에 관한 문제나 풀이, 코드 질문을 제출할 거야.

[절대 규칙]
1. 정답이나 올바른 소스 코드를 직접 제공해서는 안 돼.
2. 어느 부분에 오류가 있거나, 어떤 공식을/원리를 적용해야 하는지 단계별 생각할 수 있는 '힌트'나 '가이드 질문'만 3줄 이내로 대답해줘.
3. 존댓말로 친절하게 조언해 줘.`
      }
    ];

    try {
      const { text, cost } = await chatComplete([...sys, { role: 'user', content: body.input }], { temperature: 0.5 });
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(cost);
      persistUsage(c, p.id, 'tutor', 1, cost);
      return { hint: text };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 응답에 실패했습니다.' });
    }
  });

  // 강의실 리포트 API (강사 전용)
  app.get('/api/classrooms/:id/report', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { secret } = req.query as { secret: string };
    if (!supabase) {
      return reply.code(503).send({ error: 'bad', message: '데이터베이스가 비활성화되어 있습니다.' });
    }

    try {
      // 1. 강의실 조회 및 검증
      const { data: classroom, error: classroomErr } = await supabase
        .from('axedu_classrooms')
        .select('*')
        .eq('id', id)
        .single();

      if (classroomErr || !classroom) {
        return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
      }

      if (classroom.instructor_secret !== secret) {
        return reply.code(403).send({ error: 'unauthorized', message: '권한이 없습니다.' });
      }

      // 2. 덱 정보 로드
      const deck = (await ensureDeckLoaded(classroom.deck_id)) ?? getDeck(classroom.deck_id);

      // 3. 관련 데이터 병렬 조회
      const [
        { data: participants },
        { data: quizResponses },
        { data: pollResponses },
        { data: aiUsages },
        { data: labRuns }
      ] = await Promise.all([
        supabase.from('axedu_participants').select('*').eq('classroom_id', id),
        supabase.from('axedu_quiz_responses').select('*').eq('classroom_id', id),
        supabase.from('axedu_poll_responses').select('*').eq('classroom_id', id),
        supabase.from('axedu_ai_usage').select('*').eq('classroom_id', id),
        supabase.from('axedu_lab_runs').select('*').eq('classroom_id', id)
      ]);

      const parts = participants ?? [];
      const quizzes = quizResponses ?? [];
      const polls = pollResponses ?? [];
      const usages = aiUsages ?? [];
      const labs = labRuns ?? [];

      const participantMap = new Map(parts.map((p) => [p.id, p]));

      // 4. AI 사용량 집계
      let totalCost = 0;
      let safetyBlocks = 0;
      const aiTypeCounts: Record<string, number> = {};

      usages.forEach((u) => {
        totalCost += Number(u.est_cost ?? 0);
        if (u.type === 'blocked') {
          safetyBlocks += 1;
        } else {
          aiTypeCounts[u.type] = (aiTypeCounts[u.type] || 0) + (u.units || 1);
        }
      });

      // 참가자별 AI 사용량 요약
      const participantAiMap: Record<string, { chat: number; image: number; analogy: number; roleplay: number; writing: number; tutor: number; cost: number }> = {};
      usages.forEach((u) => {
        if (!u.participant_id) return;
        const part = participantMap.get(u.participant_id);
        if (!part) return;
        if (!participantAiMap[part.nickname]) {
          participantAiMap[part.nickname] = { chat: 0, image: 0, analogy: 0, roleplay: 0, writing: 0, tutor: 0, cost: 0 };
        }
        const pData = participantAiMap[part.nickname];
        if (u.type === 'chat') pData.chat += u.units;
        else if (u.type === 'image') pData.image += u.units;
        else if (u.type === 'analogy') pData.analogy += u.units;
        else if (u.type === 'roleplay') pData.roleplay += u.units;
        else if (u.type === 'writing') pData.writing += u.units;
        else if (u.type === 'tutor') pData.tutor += u.units;
        pData.cost += Number(u.est_cost ?? 0);
      });

      // 5. 퀴즈 결과 집계
      const quizSummary: Record<string, any> = {};
      if (deck) {
        Object.values(deck.activities).forEach((act: any) => {
          if (act.type === 'quiz') {
            act.questions.forEach((q: any) => {
              quizSummary[q.id] = {
                questionText: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
                totalAnswers: 0,
                correctAnswers: 0,
                correctRate: 0,
                answers: {},
                studentDetails: []
              };
            });
          }
        });
      }

      quizzes.forEach((qr) => {
        let qStat = quizSummary[qr.question_id];
        if (!qStat) {
          qStat = {
            questionText: '삭제된 문제',
            options: [],
            correctIndex: -1,
            totalAnswers: 0,
            correctAnswers: 0,
            correctRate: 0,
            answers: {},
            studentDetails: []
          };
          quizSummary[qr.question_id] = qStat;
        }

        qStat.totalAnswers += 1;
        if (qr.is_correct) {
          qStat.correctAnswers += 1;
        }

        const ansKey = qr.answer ?? '';
        qStat.answers[ansKey] = (qStat.answers[ansKey] || 0) + 1;

        const part = participantMap.get(qr.participant_id);
        qStat.studentDetails.push({
          nickname: part?.nickname ?? '알 수 없음',
          answer: qr.answer,
          isCorrect: qr.is_correct,
          responseMs: qr.response_ms,
          points: qr.points
        });
      });

      Object.keys(quizSummary).forEach((qid) => {
        const q = quizSummary[qid];
        if (q.totalAnswers > 0) {
          q.correctRate = Math.round((q.correctAnswers / q.totalAnswers) * 100);
        }
      });

      // 6. 투표 결과 집계
      const pollSummary: Record<string, any> = {};
      if (deck) {
        Object.values(deck.activities).forEach((act: any) => {
          if (act.type === 'poll') {
            pollSummary[act.id] = {
              prompt: act.prompt,
              mode: act.mode,
              options: act.options ?? [],
              totalVotes: 0,
              votes: {},
              studentDetails: []
            };
          }
        });
      }

      polls.forEach((pr) => {
        let pStat = pollSummary[pr.activity_id];
        if (!pStat) {
          pStat = {
            prompt: '삭제된 투표',
            mode: 'choice',
            options: [],
            totalVotes: 0,
            votes: {},
            studentDetails: []
          };
          pollSummary[pr.activity_id] = pStat;
        }

        pStat.totalVotes += 1;
        const val = pr.value ?? '';
        pStat.votes[val] = (pStat.votes[val] || 0) + 1;

        const part = participantMap.get(pr.participant_id);
        pStat.studentDetails.push({
          nickname: part?.nickname ?? '알 수 없음',
          value: val
        });
      });

      // 7. 비교 실습(Lab) 집계
      const labSummary = labs.map((l) => {
        const part = participantMap.get(l.participant_id);
        return {
          nickname: part?.nickname ?? '알 수 없음',
          labType: l.lab_type,
          input: l.input,
          config: l.config,
          output: l.output,
          createdAt: l.created_at
        };
      });

      return {
        classroom: {
          id: classroom.id,
          token: classroom.token,
          deckId: classroom.deck_id,
          title: classroom.title,
          status: classroom.status,
          createdAt: classroom.created_at
        },
        deckSummary: deck ? {
          id: deck.id,
          title: deck.title,
          slideCount: deck.slides.length
        } : null,
        stats: {
          totalParticipants: parts.length,
          totalCost: Number(totalCost.toFixed(5)),
          safetyBlocks,
          aiTypeCounts
        },
        participants: parts.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score,
          joinedAt: p.joined_at
        })),
        quizSummary,
        pollSummary,
        labSummary,
        participantAiUsages: Object.entries(participantAiMap).map(([nickname, data]) => ({
          nickname,
          ...data,
          cost: Number(data.cost.toFixed(5))
        }))
      };
    } catch (e) {
      app.log.error(e);
      return reply.code(500).send({ error: 'bad', message: '리포트 집계 중 서버 오류가 발생했습니다.' });
    }
  });
}
