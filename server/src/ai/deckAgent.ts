import type { Deck, Slide } from '../../../shared/types';
import { chatComplete } from './minimax';
import { ACTIVITY_GEN_SPECS, GEN_TYPES, type GenType } from './activitySpecs';

// 생성 가능한 활동 타입 = 레지스트리(activitySpecs.ts)에 등록된 모든 타입
export type QuickGenType = GenType;

interface PlanItem { afterSlideIndex: number; topic: string; style?: QuizStyle }

// 퀴즈 문항 유형 — 프롬프트 지시만으로는 세트 전체의 유형 비율이 안 지켜지므로(recall 65~67% 정체 실측),
// 계획 단계에서 항목별로 결정적으로 할당한다. 5문항 기준: 적용 3 / 분석 1 / 회상 1.
type QuizStyle = 'apply' | 'analyze' | 'recall';
// 적용형 비중을 60%로 올리자 생성·검증 모두 같은 모델이라 계산 오류가 급증(87%)했음 — 모델 능력에 맞춘 보정 쿼터.
const QUIZ_STYLE_CYCLE: QuizStyle[] = ['apply', 'recall', 'analyze', 'apply', 'recall'];
const QUIZ_STYLE_INSTRUCTION: Record<QuizStyle, string> = {
  apply:
    '이 문항은 반드시 "적용형"으로: 원문 개념을 원문에 없는 새로운 상황·사례·수치에 적용하거나 계산해야 풀 수 있게 만들어라. 원문 문장을 그대로 되묻는 것 금지.',
  analyze:
    '이 문항은 반드시 "분석형"으로: 두 개념의 비교, 원인-결과 판단, 주어진 사례가 어느 개념에 해당하는지 분류하는 문항으로 만들어라.',
  recall:
    '이 문항은 "핵심 확인형": 원문의 가장 중요한 핵심 사실 하나를 확인하는 문항으로 만들어라.',
};
interface Operation { type: `add_${QuickGenType}`; afterSlideIndex: number; activity: any }

const rid = () => Math.random().toString(36).slice(2, 10);
const clamp = (s: unknown, max: number): string => (typeof s === 'string' ? s : '').slice(0, max);

function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** "[Page N]\n...텍스트..." 형태로 이어붙여진 pdf.js 추출 텍스트를 페이지별로 분리 */
function splitPdfPages(pdfText: string): Map<number, string> {
  const pages = new Map<number, string>();
  const re = /\[Page (\d+)\]\n([\s\S]*?)(?=\[Page \d+\]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdfText))) {
    pages.set(Number(m[1]), m[2].trim());
  }
  return pages;
}

/** afterSlideIndex 위치에서 가장 가까운 pdf 슬라이드의 본문 텍스트를 찾아준다 (앞쪽 우선, 없으면 뒤쪽) */
function contextTextFor(slides: Slide[], afterSlideIndex: number, pageTexts: Map<number, string>): string {
  for (let i = afterSlideIndex; i >= 0; i--) {
    const s = slides[i];
    if (s?.layout === 'pdf' && s.pageNumber && pageTexts.has(s.pageNumber)) return pageTexts.get(s.pageNumber)!;
  }
  for (let i = afterSlideIndex + 1; i < slides.length; i++) {
    const s = slides[i];
    if (s?.layout === 'pdf' && s.pageNumber && pageTexts.has(s.pageNumber)) return pageTexts.get(s.pageNumber)!;
  }
  return '';
}

const TYPE_LABEL: Record<QuickGenType, string> = Object.fromEntries(
  GEN_TYPES.map((t) => [t, ACTIVITY_GEN_SPECS[t].label]),
) as Record<QuickGenType, string>;

