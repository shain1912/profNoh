import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ActivityType } from '../../shared/types';
import { getByToken, type ClassroomState } from './state';
import { getActivity } from './decks';
import { msg } from './copy';
import {
  persistParticipant, persistScore, persistPoll, persistQuizResponse, updateClassroomProgress, updateClassroomSettings,
} from './persist';

/** 강사 전용 룸 — 결과 미공개 투표의 실제 분포는 이 룸에만 보낸다 */
const instructorRoom = (c: ClassroomState) => `${c.id}:instructor`;
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
  const broadcastLeaderboard = (c: ClassroomState) => io.to(c.id).emit('leaderboard', c.leaderboard());
  const broadcastParticipants = (c: ClassroomState) =>
    io.to(c.id).emit('participants', { count: c.participantCount() });
  // 투표 분포 브로드캐스트: 강사에겐 항상 전체 분포, 나머지(학생·프로젝터)에겐 공개 상태에 따라 hidden/전체
  const broadcastPoll = (c: ClassroomState, activityId: string) => {
    io.to(instructorRoom(c)).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId, { forInstructor: true }) });
    io.to(c.id).except(instructorRoom(c)).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId) });
  };
  // 정답 공개 (강사 수동 / 타이머 자동 공통)
  const doQuizReveal = (c: ClassroomState) => {
    disarmTimer(c);
    const r = c.quizReveal();
    if (!r) return;
    io.to(c.id).emit('quiz:reveal', { ...r, leaderboard: c.leaderboard() });
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
      broadcastPoll(c, c.activity.activityId);
    }
    broadcastState(c);
  };

  io.on('connection', (socket: Sock) => {
    // ── 강사 입장 ──
    socket.on('instructor:join', ({ token, instructorSecret }) => {
      const c = getByToken(token);
      if (!c) return socket.emit('errmsg', { message: '강의실을 찾을 수 없습니다.' });
      if (c.instructorSecret !== instructorSecret)
        return socket.emit('errmsg', { message: '강사 권한이 없습니다.' });
      socket.data.role = 'instructor';
      socket.data.token = c.token;
      socket.join(c.id);
      socket.join(instructorRoom(c));
      socket.emit('state', c.snapshot());
      socket.emit('leaderboard', c.leaderboard());
      socket.emit('participants', { count: c.participantCount() });
      socket.emit('questions:sync', c.getQuestions());
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

      // 참가자를 먼저 DB에 기록 → 이후 AI 사용/퀴즈/랩 기록의 FK 보장
      await persistParticipant(c, p);

      socket.emit('joined', { participantId: p.id, sessionId: p.sessionId, nickname: p.nickname, score: p.score });
      socket.emit('state', c.snapshot());
      sendCurrentActivityTo(socket, c);
      broadcastParticipants(c);
    });

    // ── 뷰어(프로젝터) 입장: 읽기 전용, 참가자 미생성 ──
    socket.on('viewer:join', ({ token }) => {
      const c = getByToken(token);
      if (!c) return socket.emit('errmsg', { message: '강의실을 찾을 수 없습니다.' });
      socket.data.role = undefined;
      socket.data.token = c.token;
      socket.join(c.id);
      socket.emit('state', c.snapshot());
      socket.emit('leaderboard', c.leaderboard());
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
      const act = getActivity(c.deckId, activityId);
      if (!act) return socket.emit('errmsg', { message: '활동을 찾을 수 없습니다.' });
      disarmTimer(c);
      c.openActivity(activityId, act.type as ActivityType, {
        timerSec: typeof timerSec === 'number' ? timerSec : undefined,
        autoReveal: typeof autoReveal === 'boolean' ? autoReveal : undefined,
      });
      io.to(c.id).emit('activity:opened', c.activity!);
      broadcastState(c);
      if (act.type === 'poll') {
        broadcastPoll(c, activityId);
        const endsAt = c.activity?.poll?.endsAt;
        if (endsAt) armTimer(c, endsAt, () => doPollClose(c));
      }
    });

    // ── 강사: 투표 결과 공개 (after_close 정책이면 응답 마감 겸함) ──
    socket.on('instructor:revealResults', () => {
      const c = instructorClassroom(socket);
      if (!c || !c.activity) return;
      if (!c.revealResults()) return;
      if (c.activity.closed) disarmTimer(c); // 마감을 겸했으면 자동 마감 타이머 해제
      io.to(c.id).emit('activity:updated', c.activity);
      if (c.activity.type === 'poll') {
        broadcastPoll(c, c.activity.activityId);
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
        if (c.activity.type === 'poll') broadcastPoll(c, c.activity.activityId);
      }
      updateClassroomSettings(c);
    });

    socket.on('instructor:closeActivity', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      disarmTimer(c);
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
        broadcastPoll(c, c.activity.activityId);
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
        io.to(c.id).emit('leaderboard', c.leaderboard());
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
        io.to(c.id).emit('quiz:answered', { count: c.answeredCount() });
        const p = c.getBySession(sid);
        if (p) {
          // 세션 익명이면 리더보드가 가명이라 본인 점수를 못 찾으므로 자기 점수를 직접 갱신해 준다
          socket.emit('joined', { participantId: p.id, sessionId: p.sessionId, nickname: p.nickname, score: p.score });
          persistScore(c, p);
          persistQuizResponse(c, p, questionId, String(optionIndex), ans.correct, ans.ms, ans.points);
        }
      }
    });

    // ── 학생: 투표 ──
    socket.on('student:pollVote', ({ activityId, value }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid) return;
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

    // ── 학생: 언제든 익명 질문 제출 ──
    socket.on('student:askQuestion', ({ text }) => {
      const c = getByToken(socket.data.token ?? '');
      const trimmed = (text ?? '').trim();
      if (!c || !trimmed) return;
      const q = c.askQuestion(trimmed);
      io.to(c.id).emit('question:new', q);
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

// 늦게 들어온 학생/뷰어에게 현재 열린 활동 상태를 동기화
function sendCurrentActivityTo(socket: Sock, c: ClassroomState) {
  if (!c.activity) return;
  socket.emit('activity:opened', c.activity);
  if (c.activity.type === 'poll') {
    const forInstructor = socket.data.role === 'instructor';
    socket.emit('poll:update', { activityId: c.activity.activityId, distribution: c.pollDistribution(c.activity.activityId, { forInstructor }) });
  }
  if (c.activity.type === 'quiz' && c.activity.quiz) {
    const phase = c.activity.quiz.phase;
    // 진행 중이거나 공개된 질문이면 문제 페이로드를 먼저 보냄
    if (phase === 'question' || phase === 'revealed') {
      const q = rebuildQuestionPayload(c);
      if (q) socket.emit('quiz:question', q);
    }
    // 정답 공개 상태면 reveal 데이터도 전송 (분포/정답/리더보드)
    if (phase === 'revealed') {
      const r = c.quizReveal();
      if (r) socket.emit('quiz:reveal', { ...r, leaderboard: c.leaderboard() });
    }
  }
}

function rebuildQuestionPayload(c: ClassroomState) {
  const act = getActivity(c.deckId, c.activity!.activityId);
  if (!act || act.type !== 'quiz' || !c.activity?.quiz) return null;
  const idx = c.activity.quiz.index;
  const q = act.questions[idx];
  if (!q) return null;
  return {
    questionId: q.id,
    index: idx,
    total: act.questions.length,
    question: q.question,
    options: q.options,
    endsAt: c.activity.quiz.endsAt!,
  };
}
