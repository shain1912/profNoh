import type { FastifyInstance } from 'fastify';
import type { ChatRequest, ImageRequest, LabRequest, CreateClassroomResponse, GenerateDeckRequest } from '../../shared/types';
import { createClassroom, getByToken } from './state';
import { getDeck, toPublicDeck, getActivity, ensureDeckLoaded, registerDeck } from './decks';
import { validateDeck, blankDeck, makeDeckId, makePin } from './decks/validate';
import { loadDeckRow, insertDeckRow, updateDeckRow, listDeckRows } from './decks/store';
import type { SaveDeckRequest, CreateDeckResponse, DeckEditResponse, DeckSummary } from '../../shared/types';
import { checkSafety, safeImagePrompt } from './ai/safety';
import { chatComplete, type ChatMessage } from './ai/minimax';
import { generateImage } from './ai/stability';
import { runLab } from './ai/lab';
import { generateDeck } from './ai/generateDeck';
import { persistClassroom, persistUsage, persistLabRun } from './persist';

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
    if (!safety.ok) return reply.code(400).send({ error: 'safety', message: safety.message });

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
    if (!safety.ok) return reply.code(400).send({ error: 'safety', message: safety.message });

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
    if (!safety.ok) return reply.code(400).send({ error: 'safety', message: safety.message });

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
    const deck = validateDeck(body.deck, id);
    const ok = await updateDeckRow(deck);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장에 실패했어요. 잠시 후 다시 시도해줘.' });
    registerDeck(deck);
    return { ok: true };
  });
}