/** 1단계: 어느 슬라이드 뒤에 몇 개를 넣을지만 결정 (작은 출력 → 잘릴 위험이 거의 없음) */
async function planInsertions(
  type: QuickGenType, count: number, deck: Deck, pageTexts: Map<number, string>,
): Promise<PlanItem[]> {
  const pdfSlideIndices = deck.slides
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.layout === 'pdf')
    .map((x) => x.i);

  // pool 안에서 count개를 고르게 분산 배치. pool이 count보다 작으면(예: 1페이지짜리 PDF에 퀴즈 3개 요청)
  // 자리가 겹치더라도 요청한 개수를 그대로 보장한다 — 분산은 "가능한 범위 안에서 최대한"이지, 개수를 깎는 이유가 되면 안 됨.
  const distribute = (pool: number[]): PlanItem[] => {
    if (pool.length === 0) return [];
    const step = pool.length / (count + 1);
    return Array.from({ length: count }, (_, i) => ({
      afterSlideIndex: pool[Math.max(0, Math.min(pool.length - 1, Math.round((i + 1) * step)))],
      topic: '',
    }));
  };

  const fallback = (): PlanItem[] => distribute(pdfSlideIndices.length > 0 ? pdfSlideIndices : deck.slides.map((_, i) => i));

  if (pdfSlideIndices.length === 0) return fallback();

  // 프롬프트 크기 제한: 페이지가 많으면 앞부분만 촘촘히, 전체를 골고루 샘플링
  const MAX_PAGES_IN_PROMPT = 60;
  const SNIPPET_LEN = 220;
  const sampled = pdfSlideIndices.length <= MAX_PAGES_IN_PROMPT
    ? pdfSlideIndices
    : pdfSlideIndices.filter((_, i) => i % Math.ceil(pdfSlideIndices.length / MAX_PAGES_IN_PROMPT) === 0);

  const listLines = sampled.map((idx) => {
    const s = deck.slides[idx];
    const snippet = (s.pageNumber ? pageTexts.get(s.pageNumber) : '')?.slice(0, SNIPPET_LEN) ?? '';
    return `${idx}: ${s.title ?? ''} — ${snippet.replace(/\s+/g, ' ')}`;
  });

  const minGap = Math.max(1, Math.floor(pdfSlideIndices.length / (count + 1)));

  const system = '너는 한국 고등학교 수업 자료 설계를 돕는 AI 코스 디자이너야. 반드시 JSON 객체 하나만 출력하고 그 외 텍스트는 쓰지 않는다.';
  const user =
    `아래는 업로드된 PDF 강의자료의 슬라이드 목록(인덱스: 제목 — 내용 요약)이야.\n\n${listLines.join('\n')}\n\n` +
    `요청: 이 자료의 흐름에 맞춰 '${TYPE_LABEL[type]}' 활동을 정확히 ${count}개 추가할 위치를 골라줘.\n` +
    `규칙:\n` +
    `- afterSlideIndex는 위 목록의 인덱스 번호 중 하나여야 해 (그 슬라이드 "뒤"에 삽입됨).\n` +
    `- ${count}개의 위치는 자료 전체에 걸쳐 고르게 분산되어야 하고, 서로 최소 ${minGap} 슬라이드 이상 떨어져야 해.\n` +
    `- topic은 그 위치의 핵심 내용을 8단어 이내 한국어로 요약.\n` +
    `- 반드시 이 형식으로만 답해: {"plan":[{"afterSlideIndex":number,"topic":string}]}`;

  try {
    const { text } = await chatComplete([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.4, maxTokens: 700 });
    const data = extractJson(text);
    const rawPlan: any[] = Array.isArray(data?.plan) ? data.plan : [];

    const used = new Set<number>();
    const valid: PlanItem[] = [];
    for (const item of rawPlan) {
      let idx = Math.round(Number(item?.afterSlideIndex));
      if (!Number.isFinite(idx)) continue;
      idx = Math.max(0, Math.min(deck.slides.length - 1, idx));
      if (used.has(idx)) continue;
      used.add(idx);
      valid.push({ afterSlideIndex: idx, topic: clamp(item?.topic, 80) });
      if (valid.length >= count) break;
    }

    if (valid.length < count) {
      // 1차: 겹치지 않는 자리부터 우선 채운다
      for (const item of fallback()) {
        if (valid.length >= count) break;
        if (used.has(item.afterSlideIndex)) continue;
        used.add(item.afterSlideIndex);
        valid.push(item);
      }
    }
    if (valid.length < count) {
      // 2차: 그래도 부족하면(=슬라이드 수 자체가 count보다 적음) 겹치는 걸 허용해서라도 개수를 채운다
      for (const item of fallback()) {
        if (valid.length >= count) break;
        valid.push(item);
      }
    }
    return valid.slice(0, count);
  } catch {
    return fallback();
  }
}

