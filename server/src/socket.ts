import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ActivityType, QuizReveal } from '../../shared/types';
import { getByToken, type ClassroomState } from './state';
import { msg } from './copy';
import { env } from './env';
import { Batcher, TokenBucketSet, SOCKET_EVENT_RULES, SOCKET_GLOBAL_RULE } from './ratelimit';
import {
  persistParticipant, persistScore, persistPoll, persistQuizResponse, updateClassroomProgress, updateClassroomSettings,
  persistSurvey, persistQuestion, deleteQuestionRow,
} from './persist';

// ── 역할별 room (Phase 2 브로드캐스트 재설계, R3 §2.2) ──
//   c.id            : 전원 — 상태 전이(state/slide/activity/quiz:question/notice)처럼 모두에게 필요한 작은 이벤트
//   :staff          : 강사 + 프로젝터 — 상세(리더보드 전체·quiz:answered 카운트·투표 entries)
//   :instructor     : 강사만 — 결과 미공개 투표의 실제 분포, 미승인 질문
//   :participants   : 참가자 — 집계값(counts/total)·자기 ACK 만
/** 강사 전용 룸 — 결과 미공개 투표의 실제 분포·미승인 질문 등 강사만 봐야 하는 이벤트 */
const instructorRoom = (c: ClassroomState) => `${c.id}:instructor`;
const staffRoom = (c: ClassroomState) => `${c.id}:staff`;
const participantsRoom = (c: ClassroomState) => `${c.id}:participants`;

// 집계 브로드캐스트 배치 창 — 표마다 전원 전송(O(n²)) 대신 창당 1회
const STAFF_MS = env.BROADCAST_BATCH_MS;
const PART_MS = env.BROADCAST_BATCH_PARTICIPANT_MS;
const batcher = new Batcher();

// 활동 타이머 (강의실당 1개): 투표 자동 마감 / 퀴즈 자동 정답 공개.
// 활동을 닫거나 다른 활동을 열거나 강사가 수동으로 진행하면 해제된다.
const activityTimers = new Map<string, NodeJS.Timeout>();
function disarmTimer(c: ClassroomState) {
  const t = activityTimers.get(c.id);
  if (t) clearTimeout(t);
  activityTimers.delete(c.id);
}
function armTimer(c: ClassroomState, at: number, fn: () => void) {
  disarmTimer(c);
  activityTimers.set(c.id, setTimeout(() => { activityTimers.delete(c.id); fn(); }, Math.max(0, at - Date.now())));
}
// 퀴즈 자동 공개 유예: 학생 응답 허용 시간(recordQuizAnswer 의 +1500ms)과 맞춘다
const QUIZ_REVEAL_GRACE_MS = 1500;

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface SocketData {
  role?: 'instructor' | 'student';
  token?: string;
  sessionId?: string;
}

