import type { ActivityType } from '../../../shared/types';
import { SURVEY_PRESET } from '../../../shared/surveyPreset';

// ──────────────────────────────────────────────────────────────
//  활동별 AI 생성 스펙 레지스트리 (서버 단일 정의처)
//  새 활동을 추가할 때 이 파일에 스펙 1개를 등록하면
//  - AI 조교 단건 생성(deckAgent quickGenerate/chatWithAgent)
//  - 원버튼 덱 생성(generateDeck)
//  두 파이프라인에서 모두 생성 가능해진다. (docs/adding-activities.md 참고)
// ──────────────────────────────────────────────────────────────

export type GenType = ActivityType;

const clamp = (s: unknown, max: number): string => (typeof s === 'string' ? s : '').slice(0, max);
const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : []).slice(0, maxItems).map((x) => clamp(x, maxLen)).filter(Boolean);

export interface ActivityGenSpec {
  /** 한국어 표시 이름 (프롬프트/메시지용) */
  label: string;
  /** deckAgent 단건 생성 프롬프트에 넣는 필드 상세 지시 */
  fields: string;
  /** deckAgent 단건 생성 프롬프트에 넣는 JSON 예시 */
  example: string;
  /** 원버튼(generateDeck) 프롬프트에 넣는 타입별 추가 필드 요약 한 줄 */
  oneShot: string;
  /**
   * AI 원시 출력 → 안전한 활동 필드 객체 (type/id 는 호출자가 붙임).
   * 필수 필드가 비어 재생성이 필요하면 null 반환.
   */
  normalize: (a: any) => Record<string, any> | null;
}

