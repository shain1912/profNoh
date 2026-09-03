import { customAlphabet } from 'nanoid';
import { randomUUID } from 'node:crypto';
import type {
  ClassroomSnapshot,
  OpenActivityState,
  LeaderboardEntry,
  PollDistribution,
  ActivityType,
  QuestionItem,
  AnonymityPolicy,
  ResultsRevealPolicy,
  ClassroomAnonSettings,
} from '../../shared/types';
import { resolveAnonymous, ANONYMITY_POLICIES } from '../../shared/types';
import { getDeck, getQuizActivity, getActivity } from './decks';
import { env } from './env';

// 헷갈리는 글자(0,O,1,I,L) 제외한 강의실 토큰
const makeToken = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
const makeSecret = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 24);
const makeId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

export interface Participant {
  id: string;
  sessionId: string;
  nickname: string;
  /** 세션 전체 익명(always_anon)일 때 리더보드 등에 노출되는 안정적 가명 — "익명 3" */
  alias: string;
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
  private aliasSeq = 0;
  budgetSpent = 0;

  settings: {
    chatQuota: number;
    imageQuota: number;
    budgetUsd: number;
    anonymity: AnonymityPolicy;
    resultsReveal: ResultsRevealPolicy;
  } = {
    chatQuota: env.QUOTA_CHAT_PER_ACTIVITY,
    imageQuota: env.QUOTA_IMAGE_PER_ACTIVITY,
    budgetUsd: env.CLASSROOM_BUDGET_USD,
    // 익명 정책 기본: 실명 기본(활동별 익명 지정 가능) / 투표 결과는 강사가 공개할 때까지 숨김
    anonymity: 'named_default',
    resultsReveal: 'after_close',
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
    this.aliasSeq += 1;
    const p: Participant = { id: randomUUID(), sessionId: sid, nickname: nickname || '익명', alias: `익명 ${this.aliasSeq}`, score: 0 };
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
      anonymity: this.settings.anonymity,
      resultsReveal: this.settings.resultsReveal,
    };
  }

  // ── 익명 정책 ──
  /** 세션 전체가 익명(always_anon)인지 — 리더보드/리포트 참가자 이름까지 가명 처리 */
  sessionAnonymous(): boolean {
    return this.settings.anonymity === 'always_anon';
  }

  /** 세션 정책 + 활동의 anonymous 오버라이드를 해석한 실제 익명 여부 */
  isActivityAnonymous(activityId: string): boolean {
    const act = getActivity(this.deckId, activityId);
    return resolveAnonymous(this.settings.anonymity, act?.anonymous);
  }

  /** 참가자 표시 이름 — 세션 익명이면 가명 */
  displayName(p: Participant): string {
    return this.sessionAnonymous() ? p.alias : p.nickname;
  }

  /** 세션 익명/결과 공개 정책 변경. 열린 활동이 있으면 즉시 재해석 */
  updateSettings(patch: Partial<ClassroomAnonSettings>): ClassroomAnonSettings {
    if (patch.anonymity && ANONYMITY_POLICIES.includes(patch.anonymity)) this.settings.anonymity = patch.anonymity;
    if (patch.resultsReveal === 'live' || patch.resultsReveal === 'after_close') this.settings.resultsReveal = patch.resultsReveal;
    if (this.activity) {
      this.activity.anonymous = this.isActivityAnonymous(this.activity.activityId);
      if (this.activity.type === 'poll' && this.settings.resultsReveal === 'live') this.activity.revealResults = true;
    }
    return { anonymity: this.settings.anonymity, resultsReveal: this.settings.resultsReveal };
  }

  /** 투표 결과 공개 — after_close 정책에서는 응답 마감을 겸한다 */
  revealResults(): boolean {
    if (!this.activity) return false;
    this.activity.revealResults = true;
    if (this.activity.type === 'poll' && this.settings.resultsReveal === 'after_close') this.activity.closed = true;
    return true;
  }

  leaderboard(topN = 100): LeaderboardEntry[] {
    const arr = [...this.participants.values()]
      .filter((p) => p.score > 0 || true)
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    return arr.slice(0, topN).map((p, i) => ({ nickname: this.displayName(p), score: p.score, rank: i + 1 }));
  }

  // ── 슬라이드 / 활동 ──
  gotoSlide(n: number) {
    this.currentSlide = Math.max(0, n);
    if (this.status === 'waiting') this.status = 'live';
  }

  openActivity(activityId: string, type: ActivityType) {
    this.activity = {
      activityId,
      type,
      anonymous: this.isActivityAnonymous(activityId),
      // 투표는 정책에 따라 숨김 시작, 나머지 활동은 결과 공개 개념이 없어 항상 true
      revealResults: type === 'poll' ? this.settings.resultsReveal === 'live' : true,
      closed: false,
    };
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
  /** 응답 기록. 결과 공개로 마감된 투표면 false */
  recordPoll(sessionId: string, activityId: string, value: string): boolean {
    if (this.activity?.activityId === activityId && this.activity.closed) return false;
    if (!this.pollAnswers.has(activityId)) this.pollAnswers.set(activityId, new Map());
    this.pollAnswers.get(activityId)!.set(sessionId, value.slice(0, 40));
    return true;
  }

  /**
   * 투표 분포.
   * - 익명 활동이면 entries 에서 nickname 을 제거한다 (프로젝터·학생 어디서도 이름이 나가지 않도록 서버에서 차단)
   * - 결과 미공개 상태에서 강사가 아닌 대상에게는 total 만 담은 hidden 분포를 돌려준다
   */
  pollDistribution(activityId: string, opts: { forInstructor?: boolean } = {}): PollDistribution {
    const map = this.pollAnswers.get(activityId) ?? new Map();
    const isOpen = this.activity?.activityId === activityId;
    const revealed = !isOpen || this.activity!.revealResults;
    if (!revealed && !opts.forInstructor) {
      return { counts: {}, total: map.size, entries: [], hidden: true };
    }
    const anonymous = this.isActivityAnonymous(activityId);
    const counts: Record<string, number> = {};
    const entries: Array<{ nickname?: string; value: string }> = [];
    for (const [sessionId, v] of map.entries()) {
      counts[v] = (counts[v] ?? 0) + 1;
      if (anonymous) {
        entries.push({ value: v });
      } else {
        const p = this.participants.get(sessionId);
        entries.push({ nickname: p ? this.displayName(p) : '익명', value: v });
      }
    }
    return { counts, total: map.size, entries };
  }

  // ── 익명 질문 (언제든 제출 가능) ──
  askQuestion(text: string): QuestionItem {
    const q: QuestionItem = { id: makeId(), text: text.slice(0, 300), createdAt: Date.now() };
    this.questionList.unshift(q);
    if (this.questionList.length > 200) this.questionList.length = 200;
    return q;
  }

  getQuestions(): QuestionItem[] {
    return this.questionList;
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