export function setupSocket(io: IO) {
  const broadcastState = (c: ClassroomState) => io.to(c.id).emit('state', c.snapshot());
  // 리더보드 전체(상위 100명)는 스태프룸만 — 참가자는 joined/quiz:reveal.me 로 자기 점수만 받는다
  const broadcastLeaderboard = (c: ClassroomState) => io.to(staffRoom(c)).emit('leaderboard', c.leaderboard());
  // 접속 인원: 입장마다 전원 전송(400명 입장 = 16만 프레임) 대신 배치 — 스태프 300ms / 참가자(강당 대기 화면) 500ms
  const broadcastParticipants = (c: ClassroomState) => {
    batcher.schedule(`${c.id}|participants|staff`, STAFF_MS, () =>
      io.to(staffRoom(c)).emit('participants', { count: c.participantCount() }));
    batcher.schedule(`${c.id}|participants|part`, PART_MS, () =>
      io.to(participantsRoom(c)).emit('participants', { count: c.participantCount() }));
  };
  // 퀴즈 응답 카운트: 강사·프로젝터만 쓰는 정보 — 스태프룸에 배치 전송
  const broadcastAnswered = (c: ClassroomState) => {
    batcher.schedule(`${c.id}|answered`, STAFF_MS, () =>
      io.to(staffRoom(c)).emit('quiz:answered', { count: c.answeredCount() }));
  };
  // 투표 분포: 강사=전체 분포 / 프로젝터=공개 상태에 따라 hidden·전체 / 참가자=집계(counts·total)만, entries 없음.
  // 표마다가 아니라 창당 1회 전송. 활동 열기/마감/공개 같은 전이는 immediate 로 즉시 반영.
  const broadcastPoll = (c: ClassroomState, activityId: string, immediate = false) => {
    const sendStaff = () => {
      io.to(instructorRoom(c)).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId, { forInstructor: true }) });
      io.to(staffRoom(c)).except(instructorRoom(c)).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId) });
    };
    const sendParticipants = () =>
      io.to(participantsRoom(c)).emit('poll:update', { activityId, distribution: c.pollAggregate(activityId) });
    const kStaff = `${c.id}|poll|${activityId}|staff`;
    const kPart = `${c.id}|poll|${activityId}|part`;
    if (immediate) {
      batcher.flush(kStaff, sendStaff);
      batcher.flush(kPart, sendParticipants);
      return;
    }
    batcher.schedule(kStaff, STAFF_MS, sendStaff);
    batcher.schedule(kPart, PART_MS, sendParticipants);
  };
  // 정답 공개 페이로드: 스태프룸엔 리더보드 전체, 참가자에겐 리더보드 없이 자기 점수·순위(me)만
  const emitQuizReveal = (c: ClassroomState, r: Omit<QuizReveal, 'leaderboard'>) => {
    io.to(staffRoom(c)).emit('quiz:reveal', { ...r, leaderboard: c.leaderboard() });
    const ranks = c.rankBySession();
    const ids = io.sockets.adapter.rooms.get(participantsRoom(c));
    if (!ids) return;
    for (const id of ids) {
      const s = io.sockets.sockets.get(id);
      if (!s) continue;
      const me = s.data.sessionId ? ranks.get(s.data.sessionId) : undefined;
      s.emit('quiz:reveal', { ...r, leaderboard: [], me });
    }
  };
  // 정답 공개 (강사 수동 / 타이머 자동 공통)
  const doQuizReveal = (c: ClassroomState) => {
    disarmTimer(c);
    const r = c.quizReveal();
    if (!r) return;
    batcher.cancel(`${c.id}|answered`);
    emitQuizReveal(c, r);
    broadcastLeaderboard(c);
    broadcastState(c);
  };
  // 문제 시작 (첫 문제 / 다음 문제 공통) — autoReveal 이면 제한시간 종료 시 자동 공개 예약
  const startQuestion = (c: ClassroomState) => {
    const q = c.quizStartQuestion();
    if (!q) return false;
    io.to(c.id).emit('quiz:question', q);
    if (c.activity?.quiz?.autoReveal) armTimer(c, q.endsAt + QUIZ_REVEAL_GRACE_MS, () => doQuizReveal(c));
    return true;
  };
  // 투표 마감 (강사 수동 / 타이머 자동 공통) — autoReveal 이면 state.pollClose 가 결과도 공개
  const doPollClose = (c: ClassroomState) => {
    disarmTimer(c);
    if (!c.pollClose()) return;
    if (c.activity) {
      io.to(c.id).emit('activity:updated', c.activity);
      broadcastPoll(c, c.activity.activityId, true);
    }
    broadcastState(c);
  };

  // 설문 집계 브로드캐스트는 제출마다가 아니라 활동당 창(500ms)당 1회 (400명 동시 제출 대비). 개인 식별 정보 없음 → 전원
  const broadcastSurvey = (c: ClassroomState, activityId: string, immediate = false) => {
    const key = `${c.id}|survey|${activityId}`;
    const send = () => io.to(c.id).emit('survey:update', c.surveySummary(activityId));
    if (immediate) return batcher.flush(key, send);
    batcher.schedule(key, PART_MS, send);
  };
  // 질문 이벤트: 승인된 질문은 방 전체(참가자도 Q&A 패널에서 목록·👍 를 쓴다), 미승인은 강사 room 에만
  // (강사는 두 room 에 다 있어 클라이언트가 id 로 중복 제거)
  const emitQuestion = (c: ClassroomState, ev: 'question:new' | 'question:update', q: { approved: boolean } & Parameters<ServerToClientEvents['question:new']>[0]) => {
    if (q.approved) io.to(c.id).emit(ev, q);
    else io.to(instructorRoom(c)).emit(ev, q);
  };

  io.on('connection', (socket: Sock) => {
    // ── 소켓 이벤트 토큰 버킷 (R3 결핍 17): 한도 초과 이벤트는 버리고, 첫 초과 때만 안내 1회 ──
    const buckets = new TokenBucketSet();
    socket.use((packet, next) => {
      const ev = String(packet[0] ?? '');
      const now = Date.now();
      const g = buckets.take('*', SOCKET_GLOBAL_RULE, now);
      const rule = SOCKET_EVENT_RULES[ev];
      const e = rule ? buckets.take(ev, rule, now) : { ok: true, warn: false };
      if (g.ok && e.ok) return next();
      if (g.warn || e.warn) socket.emit('errmsg', { message: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.' });
    });

    // ── 강사 입장 ──
    socket.on('instructor:join', ({ token, instructorSecret }) => {
      const c = getByToken(token);
      if (!c) return socket.emit('errmsg', { message: '강의실을 찾을 수 없습니다.' });
      if (c.instructorSecret !== instructorSecret)
        return socket.emit('errmsg', { message: '강사 권한이 없습니다.' });
      socket.data.role = 'instructor';
      socket.data.token = c.token;
      socket.join(c.id);
      socket.join(staffRoom(c));
      socket.join(instructorRoom(c));
      socket.emit('state', c.snapshot());
      socket.emit('leaderboard', c.leaderboard());
      socket.emit('participants', { count: c.participantCount() });
      socket.emit('questions:sync', c.getQuestions());
      sendCurrentActivityTo(socket, c);
    });

    // ── 학생 입장 ──
    socket.on('student:join', async ({ token, nickname, sessionId }) => {
      const c = getByToken(token);
      if (!c) return socket.emit('errmsg', { message: '입장 코드를 다시 확인해 주세요.' });
      const p = c.upsertParticipant(sessionId, nickname);
      p.socketId = socket.id;
      socket.data.role = 'student';
      socket.data.token = c.token;
      socket.data.sessionId = p.sessionId;
      socket.join(c.id);
      socket.join(participantsRoom(c));

      // 참가자를 먼저 DB에 기록 → 이후 AI 사용/퀴즈/랩 기록의 FK 보장
      await persistParticipant(c, p);

      socket.emit('joined', { participantId: p.id, sessionId: p.sessionId, nickname: p.nickname, score: p.score });
      socket.emit('state', c.snapshot());
      socket.emit('questions:sync', c.getQuestions(true));
      sendCurrentActivityTo(socket, c);
      broadcastParticipants(c);
    });

    // ── 뷰어(프로젝터) 입장: 읽기 전용, 참가자 미생성. 상세(리더보드·entries)를 받는 스태프룸 ──
    socket.on('viewer:join', ({ token }) => {
      const c = getByToken(token);
      if (!c) return socket.emit('errmsg', { message: '강의실을 찾을 수 없습니다.' });
      socket.data.role = undefined;
      socket.data.token = c.token;
      socket.join(c.id);
      socket.join(staffRoom(c));
      socket.emit('state', c.snapshot());
      socket.emit('leaderboard', c.leaderboard());
      socket.emit('participants', { count: c.participantCount() });
      socket.emit('questions:sync', c.getQuestions(true));
      sendCurrentActivityTo(socket, c);
    });

    // ── 강사: 슬라이드 이동 ──
    socket.on('instructor:goto', ({ slide }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      c.gotoSlide(slide);
      io.to(c.id).emit('slide:changed', c.currentSlide);
      broadcastState(c);
      updateClassroomProgress(c);
    });

    // ── 강사: 활동 열기/닫기 ──
    socket.on('instructor:openActivity', ({ activityId, timerSec, autoReveal }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const act = c.resolveActivity(activityId);
      if (!act) return socket.emit('errmsg', { message: '활동을 찾을 수 없습니다.' });
      disarmTimer(c);
      c.openActivity(activityId, act.type as ActivityType, {
        timerSec: typeof timerSec === 'number' ? timerSec : undefined,
        autoReveal: typeof autoReveal === 'boolean' ? autoReveal : undefined,
      });
      io.to(c.id).emit('activity:opened', c.activity!);
      broadcastState(c);
      if (act.type === 'poll' || act.type === 'scale') broadcastPoll(c, activityId, true);
      if (act.type === 'poll') {
        const endsAt = c.activity?.poll?.endsAt;
        if (endsAt) armTimer(c, endsAt, () => doPollClose(c));
      }
      if (act.type === 'survey') broadcastSurvey(c, activityId, true);
    });

    // ── 강사: OX 즉석 퀴즈 — 덱 편집 없이 제목·정답만으로 바로 열기 ──
    socket.on('instructor:quickOx', ({ question, answer, timeLimitSec }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const q = (question ?? '').trim();
      if (!q) return socket.emit('errmsg', { message: '문제를 입력하세요.' });
      const act = c.createQuickOx({ question: q, answer, timeLimitSec });
      disarmTimer(c);
      c.openActivity(act.id, 'ox');
      io.to(c.id).emit('activity:opened', c.activity!);
      broadcastState(c);
    });

    // ── 강사: 설문 마감 (응답 중단 + 결과 공개) ──
    socket.on('instructor:surveyClose', () => {
      const c = instructorClassroom(socket);
      if (!c || !c.surveyClose()) return;
      io.to(c.id).emit('activity:opened', c.activity!);
      broadcastSurvey(c, c.activity!.activityId, true);
      broadcastState(c);
    });

    // ── 강사: 투표 결과 공개 (after_close 정책이면 응답 마감 겸함) ──
    socket.on('instructor:revealResults', () => {
      const c = instructorClassroom(socket);
      if (!c || !c.activity) return;
      if (!c.revealResults()) return;
      if (c.activity.closed) disarmTimer(c); // 마감을 겸했으면 자동 마감 타이머 해제
      io.to(c.id).emit('activity:updated', c.activity);
      if (c.activity.type === 'poll') {
        broadcastPoll(c, c.activity.activityId, true);
        io.to(c.id).emit('notice', { message: c.activity.closed ? '응답 마감 · 결과가 공개됐어요 📢' : '결과가 공개됐어요 📢' });
      }
      broadcastState(c);
    });

    // ── 강사: 세션 익명/결과 공개 정책 변경 ──
    socket.on('instructor:updateSettings', (patch) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      c.updateSettings(patch ?? {});
      broadcastState(c);
      broadcastLeaderboard(c);
      if (c.activity) {
        io.to(c.id).emit('activity:updated', c.activity);
        if (c.activity.type === 'poll') broadcastPoll(c, c.activity.activityId, true);
      }
      updateClassroomSettings(c);
    });

    socket.on('instructor:closeActivity', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      disarmTimer(c);
      // 닫힌 활동의 늦은 집계 배치는 보내지 않는다
      if (c.activity) batcher.cancelPrefix(`${c.id}|poll|${c.activity.activityId}|`);
      batcher.cancel(`${c.id}|answered`);
      c.closeActivity();
      io.to(c.id).emit('activity:closed');
      broadcastState(c);
    });

    // ── 강사: 투표 지금 마감 / 결과 공개 ──
    socket.on('instructor:pollClose', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      doPollClose(c);
    });

    socket.on('instructor:pollReveal', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      if (!c.pollReveal()) return;
      if (c.activity) {
        io.to(c.id).emit('activity:updated', c.activity);
        broadcastPoll(c, c.activity.activityId, true);
      }
      broadcastState(c);
    });

    // ── 강사: 퀴즈 진행 ──
    socket.on('instructor:quizStart', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      if (!startQuestion(c)) return;
      broadcastState(c);
    });

    socket.on('instructor:quizReveal', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      doQuizReveal(c);
    });

    socket.on('instructor:quizNext', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      disarmTimer(c);
      const moved = c.quizNext();
      if (moved) {
        startQuestion(c);
      } else {
        broadcastLeaderboard(c);
        io.to(c.id).emit('notice', { message: msg(c, 'quizEnd') });
      }
      broadcastState(c);
    });

    // ── 강사: 패닉(일시정지/재개) ──
    socket.on('instructor:panic', ({ action }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      c.setPaused(action === 'pause');
      io.to(c.id).emit('notice', {
        message: msg(c, action === 'pause' ? 'aiPaused' : 'aiResumed'),
        kind: action,
      });
      broadcastState(c);
    });

    // ── 학생: 퀴즈 응답 ──
    socket.on('student:quizAnswer', ({ questionId, optionIndex }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid) return;
      const ans = c.recordQuizAnswer(sid, questionId, optionIndex);
      if (ans) {
        broadcastAnswered(c);
        const p = c.getBySession(sid);
        if (p) {
          // 자기 ACK: 세션 익명이면 리더보드가 가명이고, 참가자는 리더보드 자체를 받지 않으므로 자기 점수를 직접 갱신
          socket.emit('joined', { participantId: p.id, sessionId: p.sessionId, nickname: p.nickname, score: p.score });
          persistScore(c, p);
          persistQuizResponse(c, p, questionId, String(optionIndex), ans.correct, ans.ms, ans.points);
        }
      }
    });

    // ── 학생: 투표 (poll · scale 공통 — scale 은 '1'~'5' 만 허용) ──
    socket.on('student:pollVote', ({ activityId, value }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid) return;
      if (c.resolveActivity(activityId)?.type === 'scale' && !['1', '2', '3', '4', '5'].includes(String(value))) return;
      if (!c.recordPoll(sid, activityId, value)) return socket.emit('errmsg', { message: msg(c, 'pollClosed') });
      broadcastPoll(c, activityId);
      const p = c.getBySession(sid);
      if (p) persistPoll(c, p, activityId, value);
    });

    // ── 학생: 역할극 미션 완료 ──
    socket.on('student:roleplayClear', ({ activityId }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid) return;
      const success = c.clearRoleplay(sid, activityId);
      if (success) {
        const p = c.getBySession(sid);
        if (p) {
          persistScore(c, p);
          broadcastLeaderboard(c);
          socket.emit('joined', { participantId: p.id, sessionId: p.sessionId, nickname: p.nickname, score: p.score });
        }
      }
    });

    // ── 학생: 설문 제출 (재제출 시 덮어씀, 마감 후 거부) ──
    socket.on('student:surveySubmit', ({ activityId, answers }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid || !activityId || !answers || typeof answers !== 'object') return;
      const saved = c.recordSurvey(sid, activityId, answers as Record<string, unknown>);
      if (!saved) return socket.emit('errmsg', { message: '설문이 마감됐거나 응답이 비어 있어요.' });
      broadcastSurvey(c, activityId);
      const p = c.getBySession(sid);
      if (p) persistSurvey(c, p, activityId, saved);
    });

    // ── 학생: 언제든 익명 질문 제출 ──
    socket.on('student:askQuestion', ({ text }) => {
      const c = getByToken(socket.data.token ?? '');
      const trimmed = (text ?? '').trim();
      if (!c || !trimmed) return;
      const q = c.askQuestion(trimmed);
      emitQuestion(c, 'question:new', q);
      // 본인에게는 승인 전이라도 접수 확인용으로 전달 (모더레이션 대기 표시)
      if (!q.approved) socket.emit('question:new', q);
      persistQuestion(c, q);
    });

    // ── 학생: 질문 업보트 (1인 1질문 1회) ──
    socket.on('student:upvoteQuestion', ({ questionId }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid || !questionId) return;
      const q = c.upvoteQuestion(sid, questionId);
      if (!q) return;
      emitQuestion(c, 'question:update', q);
      persistQuestion(c, q);
    });

    // ── 강사: 답변완료 체크 / 승인 / 삭제 / Q&A 설정 ──
    socket.on('instructor:questionAnswered', ({ questionId, answered }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const q = c.setQuestionAnswered(questionId, !!answered);
      if (!q) return;
      emitQuestion(c, 'question:update', q);
      persistQuestion(c, q);
    });

    socket.on('instructor:questionApprove', ({ questionId }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const q = c.approveQuestion(questionId);
      if (!q) return;
      // 승인 시 참가자·프로젝터에는 처음 보이는 질문이므로 new 로 전달
      io.to(c.id).emit('question:new', q);
      persistQuestion(c, q);
    });

    socket.on('instructor:questionRemove', ({ questionId }) => {
      const c = instructorClassroom(socket);
      if (!c || !c.removeQuestion(questionId)) return;
      io.to(c.id).emit('question:remove', { id: questionId });
      deleteQuestionRow(c, questionId);
    });

    socket.on('instructor:qaSettings', (p) => {
      const c = instructorClassroom(socket);
      if (!c || !p || typeof p !== 'object') return;
      c.setQaSettings(p);
      broadcastState(c);
      // 모더레이션 전환 시 참가자 화면의 목록을 승인분 기준으로 재동기화
      if (typeof p.moderation === 'boolean') {
        io.to(c.id).emit('questions:sync', c.getQuestions(true));
        io.to(instructorRoom(c)).emit('questions:sync', c.getQuestions());
      }
    });

    socket.on('disconnect', () => {
      const c = getByToken(socket.data.token ?? '');
      if (!c || socket.data.role !== 'student') return;
      // 퇴장 반영 — 접속 수는 "현재 연결" 기준 (R3 결핍 13)
      if (socket.data.sessionId) c.markDisconnected(socket.data.sessionId, socket.id);
      broadcastParticipants(c);
    });
  });
}

