import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ActivityType } from '../../shared/types';
import { getByToken, type ClassroomState } from './state';
import {
  persistParticipant, persistScore, persistPoll, persistQuizResponse, updateClassroomProgress,
  persistSurvey, persistQuestion, deleteQuestionRow,
} from './persist';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface SocketData {
  role?: 'instructor' | 'student';
  token?: string;
  sessionId?: string;
}

// 강사 전용 room (미승인 질문 등 강사만 봐야 하는 이벤트)
const instructorRoom = (c: ClassroomState) => `${c.id}:instructor`;

export function setupSocket(io: IO) {
  const broadcastState = (c: ClassroomState) => io.to(c.id).emit('state', c.snapshot());
  const broadcastLeaderboard = (c: ClassroomState) => io.to(c.id).emit('leaderboard', c.leaderboard());
  const broadcastParticipants = (c: ClassroomState) =>
    io.to(c.id).emit('participants', { count: c.participantCount() });

  // 설문 집계 브로드캐스트는 제출마다가 아니라 활동당 최대 2회/초로 묶어서 전송 (400명 동시 제출 대비)
  const surveyTimers = new Map<string, NodeJS.Timeout>();
  const broadcastSurvey = (c: ClassroomState, activityId: string, immediate = false) => {
    const key = `${c.id}|${activityId}`;
    const send = () => {
      surveyTimers.delete(key);
      io.to(c.id).emit('survey:update', c.surveySummary(activityId));
    };
    if (immediate) {
      const t = surveyTimers.get(key);
      if (t) clearTimeout(t);
      return send();
    }
    if (surveyTimers.has(key)) return;
    surveyTimers.set(key, setTimeout(send, 500));
  };
  // 질문 이벤트: 승인된 질문은 방 전체, 미승인은 강사 room 에만 (강사는 두 room 에 다 있어 클라이언트가 id 로 중복 제거)
  const emitQuestion = (c: ClassroomState, ev: 'question:new' | 'question:update', q: { approved: boolean } & Parameters<ServerToClientEvents['question:new']>[0]) => {
    if (q.approved) io.to(c.id).emit(ev, q);
    else io.to(instructorRoom(c)).emit(ev, q);
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
      sendCurrentActivityTo(socket, c);
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
      socket.emit('questions:sync', c.getQuestions(true));
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
    socket.on('instructor:openActivity', ({ activityId }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const act = c.resolveActivity(activityId);
      if (!act) return socket.emit('errmsg', { message: '활동을 찾을 수 없습니다.' });
      c.openActivity(activityId, act.type as ActivityType);
      io.to(c.id).emit('activity:opened', c.activity!);
      broadcastState(c);
      if (act.type === 'poll' || act.type === 'scale') io.to(c.id).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId) });
      if (act.type === 'survey') broadcastSurvey(c, activityId, true);
    });

    // ── 강사: OX 즉석 퀴즈 — 덱 편집 없이 제목·정답만으로 바로 열기 ──
    socket.on('instructor:quickOx', ({ question, answer, timeLimitSec }) => {
      const c = instructorClassroom(socket);
      if (!c) return;
      const q = (question ?? '').trim();
      if (!q) return socket.emit('errmsg', { message: '문제를 입력하세요.' });
      const act = c.createQuickOx({ question: q, answer, timeLimitSec });
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

    // ── 학생: 투표 (poll · scale 공통 — scale 은 '1'~'5' 만 허용) ──
    socket.on('student:pollVote', ({ activityId, value }) => {
      const c = getByToken(socket.data.token ?? '');
      const sid = socket.data.sessionId;
      if (!c || !sid) return;
      if (c.resolveActivity(activityId)?.type === 'scale' && !['1', '2', '3', '4', '5'].includes(String(value))) return;
      c.recordPoll(sid, activityId, value);
      io.to(c.id).emit('poll:update', { activityId, distribution: c.pollDistribution(activityId) });
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
  if (c.activity.type === 'poll' || c.activity.type === 'scale') {
    socket.emit('poll:update', { activityId: c.activity.activityId, distribution: c.pollDistribution(c.activity.activityId) });
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
    // 정답 공개 상태면 reveal 데이터도 전송 (분포/정답/리더보드)
    if (phase === 'revealed') {
      const r = c.quizReveal();
      if (r) socket.emit('quiz:reveal', { ...r, leaderboard: c.leaderboard() });
    }
  }
}
