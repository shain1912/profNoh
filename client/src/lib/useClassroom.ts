import { useEffect, useRef, useState } from 'react';
import type {
  ClassroomSnapshot,
  OpenActivityState,
  LeaderboardEntry,
  QuizReveal,
  PollDistribution,
} from '@shared/types';
import { getSocket, type AppSocket } from './socket';
import type { QuizQuestionPayload } from '../components/activities/QuizStudent';

export interface ClassroomLive {
  socket: AppSocket;
  connected: boolean;
  snapshot: ClassroomSnapshot | null;
  slideIndex: number;
  activity: OpenActivityState | null;
  question: QuizQuestionPayload | null;
  reveal: QuizReveal | null;
  leaderboard: LeaderboardEntry[];
  participantCount: number;
  answeredCount: number;
  polls: Record<string, PollDistribution>;
  notice: string | null;
  joined: { participantId: string; sessionId: string; nickname: string; score: number } | null;
  error: string | null;
}

export function useClassroom(join: (s: AppSocket) => void): ClassroomLive {
  const socket = getSocket();
  const joinRef = useRef(join);
  joinRef.current = join;

  const [connected, setConnected] = useState(socket.connected);
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [activity, setActivity] = useState<OpenActivityState | null>(null);
  const [question, setQuestion] = useState<QuizQuestionPayload | null>(null);
  const [reveal, setReveal] = useState<QuizReveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [polls, setPolls] = useState<Record<string, PollDistribution>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [joined, setJoined] = useState<ClassroomLive['joined']>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      joinRef.current(socket);
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', (snap) => {
      setSnapshot(snap);
      setSlideIndex(snap.currentSlide);
      setActivity(snap.activity);
      setParticipantCount(snap.participantCount);
    });
    socket.on('slide:changed', (n) => setSlideIndex(n));
    socket.on('activity:opened', (a) => {
      setActivity(a);
      setReveal(null);
      if (a.type !== 'quiz') setQuestion(null);
      setAnsweredCount(0);
    });
    socket.on('activity:closed', () => {
      setActivity(null);
      setQuestion(null);
      setReveal(null);
    });
    socket.on('quiz:question', (q) => {
      setQuestion(q);
      setReveal(null);
      setAnsweredCount(0);
    });
    socket.on('quiz:reveal', (r) => {
      setReveal(r);
      setLeaderboard(r.leaderboard);
    });
    socket.on('leaderboard', (l) => setLeaderboard(l));
    socket.on('participants', (p) => setParticipantCount(p.count));
    socket.on('quiz:answered', (p) => setAnsweredCount(p.count));
    socket.on('poll:update', (p) =>
      setPolls((prev) => ({ ...prev, [p.activityId]: p.distribution })),
    );
    socket.on('notice', (n) => {
      setNotice(n.message);
      setTimeout(() => setNotice(null), 4000);
    });
    socket.on('joined', (j) => setJoined(j));
    socket.on('errmsg', (e) => setError(e.message));

    if (socket.connected) {
      setConnected(true);
      joinRef.current(socket);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state');
      socket.off('slide:changed');
      socket.off('activity:opened');
      socket.off('activity:closed');
      socket.off('quiz:question');
      socket.off('quiz:reveal');
      socket.off('leaderboard');
      socket.off('participants');
      socket.off('quiz:answered');
      socket.off('poll:update');
      socket.off('notice');
      socket.off('joined');
      socket.off('errmsg');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    socket,
    connected,
    snapshot,
    slideIndex,
    activity,
    question,
    reveal,
    leaderboard,
    participantCount,
    answeredCount,
    polls,
    notice,
    joined,
    error,
  };
}
