import type { Deck, Slide, Activity, GenerateDeckRequest } from '../../../shared/types';
import { validateDeck } from '../decks/validate';
import { chatComplete } from './minimax';

function rid() { return Math.random().toString(36).slice(2, 10); }

interface GenSlide { title?: string; subtitle?: string; bullets?: string[]; notes?: string; activityId?: string; }
interface GenQuiz { question?: string; options?: string[]; correctIndex?: number; explanation?: string; }
interface GenSection { partTitle?: string; slides?: GenSlide[]; quiz?: GenQuiz[]; }
interface GenDeck { title?: string; sections?: GenSection[]; activities?: any[]; }

export function buildPrompt(opts: GenerateDeckRequest): { system: string; user: string } {
  const parts = Math.min(6, Math.max(1, opts.parts ?? 3));
  const quizN = Math.min(3, Math.max(0, opts.quizPerPart ?? 1));
  const audience = opts.audience || '고등학생';
  const reqActs = opts.activities || [];

  let actSchemaStr = '';
  let actRuleStr = '';
  if (reqActs.length > 0) {
    actSchemaStr = `, "activities": [{"id": string, "type": "roleplay"|"analogy"|"writing"|"tutor", "title": string, "intro": string` +
      `, "systemPrompt": string, "missionKeyword": string, "missionDescription": string` + // roleplay
      `, "topicPlaceholder": string, "personaA": string, "personaB": string` + // analogy
      `, "genre": "poem"|"story"|"essay", "promptPlaceholder": string` + // writing
      `, "subject": "math"|"coding"|"general", "taskDescription": string` + // tutor
      `}]`;
    actRuleStr = `\n또한, 다음 타입의 AI 실습 활동을 각각 1개씩 반드시 생성하여 'activities' 배열에 포함하고, 각 실습을 적절한 슬라이드의 'activityId'에 연결해줘: ${reqActs.join(', ')}. 각 활동 타입에 맞는 필수 구체 필드들을 작성해줘.`;
  }

  return {
    system:
      '너는 한국 학교 수업용 슬라이드를 설계하는 교육 콘텐츠 전문가야. 안전하고 교육적이며, 미성년자에게 부적절하거나 위험한 내용은 절대 넣지 않는다. 반드시 JSON 객체 하나만 출력하고 그 외 설명/말머리/코드펜스 텍스트는 쓰지 않는다.',
    user:
      `주제: "${opts.topic}"\n대상: ${audience}\n파트 수: ${parts}\n파트당 퀴즈: ${quizN}문제\n톤: ${opts.tone || '쉽고 친근하게'}\n\n` +
      `아래 JSON 스키마로만 응답해:\n` +
      `{"title": string, "sections": [{"partTitle": string, "slides": [{"title": string, "subtitle": string, "bullets": [string], "notes": string, "activityId": string}], "quiz": [{"question": string, "options": [string, string, string, string], "correctIndex": number, "explanation": string}]}]${actSchemaStr}}\n\n` +
      `규칙: 파트는 정확히 ${parts}개. 파트마다 슬라이드 2~4장, bullets 2~5개(짧은 문장). 퀴즈는 파트마다 ${quizN}문제, 보기 정확히 4개, correctIndex는 0~3, explanation 한 문장. 한국어. JSON 외 텍스트 금지.${actRuleStr}`,
  };
}