function instructorClassroom(socket: Sock): ClassroomState | undefined {
  if (socket.data.role !== 'instructor') return undefined;
  return getByToken(socket.data.token ?? '');
}

// 늦게 들어온 학생/뷰어에게 현재 열린 활동 상태를 동기화 (역할별로 같은 필터를 적용)
function sendCurrentActivityTo(socket: Sock, c: ClassroomState) {
  if (!c.activity) return;
  const role = socket.data.role;
  socket.emit('activity:opened', c.activity);
  if (c.activity.type === 'poll' || c.activity.type === 'scale') {
    const id = c.activity.activityId;
    const distribution =
      role === 'instructor' ? c.pollDistribution(id, { forInstructor: true })
      : role === 'student' ? c.pollAggregate(id)
      : c.pollDistribution(id);
    socket.emit('poll:update', { activityId: id, distribution });
  }
  if (c.activity.type === 'survey') {
    socket.emit('survey:update', c.surveySummary(c.activity.activityId));
  }
  if ((c.activity.type === 'quiz' || c.activity.type === 'ox') && c.activity.quiz) {
    const phase = c.activity.quiz.phase;
    // 진행 중이거나 공개된 질문이면 문제 페이로드를 먼저 보냄
    if (phase === 'question' || phase === 'revealed') {
      const q = c.currentQuestionPayload();
      if (q) socket.emit('quiz:question', q);
    }
    // 정답 공개 상태면 reveal 데이터도 전송 (분포/정답 + 스태프는 리더보드, 참가자는 me)
    if (phase === 'revealed') {
      const r = c.quizReveal();
      if (!r) return;
      if (role === 'student') {
        const me = socket.data.sessionId ? c.rankBySession().get(socket.data.sessionId) : undefined;
        socket.emit('quiz:reveal', { ...r, leaderboard: [], me });
      } else {
        socket.emit('quiz:reveal', { ...r, leaderboard: c.leaderboard() });
      }
    }
  }
}