function schemaFor(type: QuickGenType): { fields: string; example: string } {
  const spec = ACTIVITY_GEN_SPECS[type];
  return { fields: spec.fields, example: spec.example };
}

function normalizeActivity(type: QuickGenType, a: any): any | null {
  if (!a || typeof a !== 'object') return null;
  return ACTIVITY_GEN_SPECS[type].normalize(a);
}

/**
 * 생성 후 검증 훅 — 통과하지 못하면 그 이유(feedback)를 돌려주고, 재생성 프롬프트에 반영된다.
 * 프롬프트 지시만으로 잡히지 않는 실패 모드(예: 지식 문제를 형식만 투표로 바꾸는 회피)를 걸러낸다.
 */
async function verifyActivity(type: QuickGenType, activity: any, contextText: string): Promise<{ ok: boolean; feedback?: string }> {
  // 검증기에는 반드시 원문을 함께 준다 — 질문 단독으로는 의견처럼 보여도,
  // 원문이 이미 결론을 제시한 "확인형 질문"이나 원문과 모순되는 사실 오류는 원문 없이는 판별 불가.
  const srcBlock = contextText ? `[수업 원문]\n${contextText.slice(0, 2000)}\n\n` : '';

  if (type === 'poll') {
    const optionsStr = activity.mode === 'choice' ? `\n보기: ${(activity.options ?? []).join(' / ')}` : '';
    try {
      const { text } = await chatComplete(
        [
          { role: 'system', content: '너는 교육 활동 형식 검사기다. 반드시 JSON 하나만 출력한다.' },
          {
            role: 'user',
            content:
              srcBlock +
              `다음은 위 원문 수업 중 학생들에게 낼 "투표" 질문이다. 투표는 정답이 존재하지 않아야 한다 (의견·선호·경험·예측만 허용).\n` +
              `질문: ${activity.prompt}${optionsStr}\n\n` +
              `판정 기준 (하나라도 해당하면 hasAnswer=true):\n` +
              `1) 지식·계산 확인 문제다\n` +
              `2) 위 원문이 이미 결론/답을 명시해서, 수업을 들은 학생이라면 사실상 답이 정해지는 확인형 질문이다\n` +
              `형식: {"hasAnswer": true|false, "reason": "한 문장"}`,
          },
        ],
        { temperature: 0, maxTokens: 150 },
      );
      const v = extractJson(text);
      if (v?.hasAnswer === true) {
        return { ok: false, feedback: `이전 시도는 정답이 존재하는 문제여서 탈락 (${clamp(v.reason, 100)}). 원문이 답을 제시하지 않는, 학생 각자 다르게 답할 순수 의견/선호/예측 질문으로 완전히 다시 만들 것.` };
      }
    } catch { /* 검증 호출 실패 시 통과 처리 (생성 자체를 막지 않음) */ }
  }

  if (type === 'quiz') {
    // 정답 검증: 정답을 가리고 문제를 "풀게" 한 뒤 correctIndex와 대조.
    // 적용·계산형 문항을 늘리면 모델이 새 계산을 만들다 정답 오류를 내는 트레이드오프가 있어(v1 실험에서 확인) 필수.
    const q = activity.questions?.[0];
    if (q) {
      try {
        const { text } = await chatComplete(
          [
            { role: 'system', content: '너는 문제 풀이 검증기다. 반드시 JSON 하나만 출력한다.' },
            {
              role: 'user',
              content:
                srcBlock +
                `다음 문제를 직접 풀어라.\n문제: ${q.question}\n` +
                q.options.map((o: string, i: number) => `${i}: ${o}`).join('\n') +
                `\n\n계산이 필요하면 단계별로 계산한 뒤, 정답 보기 번호 하나를 골라라.\n` +
                `형식: {"answerIndex": 0|1|2|3, "reason": "한 문장"}`,
            },
          ],
          { temperature: 0, maxTokens: 300 },
        );
        const v = extractJson(text);
        if (Number.isInteger(v?.answerIndex) && v.answerIndex !== q.correctIndex) {
          return {
            ok: false,
            feedback:
              `이전 문항은 검증 풀이 결과(${v.answerIndex}번: ${clamp(v.reason, 80)})와 correctIndex(${q.correctIndex}번)가 달라 탈락. ` +
              `계산·정답·해설이 서로 일치하는 문항으로 다시 만들 것.`,
          };
        }
      } catch { /* 통과 처리 */ }
    }
  }

  if (type === 'roleplay') {
    // 사실 검증: 연도·명칭·인과가 원문과 모순되면 탈락 (예: "1894년 갑신정변", 키워드가 원문과 정반대 방향)
    try {
      const { text } = await chatComplete(
        [
          { role: 'system', content: '너는 교육 콘텐츠 사실 검사기다. 반드시 JSON 하나만 출력한다.' },
          {
            role: 'user',
            content:
              srcBlock +
              `다음은 위 원문 기반 수업용 AI 역할극 설정이다.\n` +
              `systemPrompt: ${clamp(activity.systemPrompt, 600)}\n` +
              `missionKeyword: ${activity.missionKeyword}\n` +
              `missionDescription: ${clamp(activity.missionDescription, 300)}\n\n` +
              `판정 기준 (하나라도 해당하면 hasError=true):\n` +
              `1) 설정의 사실(연도·이름·용어·인과 방향)이 원문 또는 일반 상식과 모순된다\n` +
              `2) 원문에 근거가 없는 "구체적 세부사항"(특정 연도, 기관명, 장소, 수치 등)을 창작해 넣었다 — 원문에 없는 연도를 지어내는 것은 근거가 없으면 오류다\n` +
              `3) missionKeyword가 원문 사실과 어긋나서, 사실에 맞는 AI 답변으로는 등장할 수 없다\n` +
              `형식: {"hasError": true|false, "reason": "한 문장"}`,
          },
        ],
        { temperature: 0, maxTokens: 150 },
      );
      const v = extractJson(text);
      if (v?.hasError === true) {
        return { ok: false, feedback: `이전 시도는 사실 오류로 탈락 (${clamp(v.reason, 120)}). 원문의 연도·명칭·인과를 정확히 따르도록 다시 만들 것.` };
      }
    } catch { /* 통과 처리 */ }
  }

  return { ok: true };
}

