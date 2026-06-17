import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ActivityType } from '../../shared/types';
import { getByToken, type ClassroomState } from './state';
import { getActivity } from './decks';
import {
  persistParticipant, persistScore, persistPoll, persistQuizResponse, updateClassroomProgress,
} from './persist';

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
      socket.emit('state', c.snapshot());
      socket.emit('leaderboard', c.leaderboard());
      socket.emit('participants', { count: c.participantCount() });
    });

    // ── 학생 입장 ──
    socket.on('student:join', async ({ token, nickname, sessionId }) => {
      const c = getByToken(token);
      if (!c) return socket.emit('errmsg', { message: '강의실 코드를 다시 확인해줘!' });
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
    socket.on('instructor:openActivity', ({ activityId }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const act = getActivity(c.deckId, activityId);
      if (!act) return socket.emit('errmsg', { message: '활동을 찾을 수 없습니다.' });
      c.openActivity(activityId, act.type as ActivityType);
      io.to(c.id).emit('activity:opened', c.activity!);
      broadcastState(c);
      if (act.type === 'poll') io.to(c.id).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId) });
    });

    socket.on('instructor:closeActivity', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      c.closeActivity();
      io.to(c.id).emit('activity:closed');
      broadcastState(c);
    });

    // ── 강사: 퀴즈 진행 ──
    socket.on('instructor:quizStart', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const q = c.quizStartQuestion();
      if (!q) return;
      io.to(c.id).emit('quiz:question', q);
      broadcastState(c);
    });

    socket.on('instructor:quizReveal', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const r = c.quizReveal();
      if (!r) return;
      io.to(c.id).emit('quiz:reveal', { ...r, leaderboard: c.leaderboard() });
      broadcastLeaderboard(c);
      broadcastState(c);
    });

    socket.on('instructor:quizNext', () => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const moved = c.quizNext();
      if (moved) {
        const q = c.quizStartQuestion();
        if (q) io.to(c.id).emit('quiz:question', q);
      } else {
        io.to(c.id).emit('leaderboard', c.leaderboard());
        io.to(c.id).emit('notice', { message: '퀴즈 끝! 최종 순위를 확인하세요 🏆' });
      }
      broadcastState(c);
    });

    // ── 강사: 패닉(일시정지/재개) ──
    socket.on('instructor:panic', ({ action }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      c.setPaused(action === 'pause');
      io.to(c.id).emit('notice', {
        message: action === 'pause' ? 'AI 실습이 잠시 멈췄어요 ⏸️' : 'AI 실습이 다시 열렸어요 ▶️',
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
      c.recordPoll(sid, activityId, value);
      io.to(c.id).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId) });
      const p = c.getBySession(sid);
      if (p) persistPoll(c, p, activityId, value);
    });

    socket.on('disconnect', () => {
      const c = getByToken(socket.data.token ?? '');
      if (c && socket.data.role === 'student') broadcastParticipants(c);
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
    socket.emit('poll:update', { activityId: c.activity.activityId, distribution: c.pollDistribution(c.activity.activityId) });
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
