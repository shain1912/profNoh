import { customAlphabet } from 'nanoid';
import { randomUUID } from 'node:crypto';
import type {
  ClassroomSnapshot,
  OpenActivityState,
  LeaderboardEntry,
  PollDistribution,
  ActivityType,
} from '../../shared/types';
import { getDeck, getQuizActivity } from './decks';
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
    };
  }

  leaderboard(topN = 10): LeaderboardEntry[] {
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
    if (type === 'quiz') {
      const quiz = getQuizActivity(this.deckId, activityId);
      this.activity.quiz = {
        index: 0,
        total: quiz?.questions.length ?? 0,
        phase: 'idle',
      };
    }
  }

  closeActivity() {
    this.activity = null;
  }

  // ── 퀴즈 ──
  private currentQuiz() {
    if (!this.activity || this.activity.type !== 'quiz') return undefined;
    const quiz = getQuizActivity(this.deckId, this.activity.activityId);
    return quiz;
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
    for (const v of map.values()) counts[v] = (counts[v] ?? 0) + 1;
    return { counts, total: map.size };
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
