import { customAlphabet } from 'nanoid';
import { randomUUID } from 'node:crypto';
import type {
  ClassroomSnapshot,
  OpenActivityState,
  LeaderboardEntry,
  PollDistribution,
  ActivityType,
  QuestionItem,
  Activity,
  QuizActivity,
  OxActivity,
  SurveyActivity,
  SurveySummary,
  QaSettings,
} from '../../shared/types';
import { SURVEY_TEXT_MAX } from '../../shared/surveyPreset';
import { getDeck, getActivity, toPublicActivity } from './decks';
import { env } from './env';

// 헷갈리는 글자(0,O,1,I,L) 제외한 강의실 토큰
const makeToken = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
const makeSecret = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 24);
const makeId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

export interface Participant {
  id: string;
  sessionId: string;
  nickname: string;
  score: number;
  socketId?: string;
}

interface QuizAnswer {
  optionIndex: number;
  ms: number;
  points: number;
  correct: boolean;
}

export class ClassroomState {
  id = randomUUID(); // DB uuid 와 정합
  token = makeToken();
  instructorSecret = makeSecret();
  deckId: string;
  title?: string;
  status: 'waiting' | 'live' | 'ended' = 'waiting';
  currentSlide = 0;
  activity: OpenActivityState | null = null;
  paused = false;

  participants = new Map<string, Participant>(); // sessionId -> Participant
  private quizAnswers = new Map<string, Map<string, QuizAnswer>>(); // questionId -> (sessionId -> answer)
  private quizStartAt = 0;
  private pollAnswers = new Map<string, Map<string, string>>(); // activityId -> (sessionId -> value)
  private usage = new Map<string, number>(); // `${sessionId}|${activityId}|${type}` -> count
  private roleplayClears = new Set<string>(); // `${sessionId}|${activityId}`
  private questionList: QuestionItem[] = []; // 익명 질문, 최신순
  private questionVotes = new Map<string, Set<string>>(); // questionId -> 업보트한 sessionId (1인 1질문 1회)
  qa: QaSettings = { moderation: false, onScreen: false };
  private surveyAnswers = new Map<string, Map<string, Record<string, number | string>>>(); // activityId -> (sessionId -> answers)
  private adhocActivities = new Map<string, Activity>(); // 덱에 없는 즉석 활동 (OX 퀵 퀴즈)
  budgetSpent = 0;

  settings = {
    chatQuota: env.QUOTA_CHAT_PER_ACTIVITY,
    imageQuota: env.QUOTA_IMAGE_PER_ACTIVITY,
    budgetUsd: env.CLASSROOM_BUDGET_USD,
  };

  constructor(deckId: string, title?: string) {
    this.deckId = deckId;
    this.title = title;
  }

  // ── 참가자 ──
  upsertParticipant(sessionId: string | undefined, nickname: string): Participant {
    const sid = sessionId && this.participants.has(sessionId) ? sessionId : sessionId || makeId();
    const existing = this.participants.get(sid);
    if (existing) {
      existing.nickname = nickname || existing.nickname;
      return existing;
    }
    const p: Participant = { id: randomUUID(), sessionId: sid, nickname: nickname || '익명', score: 0 };
    this.participants.set(sid, p);
    return p;
  }

  getBySession(sessionId: string): Participant | undefined {
    return this.participants.get(sessionId);
  }

  participantCount(): number {
    return this.participants.size;
  }

  snapshot(): ClassroomSnapshot {
    return {
      token: this.token,
      title: this.title,
      status: this.status,
      deckId: this.deckId,
      currentSlide: this.currentSlide,
      activity: this.activity,
      participantCount: this.participantCount(),
      qa: this.qa,
    };
  }

  /** 즉석 활동 우선, 없으면 덱 활동 */
  resolveActivity(activityId: string): Activity | undefined {
    return this.adhocActivities.get(activityId) ?? getActivity(this.deckId, activityId);
  }

  leaderboard(topN = 100): LeaderboardEntry[] {
    const arr = [...this.participants.values()]
      .filter((p) => p.score > 0 || true)
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    return arr.slice(0, topN).map((p, i) => ({ nickname: p.nickname, score: p.score, rank: i + 1 }));
  }

  // ── 슬라이드 / 활동 ──
  gotoSlide(n: number) {
    this.currentSlide = Math.max(0, n);
    if (this.status === 'waiting') this.status = 'live';
  }

  openActivity(activityId: string, type: ActivityType) {
    this.activity = { activityId, type };
    const adhoc = this.adhocActivities.get(activityId);
    if (adhoc) this.activity.adhoc = toPublicActivity(adhoc);
    if (type === 'quiz' || type === 'ox') {
      const quiz = this.quizFor(activityId);
      this.activity.quiz = {
        index: 0,
        total: quiz?.questions.length ?? 0,
        phase: 'idle',
      };
    }
    if (type === 'survey') this.activity.survey = { phase: 'open' };
  }