export const ACTIVITY_GEN_SPECS: Record<GenType, ActivityGenSpec> = {
  quiz: {
    label: '퀴즈',
    fields:
      'title(string — 문항이 실제로 묻는 내용과 일치할 것), questions(길이 1인 배열: [{question, options(정확히 4개), correctIndex(0~3), timeLimitSec(5~60), explanation}]). ' +
      '출제 규칙: 1) 원문 문장을 그대로 되묻는 암기 확인 대신, 개념을 "새로운 상황·예시"에 적용하거나 계산하는 문항을 우선하라. 원문에 있는 예시 수치·사례는 그대로 쓰지 말고 바꿔라. ' +
      '2) 정답은 하나뿐이어야 한다: 다른 보기가 특정 조건(예: 열등재, 예외 상황)에서 옳을 수 있다면 문두에서 조건을 한정하라. ' +
      '3) 정답 보기에만 문제 속 핵심 단어가 들어가서 안 읽고도 풀리는 문항 금지. ' +
      '오답(3개) 생성 규칙 — 각 오답은 반드시 다음 중 한 유형에서 만들어라: ' +
      '(a) 헷갈리는 인접 개념 (b) 조건 하나를 빠뜨렸을 때 나올 법한 결론. ' +
      '오답 금지 목록: "모든/항상/절대" 같은 절대 표현, 원문 문장의 단순 부정, 서로 사실상 같은 말인 보기, 명백히 터무니없는 보기("무작위로 변한다" 등). ' +
      '보기 4개의 길이와 문체를 비슷하게 맞춰서 길이만으로 정답이 드러나지 않게 하라.',
    example: '{"title":"...","questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":2,"timeLimitSec":20,"explanation":"..."}]}',
    oneShot: '"questions": [{"question": string, "options": [string×4], "correctIndex": 0~3, "timeLimitSec": number, "explanation": string}]',
    normalize: (a) => {
      const rawQs = Array.isArray(a?.questions) ? a.questions : [];
      const questions = rawQs.slice(0, 30).map((q: any) => {
        if (!q || !clamp(q.question, 200)) return null;
        let options = (Array.isArray(q.options) ? q.options : []).map((o: unknown) => clamp(o, 120)).slice(0, 4);
        while (options.length < 2) options.push('');
        let ci = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
        if (ci < 0 || ci >= options.length) ci = 0;
        let t = typeof q.timeLimitSec === 'number' ? q.timeLimitSec : 20;
        t = Math.min(120, Math.max(5, t));
        return { question: clamp(q.question, 200), options, correctIndex: ci, timeLimitSec: t, explanation: clamp(q.explanation, 300) };
      }).filter(Boolean);
      if (questions.length === 0) return null;
      return { title: clamp(a.title, 80) || '퀴즈', questions };
    },
  },

  poll: {
    label: '투표',
    fields:
      'title(string), prompt(string), mode("wordcloud"|"choice"), options(mode가 choice일 때만 2~6개 배열). ' +
      '투표는 퀴즈가 아니다 — 반드시 정답이 존재하지 않는 질문이어야 한다: 학생 개인의 의견·선호·경험·예측·가치판단을 묻는 것만 허용. ' +
      '지식 확인 문제(옳은 것 고르기, 계산, 사실 확인)는 절대 금지. 원문 내용이 이미 답을 제시한 확인형 질문도 금지. ' +
      '한 단어로 자유롭게 답하게 하려면 mode를 "wordcloud"로 (options는 빈 배열 — 결과는 워드클라우드/롤링페이퍼 대시보드로 표시됨), 입장을 고르게 하려면 "choice"로 (결과는 막대 그래프로 표시됨). ' +
      '좋은 예: "이 기술이 10년 뒤 여러분 직업에 어떤 영향을 줄까요?", "가장 흥미로웠던 개념을 한 단어로!" / ' +
      '나쁜 예: "다음 중 옳은 설명을 고르세요"',
    example: '{"title":"...","prompt":"이 내용 중 내 생활과 가장 관련 깊다고 느낀 것은?","mode":"choice","options":["...","...","..."]}',
    oneShot: '"prompt": string(정답 없는 의견·선호 질문), "mode": "wordcloud"|"choice", "options": [string] (choice일 때만 2~6개)',
    normalize: (a) => {
      const prompt = clamp(a?.prompt, 200);
      if (!prompt) return null;
      const mode = a.mode === 'choice' ? 'choice' : 'wordcloud';
      const options = mode === 'choice' ? strArr(a.options, 8, 60) : [];
      return { title: clamp(a.title, 80) || '투표', prompt, mode, options };
    },
  },

  roleplay: {
    label: 'AI 역할극',
    fields:
      'title, intro, systemPrompt(AI가 연기할 캐릭터/상황 지시문 — 원문의 연도·명칭·인과를 정확히 따를 것), ' +
      'missionKeyword(대화 중 AI가 말하도록 유도할 핵심어 — 반드시 10자 이내의 짧은 명사(구) "하나". 문장·서술형 금지, 쉼표 나열 금지. ' +
      '어미가 변해도 그대로 포함될 단어여야 함. 좋은 예: "애민정신", "문화통치", "옴의 법칙" / 나쁜 예: "전압은 어디서나 같다", "청의 영향력 감소". ' +
      '학생이 AI 답변에서 정확히 그 문자열을 이끌어내야 미션 완료 처리되며, missionDescription의 완료 조건도 이 키워드 하나와 일치해야 함), ' +
      'missionDescription(학생에게 보여줄 미션 설명 — 어떤 주제로 질문해야 키워드가 자연스럽게 나오는지 힌트 포함)',
    example: '{"title":"...","intro":"...","systemPrompt":"...","missionKeyword":"...","missionDescription":"..."}',
    oneShot: '"systemPrompt": string(AI가 연기할 캐릭터 지시문), "missionKeyword": string(10자 이내 명사 하나), "missionDescription": string',
    normalize: (a) => {
      const systemPrompt = clamp(a?.systemPrompt, 1000);
      // 모델이 쉼표로 여러 단어를 나열하면 정확 문자열 매칭(routes.ts)이 사실상 성립 불가능해지므로 첫 항목만 취한다
      const missionKeyword = clamp(a?.missionKeyword, 100).split(/[,、]/)[0]?.trim() ?? '';
      // missionKeyword가 비면 학생 대화에서 미션이 영원히 "완료" 처리되지 않는다 → 재시도/드롭 대상
      if (!systemPrompt || !missionKeyword) return null;
      // 문장형 키워드("전압은 어디서나 같다")는 AI가 어미만 바꿔도 매칭이 깨진다 → 탈락시켜 재생성 유도
      if (missionKeyword.length > 15 || /[다요임함]\s*$/.test(missionKeyword)) return null;
      return {
        title: clamp(a.title, 80) || 'AI 역할극', intro: clamp(a.intro, 200) || undefined,
        systemPrompt, missionKeyword, missionDescription: clamp(a.missionDescription, 300),
      };
    },
  },

  analogy: {
    label: '눈높이 비유 대조',
    fields: 'title, intro, topicPlaceholder, personaA(예: 7세 아동 눈높이 비유), personaB(예: 고등학생 맞춤 비유)',
    example: '{"title":"...","intro":"...","topicPlaceholder":"...","personaA":"...","personaB":"..."}',
    oneShot: '"topicPlaceholder": string, "personaA": string(예: 7세 아동 눈높이 비유), "personaB": string(예: 고등학생 맞춤 비유)',
    normalize: (a) => ({
      title: clamp(a?.title, 80) || '눈높이 비유', intro: clamp(a?.intro, 200) || undefined,
      topicPlaceholder: clamp(a?.topicPlaceholder, 100) || undefined,
      personaA: clamp(a?.personaA, 300) || '7세 아동 눈높이 비유',
      personaB: clamp(a?.personaB, 300) || '고등학생 맞춤 일상 비유',
    }),
  },

  writing: {
    label: '문학 창작',
    fields: 'title, intro, genre("poem"|"story"|"essay"), promptPlaceholder',
    example: '{"title":"...","intro":"...","genre":"poem","promptPlaceholder":"..."}',
    oneShot: '"genre": "poem"|"story"|"essay", "promptPlaceholder": string',
    normalize: (a) => ({
      title: clamp(a?.title, 80) || '문학 창작', intro: clamp(a?.intro, 200) || undefined,
      genre: ['poem', 'story', 'essay'].includes(a?.genre) ? a.genre : 'poem',
      promptPlaceholder: clamp(a?.promptPlaceholder, 100) || undefined,
    }),
  },

  tutor: {
    label: 'AI 튜터',
    fields: 'title, intro, subject("math"|"coding"|"general"), taskDescription',
    example: '{"title":"...","intro":"...","subject":"general","taskDescription":"..."}',
    oneShot: '"subject": "math"|"coding"|"general", "taskDescription": string(학생 과제 설명)',
    normalize: (a) => {
      const taskDescription = clamp(a?.taskDescription, 500);
      if (!taskDescription) return null;
      return {
        title: clamp(a.title, 80) || 'AI 튜터', intro: clamp(a.intro, 200) || undefined,
        subject: ['math', 'coding', 'general'].includes(a.subject) ? a.subject : 'general',
        taskDescription,
      };
    },
  },

  chat: {
    label: 'AI 자유 대화',
    fields:
      'title, intro(학생에게 보여줄 안내 문구), ' +
      'systemPrompt(AI 학습 도우미가 따라야 할 지시문 — 원문 주제에 맞는 역할·말투·답변 범위를 지정하고, 미성년자에게 안전하도록 정중한 거절 규칙 포함), ' +
      'missions(학생에게 제시할 가이드 미션 3~4개 배열 — 원문 내용을 활용해 AI에게 물어보게 하는 구체적 대화 과제. 예: "오늘 배운 개념 하나를 초등학생 눈높이로 설명해달라고 해보자")',
    example: '{"title":"...","intro":"...","systemPrompt":"...","missions":["...","...","..."]}',
    oneShot: '"systemPrompt": string(AI 도우미 지시문), "missions": [string×3~4](가이드 미션)',
    normalize: (a) => {
      if (!a || typeof a !== 'object') return null;
      return {
        title: clamp(a.title, 80) || 'AI와 대화하기', intro: clamp(a.intro, 200) || undefined,
        systemPrompt:
          clamp(a.systemPrompt, 1000) ||
          '너는 한국 학생을 위한 친절하고 안전한 학습 도우미야. 쉽고 짧게, 예의 바르게 한국어로 답해. 부적절하거나 위험한 요청은 정중히 거절해.',
        missions: strArr(a.missions, 6, 120),
      };
    },
  },

  image: {
    label: '이미지 생성 실습',
    fields:
      'title, intro(학생에게 보여줄 안내 문구), ' +
      'suggestions(원클릭 예시 프롬프트 3~4개 배열 — 원문 내용과 연결된 장면 묘사 + 그림 스타일을 함께 적을 것. 예: "조선 시대 저잣거리 풍경, 수채화 스타일")',
    example: '{"title":"...","intro":"...","suggestions":["...","...","..."]}',
    oneShot: '"suggestions": [string×3~4](장면 묘사+스타일 예시 프롬프트)',
    normalize: (a) => {
      if (!a || typeof a !== 'object') return null;
      return {
        title: clamp(a.title, 80) || '이미지 생성 실습', intro: clamp(a.intro, 200) || undefined,
        suggestions: strArr(a.suggestions, 8, 100),
      };
    },
  },

  lab: {
    label: '비교 실습 랩',
    fields:
      'title, intro, ' +
      'labType(원문 주제에 맞는 것 하나 — "prompt": 같은 요청을 표현/말투만 바꿔 비교, "context": 맥락 없이 vs 배경·조건·예시를 함께 주고 비교, "harness": 한 번에 통째로 vs 단계로 쪼개서 비교), ' +
      'task(학생에게 주어지는 과제 설명 — 어떤 요청을 입력해볼지 안내), inputPlaceholder(입력 예시 한 줄), ' +
      'examplePrompts(원클릭 예시 요청 3~5개 배열 — 원문 주제와 연결될 것), ' +
      'labelA(비교 A쪽 라벨, 예: "맥락 없음"), labelB(비교 B쪽 라벨, 예: "맥락 있음")',
    example: '{"title":"...","intro":"...","labType":"context","task":"...","inputPlaceholder":"...","examplePrompts":["...","..."],"labelA":"맥락 없음","labelB":"맥락 있음"}',
    oneShot: '"labType": "prompt"|"context"|"harness", "task": string, "inputPlaceholder": string, "examplePrompts": [string×3~5], "labelA": string, "labelB": string',
    normalize: (a) => {
      const task = clamp(a?.task, 500);
      if (!task) return null;
      const labType = ['prompt', 'context', 'harness'].includes(a.labType) ? a.labType : 'context';
      const labelDefaults: Record<string, [string, string]> = {
        prompt: ['정중한 표현', '퉁명스러운 표현'],
        context: ['맥락 없음', '맥락 있음'],
        harness: ['싱글샷(한 번에)', '다단계(계획→세부→점검)'],
      };
      return {
        title: clamp(a.title, 80) || '비교 실습', intro: clamp(a.intro, 200) || undefined,
        labType, task,
        inputPlaceholder: clamp(a.inputPlaceholder, 100) || undefined,
        examplePrompts: strArr(a.examplePrompts, 8, 100),
        labelA: clamp(a.labelA, 60) || labelDefaults[labType][0],
        labelB: clamp(a.labelB, 60) || labelDefaults[labType][1],
      };
    },
  },

  // ── 강당용 활동 3종 (survey · scale · ox) ──
  survey: {
    label: '만족도 설문',
    fields:
      'title, intro(안내 문구), questions(3~8개 배열: [{kind("likert"|"nps"|"text"), text, lowLabel, highLabel}]). ' +
      'likert 는 1~5점 동의 척도(문장형 진술: "…했다/…이다"), nps 는 0~10 추천 의향 1문항만, text 는 주관식(마지막에 1개). ' +
      '정답이 있는 문항 금지 — 만족·관련성·이해도·몰입·추천·개선점처럼 강연/수업에 대한 반응(Kirkpatrick L1)을 묻는다. ' +
      '기본 세트 예: 전반 만족 / 업무·일상 관련성 / 설명 이해 용이 / 집중 참여 / 추천(NPS) / 자유 의견',
    example: '{"title":"강연 만족도","intro":"1분이면 끝나요","questions":[{"kind":"likert","text":"오늘 강연에 전반적으로 만족한다","lowLabel":"전혀 아니다","highLabel":"매우 그렇다"},{"kind":"nps","text":"이 강연을 동료에게 추천하시겠습니까?"},{"kind":"text","text":"개선할 점을 자유롭게 적어주세요"}]}',
    oneShot: '"questions": [{"kind": "likert"|"nps"|"text", "text": string, "lowLabel"?: string, "highLabel"?: string}] (3~8개, nps 최대 1개, text 는 마지막)',
    normalize: (a) => {
      const rawQs = Array.isArray(a?.questions) ? a.questions : [];
      const questions = rawQs.slice(0, 12).map((q: any) => {
        const text = clamp(q?.text, 200);
        if (!text) return null;
        const kind = q?.kind === 'nps' ? 'nps' : q?.kind === 'text' ? 'text' : 'likert';
        return { kind, text, lowLabel: clamp(q?.lowLabel, 30) || undefined, highLabel: clamp(q?.highLabel, 30) || undefined };
      }).filter(Boolean);
      return {
        title: clamp(a?.title, 80) || '만족도 설문', intro: clamp(a?.intro, 200) || undefined,
        questions: questions.length ? questions : SURVEY_PRESET.map((q) => ({ ...q })),
      };
    },
  },

  scale: {
    label: '척도 투표(1~5)',
    fields:
      'title, prompt(1~5로 답하는 자기평가 질문 — 정답 없음. 예: "지금 이 방법을 내 업무에 적용할 수 있다고 느끼는 정도는?"), ' +
      'lowLabel(1점 뜻, 예: "전혀 아니다"), highLabel(5점 뜻, 예: "매우 그렇다")',
    example: '{"title":"적용 가능성","prompt":"오늘 배운 내용을 바로 적용할 수 있다고 느끼는 정도는?","lowLabel":"전혀 아니다","highLabel":"매우 그렇다"}',
    oneShot: '"prompt": string(1~5 자기평가 질문, 정답 없음), "lowLabel": string, "highLabel": string',
    normalize: (a) => {
      const prompt = clamp(a?.prompt, 200);
      if (!prompt) return null;
      return { title: clamp(a?.title, 80) || '척도 투표', prompt, lowLabel: clamp(a?.lowLabel, 30) || undefined, highLabel: clamp(a?.highLabel, 30) || undefined };
    },
  },

  ox: {
    label: 'OX 퀴즈',
    fields:
      'title, question(참/거짓으로 판별되는 진술문 1개 — 원문 개념을 새 상황에 적용한 문장이 좋음. "모든/항상/절대" 같은 절대 표현으로 답이 뻔해지는 문장 금지), ' +
      'answer("O"=참 | "X"=거짓), timeLimitSec(10~30), explanation(왜 O/X 인지 한두 문장)',
    example: '{"title":"OX 퀴즈","question":"생성형 AI는 다음 단어를 확률로 예측해 문장을 만든다.","answer":"O","timeLimitSec":15,"explanation":"..."}',
    oneShot: '"question": string(참/거짓 진술문), "answer": "O"|"X", "timeLimitSec": number, "explanation": string',
    normalize: (a) => {
      const question = clamp(a?.question, 200);
      if (!question) return null;
      let t = typeof a?.timeLimitSec === 'number' ? a.timeLimitSec : 20;
      t = Math.min(120, Math.max(5, t));
      return { title: clamp(a?.title, 80) || 'OX 퀴즈', question, answer: a?.answer === 'X' ? 'X' : 'O', timeLimitSec: t, explanation: clamp(a?.explanation, 300) || undefined };
    },
  },
};

export const GEN_TYPES = Object.keys(ACTIVITY_GEN_SPECS) as GenType[];
