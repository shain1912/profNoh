// 공용 타입 (server / client 공유)

// ───────────────────────── 콘텐츠(덱) ─────────────────────────

export type SlideLayout = 'title' | 'section' | 'content' | 'big' | 'twocol' | 'pdf';

export interface SlideBlock {
  kind: 'h' | 'p' | 'bullet' | 'note' | 'quote' | 'callout';
  text: string;
}

export interface Slide {
  id: string;
  part: number; // 0~7
  partTitle: string;
  layout: SlideLayout;
  title?: string;
  subtitle?: string;
  blocks?: SlideBlock[];
  notes?: string;            // 강사 노트
  activityId?: string;       // 이 슬라이드에 연결된 활동
  pdfUrl?: string;           // PDF 파일 경로 (layout === 'pdf')
  pageNumber?: number;       // PDF 페이지 번호 (layout === 'pdf')
  youtubeUrl?: string;       // 유튜브 동영상 링크
}

export type ActivityType = 'chat' | 'image' | 'lab' | 'quiz' | 'poll' | 'roleplay' | 'analogy' | 'writing' | 'tutor';

export interface ChatActivity {
  type: 'chat';
  id: string;
  title: string;
  intro?: string;
  systemPrompt?: string;     // 서버 전용이지만 비밀 아님
  missions?: string[];       // 가이드 미션
}

export interface ImageActivity {
  type: 'image';
  id: string;
  title: string;
  intro?: string;
  suggestions?: string[];
}

export interface LabActivity {
  type: 'lab';
  id: string;
  labType: 'prompt' | 'context' | 'harness';
  title: string;
  intro?: string;
  task: string;              // 학생에게 주어지는 과제 설명
  inputPlaceholder?: string;
  labelA: string;            // 예: "맥락 없음"
  labelB: string;            // 예: "맥락 있음"
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  timeLimitSec: number;
  // correctIndex 는 서버 전용 — 학생에게 전송되는 PublicDeck 에서는 제거됨
  correctIndex?: number;
  explanation?: string;
}

export interface QuizActivity {
  type: 'quiz';
  id: string;
  title: string;
  intro?: string;
  questions: QuizQuestion[];
}

export interface PollActivity {
  type: 'poll';
  id: string;
  title: string;
  prompt: string;
  mode: 'choice' | 'wordcloud';
  options?: string[];        // mode==='choice' 일 때
}

export interface RoleplayActivity {
  type: 'roleplay';
  id: string;
  title: string;
  intro?: string;
  systemPrompt: string;
  missionKeyword: string;
  missionDescription: string;
}

export interface AnalogyActivity {
  type: 'analogy';
  id: string;
  title: string;
  intro?: string;
  topicPlaceholder?: string;
  personaA: string;
  personaB: string;
}

export interface WritingActivity {
  type: 'writing';
  id: string;
  title: string;
  intro?: string;
  genre: 'poem' | 'story' | 'essay';
  promptPlaceholder?: string;
}

export interface TutorActivity {
  type: 'tutor';
  id: string;
  title: string;
  intro?: string;
  subject: 'math' | 'coding' | 'general';
  taskDescription: string;
}

export type Activity =
  | ChatActivity
  | ImageActivity
  | LabActivity
  | QuizActivity
  | PollActivity
  | RoleplayActivity
  | AnalogyActivity
  | WritingActivity
  | TutorActivity;

export interface Deck {
  id: string;
  title: string;
  slides: Slide[];
  activities: Record<string, Activity>;
}

// ───────────────────────── 실시간 상태 ─────────────────────────

export interface OpenActivityState {
  activityId: string;
  type: ActivityType;
  // 퀴즈 진행 상태
  quiz?: {
    index: number;
    total: number;
    phase: 'idle' | 'question' | 'revealed';
    questionId?: string;
    endsAt?: number; // epoch ms
  };
}