  /** OX 즉석 퀴즈 생성 (덱 편집 없이) — 생성만 하고 열기는 openActivity 로 */
  createQuickOx(input: { question: string; answer: 'O' | 'X'; timeLimitSec?: number }): OxActivity {
    const id = `ox_${makeId()}`;
    const t = typeof input.timeLimitSec === 'number' ? input.timeLimitSec : 20;
    const act: OxActivity = {
      type: 'ox',
      id,
      title: 'OX 즉석 퀴즈',
      question: input.question.slice(0, 200),
      answer: input.answer === 'X' ? 'X' : 'O',
      timeLimitSec: Math.min(120, Math.max(5, t)),
    };
    this.adhocActivities.set(id, act);
    return act;
  }

  /** quiz 활동은 그대로, ox 활동은 quiz 형태(보기 O/X 1문항)로 합성 → 점수·공개·리더보드 엔진 재사용 */
  private quizFor(activityId: string): QuizActivity | undefined {
    const act = this.resolveActivity(activityId);
    if (!act) return undefined;
    if (act.type === 'quiz') return act;
    if (act.type === 'ox') {
      return {
        type: 'quiz',
        id: act.id,
        title: act.title,
        questions: [{
          id: `${act.id}:q`,
          question: act.question,
          options: ['O', 'X'],
          correctIndex: act.answer === 'X' ? 1 : 0,
          timeLimitSec: act.timeLimitSec,
          explanation: act.explanation,
        }],
      };
    }
    return undefined;
  }

  closeActivity() {
    this.activity = null;
  }

  // ── 퀴즈 ──
  private currentQuiz() {
    if (!this.activity || (this.activity.type !== 'quiz' && this.activity.type !== 'ox')) return undefined;
    return this.quizFor(this.activity.activityId);
  }

  /** 늦게 들어온 소켓 동기화용: 현재 문항 페이로드 (quiz·ox 공통) */
  currentQuestionPayload() {
    const quiz = this.currentQuiz();
    if (!quiz || !this.activity?.quiz) return null;
    const idx = this.activity.quiz.index;
    const q = quiz.questions[idx];
    if (!q) return null;
    return {
      questionId: q.id,
      index: idx,
      total: quiz.questions.length,
      question: q.question,
      options: q.options,
      endsAt: this.activity.quiz.endsAt ?? 0,
    };
  }

  quizStartQuestion(): { questionId: string; index: number; total: number; question: string; options: string[]; endsAt: number } | null {
    const quiz = this.currentQuiz();
    if (!quiz || !this.activity?.quiz) return null;
    const idx = this.activity.quiz.index;
    const q = quiz.questions[idx];
    if (!q) return null;
    this.quizStartAt = Date.now();
    const endsAt = this.quizStartAt + q.timeLimitSec * 1000;
    this.activity.quiz.phase = 'question';
    this.activity.quiz.questionId = q.id;
    this.activity.quiz.endsAt = endsAt;
    if (!this.quizAnswers.has(q.id)) this.quizAnswers.set(q.id, new Map());
    return {
      questionId: q.id,
      index: idx,
      total: quiz.questions.length,
      question: q.question,
      options: q.options,
      endsAt,
    };
  }

  quizNext(): boolean {
    if (!this.activity?.quiz) return false;
    if (this.activity.quiz.index < this.activity.quiz.total - 1) {
      this.activity.quiz.index += 1;
      this.activity.quiz.phase = 'idle';
      return true;
    }
    return false; // 더 없음
  }

  recordQuizAnswer(sessionId: string, questionId: string, optionIndex: number): QuizAnswer | null {
    const quiz = this.currentQuiz();
    if (!quiz || !this.activity?.quiz) return null;
    if (this.activity.quiz.phase !== 'question') return null;
    if (this.activity.quiz.questionId !== questionId) return null;
    const q = quiz.questions[this.activity.quiz.index];
    if (!q || q.id !== questionId) return null;

    const map = this.quizAnswers.get(questionId)!;
    if (map.has(sessionId)) return null; // 이미 응답

    const now = Date.now();
    const limitMs = q.timeLimitSec * 1000;
    const used = Math.min(now - this.quizStartAt, limitMs);
    if (now > this.quizStartAt + limitMs + 1500) return null; // 시간 초과

    const correct = optionIndex === q.correctIndex;
    const fraction = used / limitMs; // 0(빠름)~1(느림)
    const points = correct ? Math.round(1000 * (1 - fraction * 0.5)) : 0;

    const ans: QuizAnswer = { optionIndex, ms: used, points, correct };
    map.set(sessionId, ans);
    const p = this.participants.get(sessionId);
    if (p) p.score += points;
    return ans;
  }

