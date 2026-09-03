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
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  title: string;
  intro?: string;
  systemPrompt?: string;     // 서버 전용이지만 비밀 아님
  missions?: string[];       // 가이드 미션
}

export interface ImageActivity {
  type: 'image';
  id: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  title: string;
  intro?: string;
  suggestions?: string[];
}

export interface LabActivity {
  type: 'lab';
  id: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
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
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  title: string;
  intro?: string;
  questions: QuizQuestion[];
  // 문항 제한시간이 끝나면 강사 조작 없이 서버가 자동으로 정답을 공개 (강당 A5-3 / R3 결핍 12)
  autoReveal?: boolean;
}

export interface PollActivity {
  type: 'poll';
  id: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
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
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  title: string;
  intro?: string;
  systemPrompt: string;
  missionKeyword: string;
  missionDescription: string;
}

export interface AnalogyActivity {
  type: 'analogy';
  id: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  title: string;
  intro?: string;
  topicPlaceholder?: string;
  personaA: string;
  personaB: string;
}

export interface WritingActivity {
  type: 'writing';
  id: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  title: string;
  intro?: string;
  genre: 'poem' | 'story' | 'essay';
  promptPlaceholder?: string;
}

export interface TutorActivity {
  type: 'tutor';
  id: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
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
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  intro?: string;
  questions: SurveyQuestion[];
}

/** 1~5 척도 투표 — 큰 버튼 5개, 결과는 분포 막대+평균 */
export interface ScaleActivity {
  type: 'scale';
  id: string;
  title: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
  prompt: string;
  lowLabel?: string;
  highLabel?: string;
}

/** O/X 퀵 퀴즈 — 2지선다 대형 버튼. 점수·리더보드는 quiz 엔진 재사용 */
export interface OxActivity {
  type: 'ox';
  id: string;
  title: string;
  anonymous?: boolean;     // 활동 단위 익명 오버라이드 (undefined = 세션 정책 따름)
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

// ───────────────────────── 익명 정책 ─────────────────────────

/**
 * 세션(강의실) 익명 정책
 * - named_default: 기본 실명, 활동별로 익명 지정 가능 (기본값)
 * - anon_default : 기본 익명, 활동별로 실명 지정 가능
 * - always_anon  : 항상 익명 (활동 설정 무시)
 * - always_named : 항상 실명 (활동 설정 무시)
 */
export type AnonymityPolicy = 'anon_default' | 'named_default' | 'always_anon' | 'always_named';
export const ANONYMITY_POLICIES: AnonymityPolicy[] = ['named_default', 'anon_default', 'always_anon', 'always_named'];

/** 투표 결과 공개 방식 — after_close: 강사가 "결과 공개"를 누를 때까지 숨김(밴드왜건 방지), live: 실시간 공개 */
export type ResultsRevealPolicy = 'after_close' | 'live';

export interface ClassroomAnonSettings {
  anonymity: AnonymityPolicy;
  resultsReveal: ResultsRevealPolicy;
}

/** 세션 정책 + 활동 오버라이드 → 실제 익명 여부 */
export function resolveAnonymous(policy: AnonymityPolicy, activityAnonymous?: boolean): boolean {
  if (policy === 'always_anon') return true;
  if (policy === 'always_named') return false;
  if (typeof activityAnonymous === 'boolean') return activityAnonymous;
  return policy === 'anon_default';
}

// ───────────────────────── 실시간 상태 ─────────────────────────

export interface OpenActivityState {
  activityId: string;
  type: ActivityType;
  /** 이 활동이 익명으로 진행되는지 (세션 정책 + 활동 오버라이드 해석 결과) */
  anonymous: boolean;
  /** 투표 결과가 참가자/프로젝터에 공개됐는지. false 면 강사만 결과를 본다 */
  revealResults: boolean;
  /** 응답 마감 여부 (after_close 정책에서 "결과 공개" = 마감 + 공개) */
  closed?: boolean;
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

/**
 * 세션 모드 — classroom: 교실(기본, 기존 동작 그대로) / auditorium: 강당
 * 강당 모드는 프로젝터 상시 입장 바 + 대형 타이포, 참가자 대기 화면(슬라이드 미러링 없음),
 * /join 닉네임 자동 생성을 켠다.
 */
export type ClassroomMode = 'classroom' | 'auditorium';

export interface ClassroomSnapshot {
  token: string;
  title?: string;
  status: 'waiting' | 'live' | 'ended';
  deckId: string;
  currentSlide: number;
  activity: OpenActivityState | null;
  /** 현재 연결 중인 참가자 수 (퇴장 반영) */
  participantCount: number;
  mode: ClassroomMode;
  anonymity: AnonymityPolicy;
  resultsReveal: ResultsRevealPolicy;
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
  // wordcloud 모드 전용: 학생별 개별 응답 (롤링페이퍼 뷰에 사용). 익명 활동이면 nickname 이 빠진다
  entries?: Array<{ nickname?: string; value: string }>;
  // true 면 결과 미공개 상태 — counts/entries 는 비어 있고 total 만 유효
  hidden?: boolean;
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
  /** 열린 활동의 상태(익명/결과 공개/마감)만 바뀜 — 퀴즈 진행 상태는 건드리지 않는다 */
  'activity:updated': (a: OpenActivityState) => void;
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
  /** 투표 결과 공개 (after_close 정책: 응답 마감 + 결과 공개) */
  'instructor:revealResults': () => void;
  /** 세션 익명/결과 공개 정책 변경 */
  'instructor:updateSettings': (p: Partial<ClassroomAnonSettings>) => void;
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
  mode: ClassroomMode;
}

export interface CreateClassroomRequest {
  deckId?: string;
  title?: string;
  /** 생략 시 classroom */
  mode?: ClassroomMode;
  /** 세션 익명 정책 / 결과 공개 방식 (생략 시 named_default / after_close) */
  settings?: Partial<ClassroomAnonSettings>;
}

export interface ClassroomInfoResponse {
  exists: boolean;
  title?: string;
  status?: string;
  mode?: ClassroomMode;
  anonymity?: AnonymityPolicy;
  resultsReveal?: ResultsRevealPolicy;
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
