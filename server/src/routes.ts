import type { FastifyInstance } from 'fastify';
import type { ChatRequest, ImageRequest, LabRequest, CreateClassroomRequest, CreateClassroomResponse, ClassroomInfoResponse, GenerateDeckRequest, Deck } from '../../shared/types';
import { buildReport } from './report';
import { createClassroom, getByToken, normalizeMode } from './state';
import { getSessionUser } from './auth/session';
import { canCreateDeck } from './billing/gate';
import { getDeck, toPublicDeck, getActivity, ensureDeckLoaded, registerDeck, unregisterDeck } from './decks';
import { validateDeck, blankDeck, makeDeckId, makePin } from './decks/validate';
import { loadDeckRow, insertDeckRow, updateDeckRow, deleteDeckRow, listDeckRows } from './decks/store';
import type { SaveDeckRequest, CreateDeckResponse, DeckEditResponse, DeckSummary } from '../../shared/types';
import { checkSafety, safeImagePrompt } from './ai/safety';
import { chatComplete, type ChatMessage } from './ai/minimax';
import { generateImage } from './ai/stability';
import { runLab } from './ai/lab';
import { classroomMode, msg, audiencePrompt } from './copy';
import { generateDeck } from './ai/generateDeck';
import { quickGenerate, chatWithAgent, type QuickGenType } from './ai/deckAgent';
import { GEN_TYPES } from './ai/activitySpecs';
import { persistClassroom, persistUsage, persistLabRun } from './persist';
import { writeFileSync, existsSync, unlinkSync, statSync, createReadStream } from 'node:fs';
import { renderPdfToWebp } from './pdf/render';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { supabase } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(here, '../../uploads');

// 경로별 rate limit (IP당) — 전역 상한(index.ts)보다 엄격한 비싼 경로들. 강사 1명이 사람 손으로는 넘지 못하는 값 (R3 §2.6)
const RL = {
  classroomCreate: { max: 20, timeWindow: '1 minute' },
  upload: { max: 10, timeWindow: '1 minute' },        // PDF/이미지 업로드 (본문 최대 50MB)
  deckCreate: { max: 30, timeWindow: '1 minute' },
  aiGenerate: { max: 20, timeWindow: '1 minute' },    // AI 덱 생성·에이전트 (외부 API 비용)
} as const;