  /** 현재 질문에 응답한 인원 수 (강사 모니터링용) */
  answeredCount(): number {
    const qid = this.activity?.quiz?.questionId;
    if (!qid) return 0;
    return this.quizAnswers.get(qid)?.size ?? 0;
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  quizReveal(): { questionId: string; correctIndex: number; distribution: Record<string, number>; explanation?: string } | null {
    const quiz = this.currentQuiz();
    if (!quiz || !this.activity?.quiz) return null;
    const q = quiz.questions[this.activity.quiz.index];
    if (!q) return null;
    this.activity.quiz.phase = 'revealed';
    const map = this.quizAnswers.get(q.id) ?? new Map();
    const dist: Record<string, number> = {};
    for (const a of map.values()) dist[a.optionIndex] = (dist[a.optionIndex] ?? 0) + 1;
    return {
      questionId: q.id,
      correctIndex: q.correctIndex ?? -1,
      distribution: dist,
      explanation: q.explanation,
    };
  }

  // ── 투표 ──
  recordPoll(sessionId: string, activityId: string, value: string) {
    if (!this.pollAnswers.has(activityId)) this.pollAnswers.set(activityId, new Map());
    this.pollAnswers.get(activityId)!.set(sessionId, value.slice(0, 40));
  }

  pollDistribution(activityId: string): PollDistribution {
    const map = this.pollAnswers.get(activityId) ?? new Map();
    const counts: Record<string, number> = {};
    const entries: Array<{ nickname: string; value: string }> = [];
    for (const [sessionId, v] of map.entries()) {
      counts[v] = (counts[v] ?? 0) + 1;
      const nickname = this.participants.get(sessionId)?.nickname ?? '익명';
      entries.push({ nickname, value: v });
    }
    return { counts, total: map.size, entries };
  }

  // ── 설문 (자기 페이스 다문항, 1인 1제출 — 재제출 시 덮어씀) ──
  recordSurvey(sessionId: string, activityId: string, raw: Record<string, unknown>): Record<string, number | string> | null {
    if (!this.activity || this.activity.activityId !== activityId || this.activity.type !== 'survey') return null;
    if (this.activity.survey?.phase !== 'open') return null;
    const act = this.resolveActivity(activityId);
    if (!act || act.type !== 'survey') return null;
    const answers: Record<string, number | string> = {};
    for (const q of act.questions) {
      const v = raw?.[q.id];
      if (v === undefined || v === null || v === '') continue;
      if (q.kind === 'text') {
        const s = typeof v === 'string' ? v.trim().slice(0, SURVEY_TEXT_MAX) : '';
        if (s) answers[q.id] = s;
      } else {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isInteger(n)) continue;
        const [lo, hi] = q.kind === 'nps' ? [0, 10] : [1, 5];
        if (n < lo || n > hi) continue;
        answers[q.id] = n;
      }
    }
    if (Object.keys(answers).length === 0) return null;
    if (!this.surveyAnswers.has(activityId)) this.surveyAnswers.set(activityId, new Map());
    this.surveyAnswers.get(activityId)!.set(sessionId, answers);
    return answers;
  }

  surveyClose(): boolean {
    if (!this.activity || this.activity.type !== 'survey' || !this.activity.survey) return false;
    this.activity.survey.phase = 'closed';
    return true;
  }

  /** 익명 집계 — 개인 식별 정보 없음. text 문항은 최근 50개만 */
  surveySummary(activityId: string): SurveySummary {
    const act = this.resolveActivity(activityId) as SurveyActivity | undefined;
    const map = this.surveyAnswers.get(activityId) ?? new Map<string, Record<string, number | string>>();
    const questions = (act?.type === 'survey' ? act.questions : []).map((q) => {
      const dist: Record<string, number> = {};
      const texts: string[] = [];
      let sum = 0;
      let n = 0;
      for (const answers of map.values()) {
        const v = answers[q.id];
        if (v === undefined) continue;
        if (q.kind === 'text') {
          if (typeof v === 'string' && v) texts.push(v);
        } else if (typeof v === 'number') {
          dist[String(v)] = (dist[String(v)] ?? 0) + 1;
          sum += v;
          n += 1;
        }
      }
      return {
        id: q.id,
        kind: q.kind,
        count: q.kind === 'text' ? texts.length : n,
        avg: n ? Math.round((sum / n) * 100) / 100 : null,
        dist,
        texts: q.kind === 'text' ? texts.slice(-50) : undefined,
      };
    });
    return { activityId, total: map.size, questions };
  }