/** 2단계: 슬라이드 하나 분량의 컨텍스트만 주고 활동 하나를 생성 (범위가 좁아 품질/신뢰도가 높음) */
async function generateOneActivity(type: QuickGenType, deckTitle: string, topic: string, contextText: string, style?: QuizStyle): Promise<any | null> {
  const { fields, example } = schemaFor(type);
  const system =
    `너는 한국 고등학생 대상 수업 자료를 만드는 교육 콘텐츠 전문가야. 안전하고 교육적인 내용만 작성하며, ` +
    `반드시 JSON 객체 하나만 출력하고 그 외 설명/코드펜스는 쓰지 않는다.`;
  const user =
    `강의 제목: "${deckTitle}"\n` +
    (topic ? `이 위치의 핵심 주제: ${topic}\n` : '') +
    (contextText ? `[참고할 슬라이드 원문]\n${contextText.slice(0, 2500)}\n\n` : '') +
    `위 내용을 바탕으로 '${TYPE_LABEL[type]}' 활동 1개를 만들어줘.\n` +
    (type === 'quiz' && style ? `${QUIZ_STYLE_INSTRUCTION[style]}\n` : '') +
    `필드: ${fields}\n` +
    `예시 형식: ${example}\n` +
    `위 원문 내용을 직접 반영해서 구체적으로 작성해. JSON 외 텍스트 금지.`;

  // 생성 → 정규화 → 검증 루프. 검증 탈락 시 탈락 사유(feedback)를 다음 시도 프롬프트에 붙여 재생성한다.
  let feedback = '';
  let lastValid: any | null = null; // 검증까진 못 갔지만 스키마는 통과한 마지막 결과 (전량 실패 시 폴백)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const userMsg = feedback ? `${user}\n\n[재생성 지시] ${feedback}` : user;
      const { text } = await chatComplete([{ role: 'system', content: system }, { role: 'user', content: userMsg }], { temperature: 0.7, maxTokens: 900 });
      const data = extractJson(text);
      const normalized = normalizeActivity(type, data);
      if (!normalized) {
        console.warn(`[deckAgent] ${type} 활동 생성 응답을 정규화하지 못함 (attempt ${attempt}):`, text.slice(0, 300));
        continue;
      }
      lastValid = normalized;
      const verdict = await verifyActivity(type, normalized, contextText);
      if (verdict.ok) return normalized;
      feedback = verdict.feedback ?? '';
      console.warn(`[deckAgent] ${type} 활동 검증 탈락 (attempt ${attempt}):`, feedback.slice(0, 150));
    } catch (e) {
      console.warn(`[deckAgent] ${type} 활동 생성 호출 실패 (attempt ${attempt}):`, e instanceof Error ? e.message : e);
    }
  }
  // P12: 일반 재시도가 모두 검증에 탈락하면, 마지막으로 "보수 모드" 1회 —
  // 원문에 명시된 사실만 쓰도록 강제해 창작형 오류(임의 연도·장소·인과)를 차단한 안전한 버전을 시도한다.
  // (검증 탈락작(lastValid)을 그대로 내보내던 기존 폴백이 사실 정확성 82%의 주요 원인으로 추정)
  try {
    const safeMsg =
      `${user}\n\n[보수 모드] 이전 시도들이 사실 검증에 탈락했다${feedback ? ` (사유: ${feedback})` : ''}. ` +
      `이번에는 원문에 명시된 사실만 사용하라: 연도·이름·용어·인과는 원문 문구를 그대로 인용하고, ` +
      `원문에 없는 세부사항(연도, 장소, 수치, 배경 설정)은 일절 만들어내지 마라.`;
    const { text } = await chatComplete([{ role: 'system', content: system }, { role: 'user', content: safeMsg }], { temperature: 0.3, maxTokens: 900 });
    const normalized = normalizeActivity(type, extractJson(text));
    if (normalized) {
      const verdict = await verifyActivity(type, normalized, contextText);
      if (verdict.ok) return normalized;
      lastValid = normalized; // 보수 모드 결과가 그나마 안전하므로 폴백도 이것으로 교체
    }
  } catch { /* 보수 모드 실패 시 기존 폴백 유지 */ }

  // 그래도 통과 못 하면: 형식은 유효한 마지막 결과라도 반환 (개수 보장이 품질 검증보다 우선)
  return lastValid;
}

