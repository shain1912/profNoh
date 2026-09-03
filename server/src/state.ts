import { customAlphabet } from 'nanoid';
import { randomUUID } from 'node:crypto';
import type {
  ClassroomSnapshot,
  OpenActivityState,
  LeaderboardEntry,
  PollDistribution,
  ActivityType,
  QuestionItem,
  ClassroomMode,
  AnonymityPolicy,
  ResultsRevealPolicy,
  ClassroomAnonSettings,
} from '../../shared/types';
import { resolveAnonymous, ANONYMITY_POLICIES } from '../../shared/types';
import { getDeck, getQuizActivity, getActivity } from './decks';
import { env } from './env';
import { msg, usageLimitMsg } from './copy';

/** 활동 열기 옵션 — 덱에 저장된 timerSec/autoReveal 대신 이번 실행에만 적용 (즉석 타이머) */
export interface OpenActivityOptions {
  timerSec?: number;
  autoReveal?: boolean;
}

/** 투표 타이머 범위: 5초~10분. 0/음수/비정상은 "타이머 없음" */
export function normalizeTimerSec(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.min(600, Math.max(5, Math.round(v)));
}

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
    /** 세션 모드 — 기본 classroom(교실). auditorium(강당)이면 입장 바·대기 화면·대형 타이포 */
    mode: ClassroomMode;
    anonymity: AnonymityPolicy;
    resultsReveal: ResultsRevealPolicy;
  } = {
    chatQuota: env.QUOTA_CHAT_PER_ACTIVITY,
    imageQuota: env.QUOTA_IMAGE_PER_ACTIVITY,
    budgetUsd: env.CLASSROOM_BUDGET_USD,
    mode: 'classroom',
    // 익명 정책 기본: 실명 기본(활동별 익명 지정 가능) / 투표 결과는 강사가 공개할 때까지 숨김
    anonymity: 'named_default',
    resultsReveal: 'after_close',
  };

  constructor(deckId: string, title?: string, opts: { mode?: ClassroomMode } = {}) {
    this.deckId = deckId;
    this.title = title;
    this.settings.mode = normalizeMode(opts.mode);
  }

  get mode(): ClassroomMode {
    return this.settings.mode;
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

  /** 현재 연결 중인 참가자 수 — 소켓이 끊긴 사람은 빠진다 ("지금 몇 명 보고 있나", R3 결핍 13) */
  participantCount(): number {
    let n = 0;
    for (const p of this.participants.values()) if (p.socketId) n += 1;
    return n;
  }

  /** 누적 입장 인원 (퇴장 포함) */
  totalParticipants(): number {
    return this.participants.size;
  }

  /** 소켓 퇴장 처리. 같은 세션이 다른 소켓으로 재접속한 뒤 도착한 늦은 disconnect 는 무시한다. */
  markDisconnected(sessionId: string, socketId: string): boolean {
    const p = this.participants.get(sessionId);
    if (!p || p.socketId !== socketId) return false;
    p.socketId = undefined;
    return true;
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
      mode: this.settings.mode,
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
      if (this.activity.type === 'poll' && this.settings.resultsReveal === 'live') {
        this.activity.revealResults = true;
        if (this.activity.poll) this.activity.poll.revealed = true;
      }
    }
    return { anonymity: this.settings.anonymity, resultsReveal: this.settings.resultsReveal };
  }

  /** 투표 결과 공개 — after_close 정책에서는 응답 마감을 겸한다 */
  revealResults(): boolean {
    if (!this.activity) return false;
    this.activity.revealResults = true;
    if (this.activity.poll) this.activity.poll.revealed = true;
    if (this.activity.type === 'poll' && this.settings.resultsReveal === 'after_close') {
      // "결과 공개" = 응답 마감 겸함 — 타이머 상태도 함께 마감 처리
      this.activity.closed = true;
      if (this.activity.poll) {
        this.activity.poll.closed = true;
        this.activity.poll.endsAt = undefined;
      }
    }
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

  openActivity(activityId: string, type: ActivityType, opts: OpenActivityOptions = {}) {
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
        autoReveal: opts.autoReveal ?? quiz?.autoReveal ?? false,
      };
    }
    if (type === 'poll') {
      const act = getActivity(this.deckId, activityId);
      const deckTimer = act?.type === 'poll' ? act.timerSec : undefined;
      const deckAuto = act?.type === 'poll' ? act.autoReveal : undefined;
      // 즉석 값이 오면(0 포함) 덱 값을 덮어씀. undefined 면 덱 값 사용.
      const timerSec = normalizeTimerSec(opts.timerSec !== undefined ? opts.timerSec : deckTimer);
      this.activity.poll = {
        timerSec,
        endsAt: timerSec ? Date.now() + timerSec * 1000 : undefined,
        closed: false,
        // 세션 정책이 live 이고 타이머가 없을 때만 처음부터 공개.
        // after_close 정책이거나 타이머가 있으면 마감 전까지 숨김(밴드왜건 방지)
        revealed: this.settings.resultsReveal === 'live' && !timerSec,
        autoReveal: opts.autoReveal ?? deckAuto ?? false,
      };
      // 상위 revealResults(익명 정책) 와 poll.revealed(타이머) 는 항상 같은 값을 유지한다
      this.activity.revealResults = this.activity.poll.revealed;
    }
  }

  closeActivity() {
    this.activity = null;
  }

  /** 투표 마감 — 추가 응답 차단. autoReveal 이면 결과도 함께 공개. 이미 마감이면 false */
  pollClose(): boolean {
    const p = this.activity?.poll;
    if (!p || p.closed) return false;
    p.closed = true;
    p.endsAt = undefined;
    this.activity!.closed = true;
    if (p.autoReveal) {
      p.revealed = true;
      this.activity!.revealResults = true;
    }
    return true;
  }

  /** 투표 결과 수동 공개. 이미 공개면 false */
  pollReveal(): boolean {
    const p = this.activity?.poll;
    if (!p || p.revealed) return false;
    p.revealed = true;
    this.activity!.revealResults = true;
    return true;
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
  /** 응답 기록. 마감(결과 공개 마감 또는 타이머/수동 마감)된 투표면 false */
  recordPoll(sessionId: string, activityId: string, value: string): boolean {
    if (this.activity?.activityId === activityId && (this.activity.closed || this.activity.poll?.closed)) return false;
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
    if (this.paused) return { ok: false, message: msg(this, 'usagePaused') };
    if (this.budgetSpent >= this.settings.budgetUsd) return { ok: false, message: msg(this, 'usageBudget') };
    const limit = type === 'chat' ? this.settings.chatQuota : this.settings.imageQuota;
    const key = `${sessionId}|${activityId}|${type}`;
    const used = this.usage.get(key) ?? 0;
    if (used >= limit) return { ok: false, message: usageLimitMsg(this, type === 'chat' ? '대화' : '이미지', limit) };
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

/** 알 수 없는 값은 classroom(기본) 으로 — 클라이언트 입력 방어 */
export function normalizeMode(m: unknown): ClassroomMode {
  return m === 'auditorium' ? 'auditorium' : 'classroom';
}

// ── 레지스트리 ──
const byToken = new Map<string, ClassroomState>();
const byId = new Map<string, ClassroomState>();

export function createClassroom(deckId: string, title?: string, opts: { mode?: ClassroomMode } = {}): ClassroomState {
  const c = new ClassroomState(deckId, title, opts);
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