  // ── 익명 질문 (언제든 제출 가능) + 업보트 · 답변완료 · 모더레이션 ──
  askQuestion(text: string): QuestionItem {
    const q: QuestionItem = {
      id: makeId(), text: text.slice(0, 300), createdAt: Date.now(),
      upvotes: 0, answered: false, approved: !this.qa.moderation,
    };
    this.questionList.unshift(q);
    if (this.questionList.length > 200) {
      const dropped = this.questionList.splice(200);
      for (const d of dropped) this.questionVotes.delete(d.id);
    }
    return q;
  }

  /** visibleOnly: 참가자·프로젝터용(승인된 것만). 강사는 전체 */
  getQuestions(visibleOnly = false): QuestionItem[] {
    return visibleOnly ? this.questionList.filter((q) => q.approved) : this.questionList;
  }

  getQuestion(id: string): QuestionItem | undefined {
    return this.questionList.find((q) => q.id === id);
  }

  /** 1인(sessionId) 1질문 1회. 성공 시 갱신된 질문 반환 */
  upvoteQuestion(sessionId: string, questionId: string): QuestionItem | null {
    const q = this.getQuestion(questionId);
    if (!q || !q.approved) return null;
    if (!this.questionVotes.has(questionId)) this.questionVotes.set(questionId, new Set());
    const set = this.questionVotes.get(questionId)!;
    if (set.has(sessionId)) return null;
    set.add(sessionId);
    q.upvotes = set.size;
    return q;
  }

  setQuestionAnswered(questionId: string, answered: boolean): QuestionItem | null {
    const q = this.getQuestion(questionId);
    if (!q) return null;
    q.answered = answered;
    return q;
  }

  approveQuestion(questionId: string): QuestionItem | null {
    const q = this.getQuestion(questionId);
    if (!q) return null;
    q.approved = true;
    return q;
  }

  removeQuestion(questionId: string): boolean {
    const idx = this.questionList.findIndex((q) => q.id === questionId);
    if (idx < 0) return false;
    this.questionList.splice(idx, 1);
    this.questionVotes.delete(questionId);
    return true;
  }

  setQaSettings(p: Partial<QaSettings>) {
    if (typeof p.moderation === 'boolean') this.qa.moderation = p.moderation;
    if (typeof p.onScreen === 'boolean') this.qa.onScreen = p.onScreen;
  }

  // ── 역할극 미션 완료 ──
  clearRoleplay(sessionId: string, activityId: string): boolean {
    const key = `${sessionId}|${activityId}`;
    if (this.roleplayClears.has(key)) return false;
    this.roleplayClears.add(key);
    const p = this.participants.get(sessionId);
    if (p) {
      p.score += 500; // 미션 성공 보너스 500점
      return true;
    }
    return false;
  }

  // ── 쿼터 / 예산 ──
  checkUsage(sessionId: string, activityId: string, type: 'chat' | 'image'): { ok: boolean; message?: string } {
    if (this.paused) return { ok: false, message: '강사님이 잠시 AI 실습을 멈췄어요. 곧 다시 열릴 거예요!' };
    if (this.budgetSpent >= this.settings.budgetUsd)
      return { ok: false, message: '오늘 강의실 AI 사용량이 가득 찼어요. 강사님께 알려주세요!' };
    const limit = type === 'chat' ? this.settings.chatQuota : this.settings.imageQuota;
    const key = `${sessionId}|${activityId}|${type}`;
    const used = this.usage.get(key) ?? 0;
    if (used >= limit)
      return {
        ok: false,
        message: `이 실습에서 ${type === 'chat' ? '대화' : '이미지'}는 ${limit}번까지 할 수 있어. 다음 실습에서 또 해보자!`,
      };
    return { ok: true };
  }

  countUsage(sessionId: string, activityId: string, type: 'chat' | 'image') {
    const key = `${sessionId}|${activityId}|${type}`;
    this.usage.set(key, (this.usage.get(key) ?? 0) + 1);
  }

  addCost(usd: number) {
    this.budgetSpent += usd;
  }
}

// ── 레지스트리 ──
const byToken = new Map<string, ClassroomState>();
const byId = new Map<string, ClassroomState>();

export function createClassroom(deckId: string, title?: string): ClassroomState {
  const c = new ClassroomState(deckId, title);
  byToken.set(c.token, c);
  byId.set(c.id, c);
  return c;
}

export function getByToken(token: string): ClassroomState | undefined {
  return byToken.get((token ?? '').toUpperCase().trim());
}

export function getById(id: string): ClassroomState | undefined {
  return byId.get(id);
}