export function parseDeckJson(text: string, id: string, fallbackTitle: string): Deck {
  const title = (fallbackTitle || '새 강의').slice(0, 80);
  const slides: Slide[] = [];
  const activities: Record<string, Activity> = {};

  slides.push({ id: rid(), part: 0, partTitle: '시작', layout: 'title', title, subtitle: 'AI가 만든 초안 — 자유롭게 수정하세요', blocks: [], notes: '' });
  const pollId = 'poll_warm';
  activities[pollId] = { type: 'poll', id: pollId, title: '워밍업 투표', prompt: `${title} 하면 떠오르는 단어 하나!`, mode: 'wordcloud', options: [] };
  slides.push({ id: rid(), part: 0, partTitle: '시작', layout: 'content', title: '떠오르는 단어는?', subtitle: '폰으로 한 단어 입력!', blocks: [], notes: '', activityId: pollId });

  let parsed: GenDeck | null = null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch { parsed = null; }

  const realTitle = (parsed?.title || title).slice(0, 80);
  slides[0].title = realTitle;

  // 1. AI 실습 활동 파싱
  (parsed?.activities ?? []).forEach((act: any) => {
    if (!act || !act.type || !act.id) return;
    const key = act.id;
    if (act.type === 'roleplay') {
      activities[key] = {
        type: 'roleplay',
        id: key,
        title: act.title || 'AI 역할극',
        intro: act.intro || undefined,
        systemPrompt: act.systemPrompt || '너는 가이드야.',
        missionKeyword: act.missionKeyword || '',
        missionDescription: act.missionDescription || '',
      };
    } else if (act.type === 'analogy') {
      activities[key] = {
        type: 'analogy',
        id: key,
        title: act.title || '눈높이 비유',
        intro: act.intro || undefined,
        topicPlaceholder: act.topicPlaceholder || undefined,
        personaA: act.personaA || '7세 아동 눈높이 비유',
        personaB: act.personaB || '고등학생 맞춤 일상 비유',
      };
    } else if (act.type === 'writing') {
      activities[key] = {
        type: 'writing',
        id: key,
        title: act.title || '문학 창작',
        intro: act.intro || undefined,
        genre: ['poem', 'story', 'essay'].includes(act.genre) ? act.genre : 'poem',
        promptPlaceholder: act.promptPlaceholder || undefined,
      };
    } else if (act.type === 'tutor') {
      activities[key] = {
        type: 'tutor',
        id: key,
        title: act.title || 'AI 튜터',
        intro: act.intro || undefined,
        subject: ['math', 'coding', 'general'].includes(act.subject) ? act.subject : 'general',
        taskDescription: act.taskDescription || '문제를 입력해 보세요.',
      };
    }
  });

  // 2. 섹션 및 슬라이드 파싱
  (parsed?.sections ?? []).slice(0, 8).forEach((sec, si) => {
    const partTitle = (sec.partTitle || `파트 ${si + 1}`).slice(0, 60);
    slides.push({ id: rid(), part: si + 1, partTitle, layout: 'section', title: partTitle, subtitle: '', blocks: [], notes: '' });
    (sec.slides ?? []).slice(0, 6).forEach((sl) => {
      const activityId = sl.activityId && activities[sl.activityId] ? sl.activityId : undefined;
      slides.push({
        id: rid(), part: si + 1, partTitle, layout: 'content',
        title: (sl.title || '').slice(0, 120), subtitle: (sl.subtitle || '').slice(0, 160),
        blocks: (sl.bullets ?? []).slice(0, 6).map((b) => ({ kind: 'bullet' as const, text: String(b).slice(0, 400) })),
        notes: (sl.notes || '').slice(0, 400),
        activityId,
      });
    });
    const qs = (sec.quiz ?? []).slice(0, 5).filter((q) => q.question);
    if (qs.length) {
      const qid = 'quiz_' + rid();
      activities[qid] = {
        type: 'quiz', id: qid, title: `${partTitle} 퀴즈`,
        questions: qs.map((q) => ({
          id: rid(), question: String(q.question).slice(0, 200),
          options: (q.options ?? []).slice(0, 4).map((o) => String(o).slice(0, 120)),
          correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          timeLimitSec: 20, explanation: (q.explanation || '').slice(0, 300),
        })),
      };
      slides.push({ id: rid(), part: si + 1, partTitle, layout: 'content', title: `${partTitle} 퀴즈 🎮`, subtitle: '', blocks: [], notes: '', activityId: qid });
    }
  });

  // 3. 슬라이드에 연결되지 않은 AI 실습이 있다면 맨 뒤에 슬라이드로 자동 배치
  Object.keys(activities).forEach((actId) => {
    if (actId === 'poll_warm') return;
    const isAttached = slides.some((s) => s.activityId === actId);
    if (!isAttached) {
      const act = activities[actId];
      slides.push({
        id: rid(),
        part: slides[slides.length - 1]?.part || 1,
        partTitle: slides[slides.length - 1]?.partTitle || '실습',
        layout: 'content',
        title: act.title,
        subtitle: ('intro' in act && act.intro) ? act.intro : '실습을 진행해 봅시다',
        blocks: [],
        notes: '',
        activityId: actId,
      });
    }
  });

  return validateDeck({ id, title: realTitle, slides, activities }, id);
}

export async function generateDeck(opts: GenerateDeckRequest, id: string): Promise<Deck> {
  const { system, user } = buildPrompt(opts);
  const title = opts.topic?.slice(0, 80) || '새 강의';
  try {
    const { text } = await chatComplete(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.7, maxTokens: 4000 },
    );
    return parseDeckJson(text, id, title);
  } catch {
    return parseDeckJson('', id, title);
  }
}
