import type { FastifyInstance } from 'fastify';
import type { ChatRequest, ImageRequest, LabRequest, CreateClassroomResponse, GenerateDeckRequest, Deck } from '../../shared/types';
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
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { supabase } from './db';

async function getUserFromRequest(req: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  if (!supabase) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

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

  // ── 회원가입 & 로그인 ──
  app.post('/api/auth/signup', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.code(400).send({ error: 'bad', message: '이메일과 비밀번호를 입력해주세요.' });
    }
    if (!supabase) {
      return reply.code(503).send({ error: 'bad', message: '데이터베이스가 비활성화되어 있습니다.' });
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
      });
      if (error) throw error;
      return {
        user: data.user,
        session: data.session,
      };
    } catch (e: any) {
      return reply.code(400).send({ error: 'bad', message: e.message ?? '회원가입 실패' });
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.code(400).send({ error: 'bad', message: '이메일과 비밀번호를 입력해주세요.' });
    }
    if (!supabase) {
      return reply.code(503).send({ error: 'bad', message: '데이터베이스가 비활성화되어 있습니다.' });
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
      if (error) throw error;
      return {
        user: data.user,
        session: data.session,
      };
    } catch (e: any) {
      return reply.code(400).send({ error: 'bad', message: e.message ?? '로그인 실패' });
    }
  });

  app.post('/api/auth/me', async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: '로그인이 필요합니다.' });
    return { user: { email: user.email } };
  });

  // ── 덱 저작(빌더) ──

  // 새 빈 덱 생성 → 코드+PIN 발급
  app.post('/api/decks', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string };
    const user = await getUserFromRequest(req);
    const id = makeDeckId();
    const pin = makePin();
    const deck = blankDeck(id, (body.title ?? '').slice(0, 80) || '새 강의');
    const ok = await insertDeckRow(deck, pin, user?.id);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장소(Supabase)가 꺼져 있어 덱을 저장할 수 없어요. (.env 확인)' });
    registerDeck(deck);
    const res: CreateDeckResponse = { deckId: id, editPin: pin };
    return res;
  });

  // AI 생성: 주제 → 초안 덱 생성 후 저장
  app.post('/api/decks/generate', async (req, reply) => {
    const body = (req.body ?? {}) as GenerateDeckRequest;
    if (!body.topic || !body.topic.trim()) return reply.code(400).send({ error: 'bad', message: '주제를 입력해줘!' });
    const user = await getUserFromRequest(req);
    const id = makeDeckId();
    const pin = makePin();
    const deck = await generateDeck(body, id);
    const ok = await insertDeckRow(deck, pin, user?.id);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장소가 꺼져 있어 저장할 수 없어요. (.env 확인)' });
    registerDeck(deck);
    return { deckId: id, editPin: pin };
  });

  // 내 덱 요약 목록
  app.get('/api/decks', async (req) => {
    const user = await getUserFromRequest(req);
    const list: DeckSummary[] = await listDeckRows(user?.id);
    return list;
  });

  // 편집기 진입: PIN 검증 후 전체 덱(정답 포함) 반환
  app.post('/api/decks/:id/edit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { editPin?: string };
    const user = await getUserFromRequest(req);
    const userId = user?.id;

    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });

    const isOwner = row.user_id && row.user_id === userId;
    if (!isOwner && row.edit_pin !== (body.editPin ?? '')) {
      return reply.code(403).send({ error: 'bad', message: '편집 암호가 달라요.' });
    }

    const res: DeckEditResponse = { deck: row.data, title: row.title };
    return res;
  });

  // 저장(통째 덮어쓰기): PIN 검증 + 검증/정규화
  app.put('/api/decks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as SaveDeckRequest;
    const user = await getUserFromRequest(req);
    const userId = user?.id;

    const row = await loadDeckRow(id);
    if (!row) return reply.code(404).send({ error: 'notfound', message: '덱을 찾을 수 없어요.' });

    const isOwner = row.user_id && row.user_id === userId;
    if (!isOwner && row.edit_pin !== (body.editPin ?? '')) {
      return reply.code(403).send({ error: 'bad', message: '편집 권한이 없거나 암호가 다릅니다.' });
    }

    const deck = validateDeck(body.deck, id);
    const targetUserId = row.user_id ? row.user_id : (userId || null);
    const ok = await updateDeckRow(deck, targetUserId);
    if (!ok) return reply.code(503).send({ error: 'bad', message: '저장에 실패했어요. 잠시 후 다시 시도해줘.' });
    registerDeck(deck);
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

      const user = await getUserFromRequest(req);
      const ok = await insertDeckRow(deck, pin, user?.id);
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
    const pdfText = body.pdfText ?? '추출된 PDF 텍스트가 없습니다.';

    const systemPrompt = `너는 강사의 강의 자료 제작 및 보강을 돕는 유능한 'AI 교수 조교' 에이전트야.
현재 편집 중인 강의 자료(Deck) 정보와 업로드된 PDF 슬라이드의 텍스트 내용이 제공되어 있어.

[현재 강의 자료 정보]
- 제목: ${deck.title}
- 현재 슬라이드 목록:
${deck.slides.map((s, idx) => `  ${idx + 1}. [ID: ${s.id}] layout: ${s.layout}, title: "${s.title ?? ''}", activityId: "${s.activityId ?? ''}"`).join('\n')}

[업로드된 PDF 내용]
${pdfText}

[중요 지시사항]
1. 강사의 요청에 따라 강의 자료에 퀴즈(Quiz), 투표(Poll), 역할극(Roleplay), 비유(Analogy), 문학창작(Writing), 튜터(Tutor) 실습 슬라이드를 추가할 수 있어.
2. 실습 슬라이드를 추가하려면 답변 끝부분에 반드시 \`\`\`json ... \`\`\` 마크다운 코드 블록 형태로 변경 명령(operations) 목록을 작성해 줘.
3. 슬라이드 뒤에 추가할 위치를 나타내는 'afterSlideIndex'는 0부터 시작하는 슬라이드 인덱스야. (예: 1번째 슬라이드 뒤는 afterSlideIndex: 0)
4. 각 활동(activity)의 스키마 규칙:
   - 퀴즈(type: "add_quiz"): activity 내부에 title, questions(배열)를 가져야 해. 각 질문은 question, options(2~4개), correctIndex(정답 번호), timeLimitSec(제한시간), explanation(해설)을 가져야 해.
   - 투표(type: "add_poll"): activity 내부에 title, prompt, mode("choice" 또는 "wordcloud"), options(choice인 경우 보기 배열)를 가져야 해.
   - 역할극(type: "add_roleplay"): activity 내부에 title, intro, systemPrompt, missionKeyword(성공 조건 단어), missionDescription(미션 가이드)을 가져야 해.
   - 비유대조(type: "add_analogy"): activity 내부에 title, intro, topicPlaceholder(힌트), personaA, personaB를 가져야 해.
   - 문학창작(type: "add_writing"): activity 내부에 title, intro, genre("poem" | "story" | "essay"), promptPlaceholder를 가져야 해.
   - AI튜터(type: "add_tutor"): activity 내부에 title, intro, subject("math" | "coding" | "general"), taskDescription을 가져야 해.
5. 한국 고등학생 대상 수업이므로, 실습 구성 및 질문은 PDF 텍스트 내용을 바탕으로 흥미롭고 유익하며 너무 난해하지 않은 수준으로 생성해줘.
6. 친근하고 공손하게 존댓말로 설명하되, 변경 명령은 예시 JSON 포맷을 완벽하게 준수해서 작성해야 해.

[변경 명령 JSON 예시]
\`\`\`json
{
  "operations": [
    {
      "type": "add_quiz",
      "afterSlideIndex": 2,
      "activity": {
        "title": "인공지능 윤리 퀴즈",
        "questions": [
          {
            "question": "다음 중 생성형 AI 사용 시 저작권 침해 우려가 없는 행동은?",
            "options": [
              "남의 소설을 복사하여 내 책으로 출판하기",
              "상업용 폰트를 무단 배포하기",
              "오픈 소스 무료 사용 허가(라이선스) 범위 안에서 코드를 활용하기",
              "허락 없이 인기 음악을 유튜브 배경음으로 사용하기"
            ],
            "correctIndex": 2,
            "timeLimitSec": 20,
            "explanation": "오픈 소스의 경우 정해진 라이선스 허용 범위 내에서 정당하게 활용하면 저작권 침해 우려가 없습니다."
          }
        ]
      }
    },
    {
      "type": "add_roleplay",
      "afterSlideIndex": 4,
      "activity": {
        "title": "세종대왕 한글 창제 역할극",
        "intro": "세종대왕을 설득해 보세요.",
        "systemPrompt": "너는 조선의 국왕 세종대왕이다. 한글 창제를 반대하는 주장에 맞서, 백성들을 향한 애민정신과 한글의 과학적 이점을 설명하라.",
        "missionKeyword": "애민정신",
        "missionDescription": "대화 중 세종대왕이 한글의 창제 이면에 담긴 '애민정신'이라는 단어를 말하도록 유도하세요."
      }
    }
  ]
}
\`\`\``;

    // Prepend or replace the system message
    const formattedMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...body.messages.filter((m) => m.role !== 'system')
    ];

    try {
      const { text } = await chatComplete(formattedMessages, { temperature: 0.6, maxTokens: 2048 });
      return { text };
    } catch (e: any) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: 'AI 조교 응답에 실패했습니다.' });
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

      const cleared = act.missionKeyword && text.toLowerCase().includes(act.missionKeyword.toLowerCase());
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