interface ChatPlanItem { type: QuickGenType; afterSlideIndex: number; topic: string }
const CHAT_ACTIVITY_TYPES: QuickGenType[] = GEN_TYPES;

/**
 * 자유 대화형 AI 조교. 예전엔 "답변 + 실제 활동 콘텐츠 전체"를 한 번에 출력시켜서, 강사가 여러 개/여러 종류를
 * 요청해도 토큰 한도에 걸려 실제로는 1개만 만들어지는 문제가 있었다 (채팅 답변만 "여러 개 만들었다"고 거짓말).
 * 이제는 1단계에서 "무엇을 어디에 만들지"만 가벼운 계획(plan)으로 받고, 2단계에서 항목별로 병렬 생성한다.
 */
export async function chatWithAgent(opts: {
  deck: Deck; pdfText: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ text: string; operations: Operation[] }> {
  const deck = opts.deck;
  const pageTexts = splitPdfPages(opts.pdfText || '');
  const slideList = deck.slides
    .map((s, idx) => `${idx}: layout=${s.layout}, title="${s.title ?? ''}"${s.activityId ? ', activityId=' + s.activityId : ''}`)
    .join('\n');

  const system =
    `너는 강사의 강의 자료 제작을 돕는 'AI 교수 조교'야. 강사와 대화하며 슬라이드에 퀴즈/투표/역할극/비유대조/문학창작/AI튜터/AI자유대화/이미지생성/비교실습랩 활동을 추가해줄 수 있어.\n\n` +
    `[현재 강의 자료]\n- 제목: ${deck.title}\n- 슬라이드 목록 (인덱스: 정보):\n${slideList}\n\n` +
    `[중요 규칙]\n` +
    `1. 강사가 활동 추가를 요청하면, 실제 활동 "내용"은 여기서 쓰지 말고 무엇을 어디에 넣을지 "계획"만 세워. 실제 콘텐츠는 각 항목별로 이후 단계에서 따로 생성돼.\n` +
    `2. 강사가 "여러 개", "세트로", "다양하게" 라고 하거나 퀴즈/투표/역할극 등 여러 종류를 한 번에 요청하면, 요청한 개수·종류를 절대 줄이지 말고 plan 배열에 전부 포함시켜. 예: "퀴즈랑 투표랑 역할극 하나씩 추가해줘" → plan에 quiz 1개, poll 1개, roleplay 1개, 총 3개 항목이 있어야 해.\n` +
    `3. 각 plan 항목은 서로 다른 소재/관점을 다뤄야 해 — 같은 내용을 중복해서 여러 개 만들지 마. 강의 자료의 여러 부분(다른 슬라이드/챕터)에 걸쳐 문맥에 맞게 분산시켜.\n` +
    `4. afterSlideIndex는 위 슬라이드 목록의 인덱스 번호 중 하나 (그 슬라이드 "뒤"에 삽입됨).\n` +
    `5. topic 필드에는 그 항목이 다뤄야 할 구체적인 소재/질문 방향을 한국어 1~2문장으로 적어 — 다음 단계에서 이 topic만 보고 콘텐츠를 만들 거라 최대한 구체적으로.\n` +
    `6. 활동 추가 요청이 아니라 일반 질문/편집 상담이면 plan은 빈 배열로 둬.\n` +
    `7. 반드시 이 JSON 형식 하나만 출력해, 그 외 텍스트 금지:\n` +
    `{"reply": "강사에게 보여줄 친근한 답변", "plan": [{"type": "quiz"|"poll"|"roleplay"|"analogy"|"writing"|"tutor"|"chat"|"image"|"lab", "afterSlideIndex": number, "topic": string}]}`;

  const chatMessages = [
    { role: 'system' as const, content: system },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let reply = '슬라이드 변경을 완료했습니다.';
  let plan: ChatPlanItem[] = [];
  try {
    const { text } = await chatComplete(chatMessages, { temperature: 0.6, maxTokens: 900 });
    const data = extractJson(text);
    if (typeof data?.reply === 'string' && data.reply.trim()) reply = data.reply.trim();
    const rawPlan: any[] = Array.isArray(data?.plan) ? data.plan : [];
    plan = rawPlan
      .filter((p) => CHAT_ACTIVITY_TYPES.includes(p?.type))
      .slice(0, 8)
      .map((p) => ({
        type: p.type as QuickGenType,
        afterSlideIndex: Math.max(0, Math.min(deck.slides.length - 1, Math.round(Number(p.afterSlideIndex)) || 0)),
        topic: clamp(p.topic, 200),
      }));
  } catch (e) {
    console.warn('[deckAgent] chat-agent 계획 생성 실패:', e instanceof Error ? e.message : e);
    return { text: '⚠️ 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', operations: [] };
  }

  if (plan.length === 0) return { text: reply, operations: [] };

  // 채팅 경로도 동일하게: 퀴즈 항목들에 유형 쿼터를 순서대로 할당
  let quizSeq = 0;
  const styles = plan.map((p) => (p.type === 'quiz' ? QUIZ_STYLE_CYCLE[quizSeq++ % QUIZ_STYLE_CYCLE.length] : undefined));

  const results = await Promise.all(
    plan.map((item, i) => generateOneActivity(item.type, deck.title, item.topic, contextTextFor(deck.slides, item.afterSlideIndex, pageTexts), styles[i])),
  );

  const operations: Operation[] = [];
  results.forEach((activity, i) => {
    if (!activity) return;
    operations.push({ type: `add_${plan[i].type}`, afterSlideIndex: plan[i].afterSlideIndex, activity });
  });

  const text = operations.length < plan.length
    ? `${reply}\n\n(요청한 ${plan.length}개 중 ${operations.length}개를 반영했어요. 나머지는 생성에 실패해 제외했으니, 필요하면 다시 요청해주세요.)`
    : reply;

  return { text, operations };
}

export async function quickGenerate(opts: { deck: Deck; pdfText: string; type: QuickGenType; count: number }): Promise<{ operations: Operation[]; message: string }> {
  const count = Math.min(5, Math.max(1, opts.count));
  const pageTexts = splitPdfPages(opts.pdfText || '');

  const plan = await planInsertions(opts.type, count, opts.deck, pageTexts);

  // 퀴즈 세트의 문항 유형 비율은 계획 단계에서 결정적으로 할당 (프롬프트 지시만으로는 안 지켜짐)
  // P9 실험: 쿼터 비활성화 — 강제 apply/analyze가 정확도를 87%로 떨어뜨리는 주범인지 분리 검증
  const QUOTA_ENABLED = false;
  if (QUOTA_ENABLED && opts.type === 'quiz') plan.forEach((item, i) => { item.style = QUIZ_STYLE_CYCLE[i % QUIZ_STYLE_CYCLE.length]; });

  const results = await Promise.all(
    plan.map((item) => generateOneActivity(opts.type, opts.deck.title, item.topic, contextTextFor(opts.deck.slides, item.afterSlideIndex, pageTexts), item.style)),
  );

  const operations: Operation[] = [];
  results.forEach((activity, i) => {
    if (!activity) return;
    // P11: 퀴즈 제목은 모델 출력 대신 계획 단계 topic에서 결정적으로 생성 —
    // 모델이 붙이는 제목이 문항 내용과 어긋나는 실패(titleMatch 85%)를 구조적으로 차단
    if (opts.type === 'quiz' && plan[i].topic) {
      activity.title = clamp(plan[i].topic, 40).replace(/[.。]\s*$/, '') + ' 퀴즈';
    }
    operations.push({ type: `add_${opts.type}`, afterSlideIndex: plan[i].afterSlideIndex, activity });
  });

  const label = TYPE_LABEL[opts.type];
  const message = operations.length === count
    ? `PDF 내용을 분석해서 ${label} ${operations.length}개를 적절한 위치에 배치했습니다.`
    : operations.length > 0
      ? `${label} ${operations.length}개를 배치했습니다. (${count - operations.length}개는 생성에 실패해 제외했어요 — 다시 시도해보세요.)`
      : `⚠️ ${label} 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.`;

  return { operations, message };
}