// 이미지 슬라이드 업로드 허용 확장자
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

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
  // 헬스체크 (모니터링 폴링은 rate limit 제외)
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({ ok: true }));

  // 강의실 생성 (강사) — 로그인 없이 호출 가능하므로 IP당 분당 상한 (R3 §2.6)
  app.post('/api/classrooms', { config: { rateLimit: RL.classroomCreate } }, async (req, reply) => {
    const body = (req.body ?? {}) as CreateClassroomRequest;
    const deckId = body.deckId ?? 'ai-ax-4h';
    const deck = (await ensureDeckLoaded(deckId)) ?? getDeck(deckId);
    if (!deck) return reply.code(400).send({ error: 'bad', message: '존재하지 않는 덱입니다.' });
    // mode: classroom(기본) | auditorium(강당) — 알 수 없는 값은 classroom
    const c = createClassroom(deckId, body.title ?? deck.title, { mode: normalizeMode(body.mode) });
    // 세션 익명 정책 / 결과 공개 방식 — 강의 시작 UI에서 선택 (기본 named_default / after_close)
    if (body.settings) c.updateSettings(body.settings);
    await persistClassroom(c); // 강의실을 먼저 기록(참가자 FK 보장)
    const res: CreateClassroomResponse = {
      classroomId: c.id,
      token: c.token,
      instructorSecret: c.instructorSecret,
      deckId: c.deckId,
      mode: c.mode,
    };
    return res;
  });

  // 강의실 정보 (학생 입장 화면) — mode 로 /join 이 닉네임 자동 생성·카피를 결정
  app.get('/api/classrooms/:token', async (req) => {
    const { token } = req.params as { token: string };
    const c = getByToken(token);
    const res: ClassroomInfoResponse = c
      ? { exists: true, title: c.title, status: c.status, mode: c.mode, anonymity: c.settings.anonymity, resultsReveal: c.settings.resultsReveal }
      : { exists: false };
    return res;
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
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

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
        : [{ role: 'system', content: audiencePrompt(classroomMode(c)) }];
    const history = (body.messages ?? []).slice(-10) as ChatMessage[];

    try {
      const { text, cost } = await chatComplete([...sys, ...history]);
      c.countUsage(body.sessionId, body.activityId, 'chat');
      c.addCost(cost);
      persistUsage(c, p.id, 'chat', 1, cost);
      return { reply: text };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: 'bad', message: msg(c, 'aiFailed') });
    }
  });

  app.post('/api/ai/image', async (req, reply) => {
    const body = req.body as ImageRequest;
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

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
      const emsg = (e as Error).message ?? '';
      if (emsg.includes('moderation') || emsg.includes('403')) {
        return reply.code(400).send({ error: 'safety', message: msg(c, 'imageBlocked') });
      }
      return reply.code(502).send({ error: 'bad', message: msg(c, 'imageFailed') });
    }
  });

  app.post('/api/ai/lab', async (req, reply) => {
    const body = req.body as LabRequest;
    const c = getByToken(body.token);
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'lab')
      return reply.code(400).send({ error: 'bad', message: msg(c, 'labNotFound') });

    const safety = checkSafety(body.input ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const quota = c.checkUsage(body.sessionId, body.activityId, 'chat');
    if (!quota.ok) return reply.code(429).send({ error: 'quota', message: quota.message });

    try {
      const r = await runLab(act.labType, body.input, classroomMode(c));
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
      return reply.code(502).send({ error: 'bad', message: msg(c, 'labFailed') });
    }
  });

  // ── 덱 저작(빌더) — Phase 1부터 로그인 필수, 덱은 소유자에게 귀속 ──

  // 새 빈 덱 생성 → 코드+PIN 발급
  app.post('/api/decks', { config: { rateLimit: RL.deckCreate } }, async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    // plan gating (TASK C): free 플랜은 덱 3개 제한 — 위반 시 402 + 업그레이드 안내
    const gate = await canCreateDeck(user);
    if (!gate.ok) return reply.code(402).send({ error: 'plan_limit', message: gate.message, plan: gate.plan, used: gate.used, limit: gate.limit });
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
  app.post('/api/decks/generate', { config: { rateLimit: RL.aiGenerate } }, async (req, reply) => {
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

    // 이 덱이 참조하던 업로드 원본(PDF·이미지)도 정리 (여러 슬라이드가 같은 파일을 공유하므로 중복 제거)
    const pdfFilenames = new Set(
      (row.data.slides ?? [])
        .flatMap((s) => [s.pdfUrl, s.imageUrl])
        .filter((u): u is string => !!u && u.startsWith('/api/uploads/'))
        .map((u) => u.replace('/api/uploads/', '')),
    );
    for (const filename of pdfFilenames) {
      try { unlinkSync(resolve(uploadsDir, filename)); } catch { /* 이미 없거나 접근 불가하면 무시 */ }
    }

    return { ok: true };
  });

  // 업로드된 파일 다운로드/조회 — 이미지 슬라이드는 참가자 400명이 장당 요청하므로 전역 상한에서 제외
  // - 파일명은 UUID 라 내용이 바뀌지 않으므로 1년 immutable 캐시 + ETag(304) 로 재입장·페이지 이동 시 재전송을 막는다
  // - readFileSync 전량 버퍼 대신 스트림 응답 (30MB PDF × 동시 수백 요청이 힙에 쌓이지 않도록)
  // - Range 요청 지원 → 레거시 PDF 덱에서 pdf.js 가 필요한 바이트 구간만 받아갈 수 있다
  app.get('/api/uploads/:filename', { config: { rateLimit: false } }, async (req, reply) => {
    const { filename } = req.params as { filename: string };
    if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes('..')) {
      return reply.code(400).send({ error: 'bad', message: '잘못된 파일명입니다.' });
    }
    const filePath = resolve(uploadsDir, filename);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'notfound', message: '파일을 찾을 수 없습니다.' });
    }
    const st = statSync(filePath);
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : IMAGE_MIME[ext] ?? 'application/octet-stream';
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;

    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('ETag', etag);
    reply.header('Last-Modified', st.mtime.toUTCString());
    reply.header('Accept-Ranges', 'bytes');

    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').map((v) => v.trim()).includes(etag)) {
      return reply.code(304).send();
    }

    // 단일 Range(bytes=start-end | bytes=start- | bytes=-suffix) 만 지원
    const range = req.headers.range;
    if (range && /^bytes=/.test(range) && !range.includes(',')) {
      const [a, b] = range.slice(6).split('-');
      let start = a ? parseInt(a, 10) : NaN;
      let end = b ? parseInt(b, 10) : st.size - 1;
      if (!a && b) { start = Math.max(0, st.size - parseInt(b, 10)); end = st.size - 1; }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= st.size) {
        reply.header('Content-Range', `bytes */${st.size}`);
        return reply.code(416).send();
      }
      end = Math.min(end, st.size - 1);
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${st.size}`);
      reply.header('Content-Length', String(end - start + 1));
      return reply.send(createReadStream(filePath, { start, end }));
    }

    reply.header('Content-Length', String(st.size));
    return reply.send(createReadStream(filePath));
  });

  // PDF 파일 업로드 및 덱 생성 (50MB 본문 — IP당 분당 상한)
  app.post('/api/decks/upload-pdf', { config: { rateLimit: RL.upload } }, async (req, reply) => {
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

      const deckId = makeDeckId();
      const pin = makePin();

      const deckTitle = body.filename.replace(/\.[^/.]+$/, "").slice(0, 80);
      const pdfUrl = `/api/uploads/${filename}`;
      const slides: Deck['slides'] = [];
      let rendered = false;

      // 1) 서버 사전 렌더: 페이지별 webp → 이미지 슬라이드.
      //    참가자는 원본 PDF 대신 현재 페이지 webp(~100KB) 1장만 받고, pdf.js 도 필요 없다.
      //    pdfUrl·pageNumber 는 출처로 남겨 편집기의 PDF 텍스트 추출·원본 삭제 정리에 쓴다.
      try {
        const r = await renderPdfToWebp(filePath, uploadsDir, filename.replace(/\.pdf$/, ''));
        r.files.forEach((f, i) => {
          slides.push({
            id: `s_${Math.random().toString(36).slice(2, 10)}`,
            part: 1,
            partTitle: 'PDF 슬라이드',
            layout: 'image' as const,
            title: `${i + 1}페이지`,
            imageUrl: `/api/uploads/${f}`,
            pdfUrl,
            pageNumber: i + 1,
            blocks: [],
            notes: '',
          });
        });
        rendered = true;
        app.log.info(`[pdf] 사전 렌더 ${r.files.length}/${r.pageCount}p ${r.ms}ms ${filename}${r.truncated ? ' (상한 초과 잘림)' : ''}`);
      } catch (e: any) {
        // 2) 레거시 경로: 암호화·손상 등으로 서버 렌더가 안 되면 기존처럼 클라이언트 pdf.js 렌더 슬라이드
        app.log.warn(`[pdf] 사전 렌더 실패 → 레거시 pdf 슬라이드로 폴백: ${e?.message ?? e}`);
        const pageCount = getPdfPageCount(buffer);
        for (let i = 1; i <= pageCount; i++) {
          slides.push({
            id: `s_${Math.random().toString(36).slice(2, 10)}`,
            part: 1,
            partTitle: 'PDF 슬라이드',
            layout: 'pdf' as const,
            title: `${i}페이지`,
            pdfUrl,
            pageNumber: i,
            blocks: [],
            notes: '',
          });
        }
      }

      const deck: Deck = {
        id: deckId,
        title: deckTitle || 'PDF 강의',
        slides,
        activities: {},
      };

      const ok = await insertDeckRow(deck, pin);
      if (!ok) {
        for (const sl of slides) {
          const f = sl.imageUrl?.replace('/api/uploads/', '');
          if (f) { try { unlinkSync(resolve(uploadsDir, f)); } catch { /* 무시 */ } }
        }
        try { unlinkSync(filePath); } catch { /* 무시 */ }
        return reply.code(503).send({ error: 'bad', message: 'DB에 덱을 저장하는 데 실패했습니다.' });
      }
      registerDeck(deck);

      return { deckId, editPin: pin, slideCount: slides.length, rendered };
    } catch (e: any) {
      app.log.error(e);
      return reply.code(500).send({ error: 'bad', message: 'PDF 파일 처리 중 오류가 발생했습니다.' });
    }
  });

  // 이미지 여러 장 업로드 → 순서대로 이미지 슬라이드 덱 생성 (PDF 대비 고화질 대안)
  app.post('/api/decks/upload-images', { config: { rateLimit: RL.upload } }, async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'auth', message: '로그인이 필요합니다.' });
    const body = (req.body ?? {}) as { title?: string; images?: Array<{ filename: string; base64: string }> };
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0) {
      return reply.code(400).send({ error: 'bad', message: '이미지 파일이 필요합니다.' });
    }
    if (images.length > 100) {
      return reply.code(400).send({ error: 'bad', message: '이미지는 한 번에 100장까지 업로드할 수 있습니다.' });
    }
    for (const img of images) {
      const ext = (img.filename ?? '').slice((img.filename ?? '').lastIndexOf('.')).toLowerCase();
      if (!img.filename || !img.base64 || !IMAGE_MIME[ext]) {
        return reply.code(400).send({ error: 'bad', message: '이미지 파일(png/jpg/webp/gif)만 업로드할 수 있습니다.' });
      }
    }

    const savedFiles: string[] = [];
    try {
      const slides = images.map((img, i) => {
        const ext = img.filename.slice(img.filename.lastIndexOf('.')).toLowerCase();
        const filename = `${randomUUID()}${ext}`;
        writeFileSync(resolve(uploadsDir, filename), Buffer.from(img.base64, 'base64'));
        savedFiles.push(filename);
        return {
          id: `s_${Math.random().toString(36).slice(2, 10)}`,
          part: 1,
          partTitle: '이미지 슬라이드',
          layout: 'image' as const,
          title: img.filename.replace(/\.[^/.]+$/, '').slice(0, 80) || `${i + 1}번 슬라이드`,
          imageUrl: `/api/uploads/${filename}`,
          blocks: [],
          notes: '',
        };
      });

      const deckId = makeDeckId();
      const pin = makePin();
      const deck: Deck = {
        id: deckId,
        title: (body.title ?? '').trim().slice(0, 80) || '이미지 강의',
        slides,
        activities: {},
      };

      const ok = await insertDeckRow(deck, pin, user.id);
      if (!ok) {
        for (const f of savedFiles) { try { unlinkSync(resolve(uploadsDir, f)); } catch { /* 무시 */ } }
        return reply.code(503).send({ error: 'bad', message: 'DB에 덱을 저장하는 데 실패했습니다.' });
      }
      registerDeck(deck);
      return { deckId, editPin: pin, slideCount: slides.length };
    } catch (e: any) {
      app.log.error(e);
      for (const f of savedFiles) { try { unlinkSync(resolve(uploadsDir, f)); } catch { /* 무시 */ } }
      return reply.code(500).send({ error: 'bad', message: '이미지 파일 처리 중 오류가 발생했습니다.' });
    }
  });

  // AI 강의 제작 조교 에이전트 대화
  app.post('/api/decks/chat-agent', { config: { rateLimit: RL.aiGenerate } }, async (req, reply) => {
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
  app.post('/api/decks/quick-generate', { config: { rateLimit: RL.aiGenerate } }, async (req, reply) => {
    const body = (req.body ?? {}) as { deck: Deck; pdfText?: string; type: QuickGenType; count: number };
    const validTypes: QuickGenType[] = GEN_TYPES;
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
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
    const safety = checkSafety(lastUser?.content ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'roleplay') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없습니다.' });
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
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

    const safety = checkSafety(body.topic ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'analogy') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없습니다.' });
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
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

    const safety = checkSafety(body.input ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'writing') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없습니다.' });
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
    if (!c) return reply.code(404).send({ error: 'notfound', message: '강의실을 찾을 수 없습니다.' });
    const p = c.getBySession(body.sessionId);
    if (!p) return reply.code(403).send({ error: 'notfound', message: msg(c, 'notJoined') });

    const safety = checkSafety(body.input ?? '');
    if (!safety.ok) {
      persistUsage(c, p.id, 'blocked', 1, 0);
      return reply.code(400).send({ error: 'safety', message: safety.message });
    }

    const act = getActivity(c.deckId, body.activityId);
    if (!act || act.type !== 'tutor') {
      return reply.code(400).send({ error: 'bad', message: '활동을 찾을 수 없습니다.' });
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
        { data: labRuns },
        { data: surveyResponses },
        { data: questionRows },
      ] = await Promise.all([
        supabase.from('axedu_participants').select('*').eq('classroom_id', id),
        supabase.from('axedu_quiz_responses').select('*').eq('classroom_id', id),
        supabase.from('axedu_poll_responses').select('*').eq('classroom_id', id),
        supabase.from('axedu_ai_usage').select('*').eq('classroom_id', id),
        supabase.from('axedu_lab_runs').select('*').eq('classroom_id', id),
        // 강당 활동 테이블은 마이그레이션 전 환경일 수 있어 실패해도 리포트 자체는 막지 않음
        supabase.from('axedu_survey_responses').select('*').eq('classroom_id', id).then((r) => (r.error ? { data: [] } : r)),
        supabase.from('axedu_questions').select('*').eq('classroom_id', id).order('upvotes', { ascending: false }).then((r) => (r.error ? { data: [] } : r)),
      ]);

      // 4. 집계 (익명 정책 + 강당 활동 survey/scale/ox/Q&A) — 순수 함수 server/src/report.ts
      return buildReport({
        classroom,
        deck,
        participants: participants ?? [],
        quizResponses: quizResponses ?? [],
        pollResponses: pollResponses ?? [],
        aiUsages: aiUsages ?? [],
        labRuns: labRuns ?? [],
        surveyResponses: surveyResponses ?? [],
        questionRows: questionRows ?? [],
      });
    } catch (e) {
      app.log.error(e);
      return reply.code(500).send({ error: 'bad', message: '리포트 집계 중 서버 오류가 발생했습니다.' });
    }
  });
}
