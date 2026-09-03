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

export type ActivityType = 'chat' | 'image' | 'lab' | 'quiz' | 'poll' | 'roleplay' | 'analogy' | 'writing' | 'tutor' | 'survey' | 'scale' | 'ox';

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

// ── 강당용 활동 3종 (survey · scale · ox) ──

export type SurveyQuestionKind = 'likert' | 'nps' | 'text';

export interface SurveyQuestion {
  id: string;
  kind: SurveyQuestionKind; // likert: 1~5 · nps: 0~10 · text: 주관식
  text: string;
  lowLabel?: string;         // 척도 왼쪽 라벨 (예: 전혀 아니다)
  highLabel?: string;        // 척도 오른쪽 라벨 (예: 매우 그렇다)
}

/** 다문항 자기 페이스 설문 (만족도 등). 참가자는 한 화면에서 전부 응답 후 1회 제출 */
export interface SurveyActivity {
  type: 'survey';
  id: string;
  title: string;
  intro?: string;
  questions: SurveyQuestion[];
}

/** 1~5 척도 투표 — 큰 버튼 5개, 결과는 분포 막대+평균 */
export interface ScaleActivity {
  type: 'scale';
  id: string;
  title: string;
  prompt: string;
  lowLabel?: string;
  highLabel?: string;
}

/** O/X 퀵 퀴즈 — 2지선다 대형 버튼. 점수·리더보드는 quiz 엔진 재사용 */
export interface OxActivity {
  type: 'ox';
  id: string;
  title: string;
  question: string;
  // answer 는 서버 전용 — 학생에게 전송되는 PublicDeck 에서는 제거됨
  answer?: 'O' | 'X';
  timeLimitSec: number;
  explanation?: string;
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
  | TutorActivity
  | SurveyActivity
  | ScaleActivity
  | OxActivity;

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
  // 설문 진행 상태 — open: 응답 접수 중 · closed: 마감(결과 공개)
  survey?: { phase: 'open' | 'closed' };
  // 덱에 없는 즉석 활동(OX 퀵 퀴즈). 클라이언트는 deck.activities 대신 이걸 사용 (정답 제거된 공개 버전)
  adhoc?: Activity;
}

/** Q&A 운영 상태 (강사가 토글) */
export interface QaSettings {
  moderation: boolean; // true: 승인 후 공개
  onScreen: boolean;   // true: 프로젝터에 질문 카드 뷰 표시
}

export interface ClassroomSnapshot {
  token: string;
  title?: string;
  status: 'waiting' | 'live' | 'ended';
  deckId: string;
  currentSlide: number;
  activity: OpenActivityState | null;
  participantCount: number;
  qa?: QaSettings;
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
  upvotes: number;
  answered: boolean;
  approved: boolean; // 모더레이션 ON 일 때 강사 승인 전 false — 참가자·프로젝터에는 미전송
}

/** 설문 집계 (익명 — 개인 식별 정보 없음) */
export interface SurveySummary {
  activityId: string;
  total: number; // 제출한 참가자 수
  questions: Array<{
    id: string;
    kind: SurveyQuestionKind;
    count: number;                  // 이 문항에 응답한 수
    avg: number | null;             // likert/nps 평균 (소수 2자리)
    dist: Record<string, number>;   // 값 -> 인원
    texts?: string[];               // text 문항: 최근 응답 (최대 50)
  }>;
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
  'question:update': (q: QuestionItem) => void;
  'question:remove': (p: { id: string }) => void;
  'questions:sync': (qs: QuestionItem[]) => void;
  'survey:update': (s: SurveySummary) => void;
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
  'student:askQuestion': (p: { text: string }) => void;
  // ── 강당 활동 (survey · ox 즉석 · Q&A 2.0) ──
  'student:surveySubmit': (p: { activityId: string; answers: Record<string, number | string> }) => void;
  'instructor:surveyClose': () => void;
  'instructor:quickOx': (p: { question: string; answer: 'O' | 'X'; timeLimitSec?: number }) => void;
  'student:upvoteQuestion': (p: { questionId: string }) => void;
  'instructor:questionAnswered': (p: { questionId: string; answered: boolean }) => void;
  'instructor:questionApprove': (p: { questionId: string }) => void;
  'instructor:questionRemove': (p: { questionId: string }) => void;
  'instructor:qaSettings': (p: Partial<QaSettings>) => void;
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
  activities?: ('roleplay' | 'analogy' | 'writing' | 'tutor' | 'chat' | 'image' | 'lab' | 'survey' | 'scale' | 'ox')[];
}