export interface ClassroomSnapshot {
  token: string;
  title?: string;
  status: 'waiting' | 'live' | 'ended';
  deckId: string;
  currentSlide: number;
  activity: OpenActivityState | null;
  participantCount: number;
}

export interface LeaderboardEntry {
  nickname: string;
  score: number;
  rank: number;
}

export interface PollDistribution {
  // choice 모드: optionIndex -> count, wordcloud: word -> count
  counts: Record<string, number>;
  total: number;
}

export interface QuizReveal {
  questionId: string;
  correctIndex: number;
  distribution: Record<string, number>; // optionIndex -> count
  leaderboard: LeaderboardEntry[];
  explanation?: string;
}

// ───────────────────────── Socket 이벤트 ─────────────────────────

export interface ServerToClientEvents {
  state: (snap: ClassroomSnapshot) => void;
  'slide:changed': (slide: number) => void;
  'activity:opened': (a: OpenActivityState) => void;
  'activity:closed': () => void;
  'quiz:question': (q: {
    questionId: string;
    index: number;
    total: number;
    question: string;
    options: string[];
    endsAt: number;
  }) => void;
  'quiz:reveal': (r: QuizReveal) => void;
  leaderboard: (top: LeaderboardEntry[]) => void;
  participants: (p: { count: number }) => void;
  'quiz:answered': (p: { count: number }) => void;
  notice: (p: { message: string; kind?: 'info' | 'pause' | 'resume' }) => void;
  'poll:update': (d: { activityId: string; distribution: PollDistribution }) => void;
  joined: (p: { participantId: string; sessionId: string; nickname: string; score: number }) => void;
  errmsg: (m: { message: string }) => void;
}

export interface ClientToServerEvents {
  'instructor:join': (p: { token: string; instructorSecret: string }) => void;
  'student:join': (p: { token: string; nickname: string; sessionId?: string }) => void;
  'instructor:goto': (p: { slide: number }) => void;
  'instructor:openActivity': (p: { activityId: string }) => void;
  'instructor:closeActivity': () => void;
  'instructor:quizStart': () => void;
  'instructor:quizNext': () => void;
  'instructor:quizReveal': () => void;
  'student:quizAnswer': (p: { questionId: string; optionIndex: number }) => void;
  'student:pollVote': (p: { activityId: string; value: string }) => void;
  'student:roleplayClear': (p: { activityId: string }) => void;
  'instructor:panic': (p: { action: 'pause' | 'resume' }) => void;
  'viewer:join': (p: { token: string }) => void;
}

// ───────────────────────── REST DTO ─────────────────────────

export interface CreateClassroomResponse {
  classroomId: string;
  token: string;
  instructorSecret: string;
  deckId: string;
}

export interface ClassroomInfoResponse {
  exists: boolean;
  title?: string;
  status?: string;
}

export interface ChatRequest {
  token: string;
  sessionId: string;
  activityId: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
}

export interface ImageRequest {
  token: string;
  sessionId: string;
  activityId: string;
  prompt: string;
  style?: string;
}

export interface LabRequest {
  token: string;
  sessionId: string;
  activityId: string;
  input: string;
}

export interface QuotaError {
  error: 'quota' | 'safety' | 'budget' | 'notfound' | 'bad';
  message: string;
}

// ───────────────────────── 저작(덱 빌더) DTO ─────────────────────────

export interface DeckSummary {
  id: string;
  title: string;
  slideCount: number;
  updatedAt: string;
}

export interface CreateDeckResponse {
  deckId: string;
  editPin: string;
}

/** 편집기 진입: PIN 검증 후 정답 포함 전체 덱 반환 */
export interface DeckEditResponse {
  deck: Deck;
  title: string;
}

export interface SaveDeckRequest {
  deckId: string;
  editPin: string;
  deck: Deck;
}

export interface GenerateDeckRequest {
  topic: string;
  audience?: string;
  parts?: number;
  quizPerPart?: number;
  tone?: string;
  activities?: ('roleplay' | 'analogy' | 'writing' | 'tutor')[];
}
