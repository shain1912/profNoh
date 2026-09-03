// 공용 타입 (server / client 공유)

// ───────────────────────── 콘텐츠(덱) ─────────────────────────

export type SlideLayout = 'title' | 'section' | 'content' | 'big' | 'twocol' | 'pdf' | 'embed' | 'image';

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
  embedUrl?: string;         // 외부 슬라이드 임베드 URL (layout === 'embed', 정규화된 https URL)
  imageUrl?: string;         // 업로드 이미지 경로 (layout === 'image')
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
  examplePrompts?: string[]; // 원클릭 예시 프롬프트 (칩)
  // 예시 프롬프트별 고정 결과 (있으면 실시간 AI 호출 없이 이 값을 그대로 보여줌 — 두 결과의 차이를 항상 크게 보장)
  cannedResults?: Record<string, { outputA: string; outputB: string }>;
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
  // 문항 제한시간이 끝나면 강사 조작 없이 서버가 자동으로 정답을 공개 (강당 A5-3 / R3 결핍 12)
  autoReveal?: boolean;
}

export interface PollActivity {
  type: 'poll';
  id: string;
  title: string;
  prompt: string;
  mode: 'choice' | 'wordcloud';
  options?: string[];        // mode==='choice' 일 때
  // 활동 타이머(초). 설정하면 프로젝터에 게이지가 뜨고 종료 시 자동 마감(추가 응답 차단).
  // 타이머가 있는 투표는 마감 전까지 결과를 숨긴다(밴드왜건 방지) — 없으면 기존처럼 실시간 공개.
  timerSec?: number;
  // 마감 시 자동으로 결과 공개. false면 강사가 "결과 공개"를 눌러야 함.
  autoReveal?: boolean;
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
    autoReveal?: boolean; // 시간 종료 시 서버가 자동 정답 공개
  };
  // 투표 타이머/마감 상태 (poll 활동에서만)
  poll?: {
    timerSec?: number;
    endsAt?: number;      // epoch ms — 타이머가 있을 때만
    closed: boolean;      // 마감: 추가 응답 차단
    revealed: boolean;    // 결과 공개 여부 (타이머 없는 투표는 처음부터 true)
    autoReveal: boolean;  // 마감 시 자동 공개
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
  // wordcloud 모드 전용: 학생별 개별 응답 (롤링페이퍼 뷰에 사용)
  entries?: Array<{ nickname: string; value: string }>;
}

export interface QuizReveal {
  questionId: string;
  correctIndex: number;
  distribution: Record<string, number>; // optionIndex -> count
  leaderboard: LeaderboardEntry[];
  explanation?: string;
}

export interface QuestionItem {
  id: string;
  text: string;
  createdAt: number;
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
  'question:new': (q: QuestionItem) => void;
  'questions:sync': (qs: QuestionItem[]) => void;
}

export interface ClientToServerEvents {
  'instructor:join': (p: { token: string; instructorSecret: string }) => void;
  'student:join': (p: { token: string; nickname: string; sessionId?: string }) => void;
  'instructor:goto': (p: { slide: number }) => void;
  // timerSec/autoReveal 을 주면 덱에 저장된 값 대신 이번 실행에만 적용 (즉석 타이머)
  'instructor:openActivity': (p: { activityId: string; timerSec?: number; autoReveal?: boolean }) => void;
  'instructor:closeActivity': () => void;
  'instructor:pollClose': () => void;   // 투표 지금 마감 (타이머 전에)
  'instructor:pollReveal': () => void;  // 마감된 투표 결과 수동 공개
  'instructor:quizStart': () => void;
  'instructor:quizNext': () => void;
  'instructor:quizReveal': () => void;
  'student:quizAnswer': (p: { questionId: string; optionIndex: number }) => void;
  'student:pollVote': (p: { activityId: string; value: string }) => void;
  'student:roleplayClear': (p: { activityId: string }) => void;
  'instructor:panic': (p: { action: 'pause' | 'resume' }) => void;
  'viewer:join': (p: { token: string }) => void;
  'student:askQuestion': (p: { text: string }) => void;
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
  activities?: ('roleplay' | 'analogy' | 'writing' | 'tutor' | 'chat' | 'image' | 'lab')[];
}
