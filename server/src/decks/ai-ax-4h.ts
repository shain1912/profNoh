import type { Deck } from '../../../shared/types';

// ──────────────────────────────────────────────────────────────
//  AI · AX 4시간 특강 덱 — 일반계 고등학생 대상
//  슬라이드 본문 + 활동 정의(퀴즈 정답 포함; 정답은 서버 전용)
// ──────────────────────────────────────────────────────────────

export const aiAx4h: Deck = {
  id: 'ai-ax-4h',
  title: 'AI와 나의 미래 — 생성형 AI 4시간 특강',
  activities: {
    // 0. 워밍업
    'poll-warmup': {
      type: 'poll',
      id: 'poll-warmup',
      title: '워밍업 투표',
      prompt: 'AI 하면 떠오르는 단어 하나!',
      mode: 'wordcloud',
    },
    'quiz-warmup': {
      type: 'quiz',
      id: 'quiz-warmup',
      title: '워밍업 OX 퀴즈',
      intro: '가볍게 몸풀기! 빠르게 맞혀보자.',
      questions: [
        {
          id: 'w1',
          question: 'ChatGPT 같은 AI는 "정답을 어딘가에서 검색해서" 답한다?',
          options: ['그렇다', '아니다'],
          correctIndex: 1,
          timeLimitSec: 15,
          explanation: '검색이 아니라 "다음에 올 말"을 확률로 예측해서 만들어낸다.',
        },
        {
          id: 'w2',
          question: 'AI는 가끔 그럴듯한 거짓말(환각)을 한다?',
          options: ['그렇다', '아니다'],
          correctIndex: 0,
          timeLimitSec: 15,
          explanation: '사실처럼 보이지만 틀린 답을 자신있게 말하기도 한다. 이걸 환각(hallucination)이라 한다.',
        },
        {
          id: 'w3',
          question: '생성형 AI는 글뿐 아니라 그림·음악·영상도 만들 수 있다?',
          options: ['그렇다', '아니다'],
          correctIndex: 0,
          timeLimitSec: 15,
          explanation: '텍스트, 이미지, 음성, 영상까지 "생성"할 수 있어서 생성형(Generative) AI라 부른다.',
        },
      ],
    },
    // 1. 생성형 AI의 특성
    'chat-first': {
      type: 'chat',
      id: 'chat-first',
      title: 'AI와 첫 대화',
      intro: '아래 미션 중 하나를 골라 AI에게 말을 걸어보자. 답이 마음에 안 들면 다시 물어봐도 좋아.',
      systemPrompt:
        '너는 한국 고등학생을 위한 친절하고 안전한 학습 도우미야. 쉽고 짧게, 예의 바르게 한국어로 답해. 부적절하거나 위험한 요청은 정중히 거절해.',
      missions: [
        '나를 소개하면, 나에게 어울리는 별명을 3개 지어줘.',
        '오늘 기분을 한 줄 시로 만들어줘.',
        '내가 좋아하는 과목으로 할 수 있는 직업 5개 알려줘.',
        '어려운 수학 개념 하나를 중학생도 알게 비유로 설명해줘.',
      ],
    },
    'quiz-part1': {
      type: 'quiz',
      id: 'quiz-part1',
      title: '생성형 AI의 특성 퀴즈',
      questions: [
        {
          id: 'p1a',
          question: '생성형 AI가 글을 만드는 핵심 원리는?',
          options: [
            '인터넷을 실시간 검색한다',
            '다음에 올 단어를 확률로 예측한다',
            '사람이 미리 써둔 답을 고른다',
            '정답표에서 찾아 복사한다',
          ],
          correctIndex: 1,
          timeLimitSec: 20,
          explanation: '엄청난 양의 글을 학습해 "다음 단어"를 예측하는 방식이다.',
        },
        {
          id: 'p1b',
          question: 'AI가 자신있게 틀린 답을 말하는 현상을 뭐라고 할까?',
          options: ['버그', '환각(Hallucination)', '오타', '로딩'],
          correctIndex: 1,
          timeLimitSec: 20,
          explanation: '그럴듯하지만 사실이 아닌 답 = 환각. 그래서 항상 사실 확인이 필요하다.',
        },
        {
          id: 'p1c',
          question: '다음 중 AI가 상대적으로 "잘 못하는" 것은?',
          options: [
            '글의 초안 빠르게 쓰기',
            '아이디어 많이 내기',
            '최신·정확한 사실을 100% 보장하기',
            '문장을 다듬기',
          ],
          correctIndex: 2,
          timeLimitSec: 20,
          explanation: '최신성·정확성은 약점. 사람의 검증이 꼭 필요하다.',
        },
      ],
    },
    // 2. 프롬프트는 이제 덜 중요하다 (반전 실험)
    'lab-prompt': {
      type: 'lab',
      id: 'lab-prompt',
      labType: 'prompt',
      title: '반전 실험 — 표현만 바꿔도 결과가 달라질까?',
      intro: '같은 요청을 "공손하게" vs "퉁명스럽게" 표현만 바꿔서 동시에 보내본다.',
      task: '예: "강아지에 대한 짧은 시를 써줘"처럼 하고 싶은 요청을 한 줄로 적어줘.',
      inputPlaceholder: '예) 우주에 대한 짧은 시를 써줘',
      labelA: '정중한 표현',
      labelB: '퉁명스러운 표현',
    },
    // 3. 컨텍스트 엔지니어링
    'lab-context': {
      type: 'lab',
      id: 'lab-context',
      labType: 'context',
      title: '컨텍스트 비교 랩 — 배경을 주면 달라진다',
      intro: '똑같은 질문을 (1) 그냥 묻기 vs (2) 배경·조건·예시를 함께 주기 로 비교한다.',
      task: '예: "추천 좀 해줘" 같은 요청을 적어줘. 한쪽엔 자동으로 풍부한 맥락이 더해져.',
      inputPlaceholder: '예) 주말에 볼 영화 추천해줘',
      labelA: '맥락 없음',
      labelB: '맥락 있음(취향·조건·예시 추가)',
    },
    'image-gen': {
      type: 'image',
      id: 'image-gen',
      title: '이미지 생성 실습',
      intro: '머릿속 장면을 글로 묘사하면 AI가 그림으로 만들어준다. 키워드와 분위기를 바꿔보자!',
      suggestions: [
        '노을 지는 바닷가에서 연을 날리는 고양이, 수채화 스타일',
        '미래 도시의 학교, 네온 불빛, 디지털 아트',
        '숲속 도서관, 따뜻한 햇살, 지브리풍 일러스트',
        '우주를 여행하는 떡볶이, 귀여운 만화 스타일',
      ],
    },
    'poll-image': {
      type: 'poll',
      id: 'poll-image',
      title: '베스트 작품 투표',
      prompt: '방금 만든 이미지, 어떤 분위기가 제일 마음에 들었어?',
      mode: 'choice',
      options: ['수채화', '디지털 아트', '지브리풍', '만화풍'],
    },
    // 4. 하네스
    'lab-harness': {
      type: 'lab',
      id: 'lab-harness',
      labType: 'harness',
      title: '하네스 비교 랩 — 한 번에 vs 단계로',
      intro: '복잡한 일을 (1) 한 번에 통째로 시키기 vs (2) 단계로 쪼개서 시키기 로 비교한다.',
      task: '예: "수학여행 계획 짜줘"처럼 좀 복잡한 일을 한 줄로 적어줘.',
      inputPlaceholder: '예) 우리 반 체육대회 운영 계획 짜줘',
      labelA: '싱글샷(한 번에)',
      labelB: '다단계(계획→세부→점검)',
    },
    'quiz-harness': {
      type: 'quiz',
      id: 'quiz-harness',
      title: '엔지니어링 정리 퀴즈',
      questions: [
        {
          id: 'h1',
          question: '요즘 결과를 가장 크게 바꾸는 것은?',
          options: [
            '프롬프트의 말투(공손/퉁명)',
            'AI에게 주는 맥락(정보·예시·조건)',
            '글자 수',
            '느낌표 개수',
          ],
          correctIndex: 1,
          timeLimitSec: 20,
          explanation: '모델이 똑똑해지면서 "어떻게 말하나"보다 "무엇을 주나(맥락)"가 핵심이 됐다.',
        },
        {
          id: 'h2',
          question: '"하네스"를 한마디로 하면?',
          options: [
            'AI에게 욕하기',
            '일을 단계로 쪼개고 도구를 붙여 똑똑하게 굴리는 설계',
            '더 비싼 컴퓨터 사기',
            '인터넷 속도 올리기',
          ],
          correctIndex: 1,
          timeLimitSec: 20,
          explanation: '한 번에 다 시키기보다, 단계·도구로 엮으면 더 좋은 결과가 나온다.',
        },
      ],
    },
    // 5. 윤리
    'quiz-ethics': {
      type: 'quiz',
      id: 'quiz-ethics',
      title: 'AI 윤리 — 상황 판단 퀴즈',
      intro: '정답이 애매할 수 있어. 가장 바람직한 행동을 골라보자.',
      questions: [
        {
          id: 'e1',
          question: '수행평가 글을 AI가 통째로 써줬다. 그대로 내 이름으로 제출하면?',
          options: [
            '괜찮다, 편하니까',
            '안 된다 — 표절이고 내 실력도 안 늘어',
            '들키지만 않으면 OK',
          ],
          correctIndex: 1,
          timeLimitSec: 25,
          explanation: 'AI는 "도구". 아이디어·초안 도움은 OK지만 통째 제출은 표절. 출처·도움 사실을 밝히는 게 정직하다.',
        },
        {
          id: 'e2',
          question: '친구 얼굴로 가짜 영상(딥페이크)을 장난으로 만들었다?',
          options: [
            '장난이니 괜찮다',
            '절대 안 된다 — 인격권 침해이자 범죄가 될 수 있다',
            '친구가 모르면 OK',
          ],
          correctIndex: 1,
          timeLimitSec: 25,
          explanation: '타인 동의 없는 딥페이크는 법적 처벌 대상이 될 수 있는 심각한 문제다.',
        },
        {
          id: 'e3',
          question: 'AI에게 내 이름·주소·전화번호를 알려주며 상담했다?',
          options: [
            '편하니 괜찮다',
            '조심해야 한다 — 개인정보는 함부로 입력하지 않기',
            '비밀번호만 빼면 OK',
          ],
          correctIndex: 1,
          timeLimitSec: 25,
          explanation: '입력한 정보가 어디로 갈지 모른다. 민감한 개인정보는 넣지 않는 습관이 중요.',
        },
        {
          id: 'e4',
          question: 'AI가 알려준 역사적 사실을 발표 자료에 넣으려 한다?',
          options: [
            '그대로 믿고 넣는다',
            '신뢰할 수 있는 자료로 한 번 더 확인한다',
            '귀찮으니 생략',
          ],
          correctIndex: 1,
          timeLimitSec: 25,
          explanation: '환각 가능성! 중요한 사실은 반드시 교차 검증.',
        },
      ],
    },
    // 6. 진로
    'poll-career': {
      type: 'poll',
      id: 'poll-career',
      title: '진로 투표',
      prompt: '내 꿈/관심 진로에 AI가 얼마나 들어올까?',
      mode: 'choice',
      options: ['거의 안 쓸 듯', '조금 쓸 듯', '많이 쓸 듯', '핵심 도구가 될 듯'],
    },
    // 7. 마무리
    'quiz-final': {
      type: 'quiz',
      id: 'quiz-final',
      title: '🏆 종합 토너먼트',
      intro: '오늘 배운 걸 총정리! 빠르고 정확하게!',
      questions: [
        {
          id: 'f1',
          question: '생성형 AI의 작동 원리는?',
          options: ['실시간 검색', '다음 단어 예측', '정답 복사', '랜덤 추첨'],
          correctIndex: 1,
          timeLimitSec: 15,
        },
        {
          id: 'f2',
          question: '결과를 가장 크게 바꾸는 것은?',
          options: ['말투', '맥락(정보)', '글자 색', '폰트'],
          correctIndex: 1,
          timeLimitSec: 15,
        },
        {
          id: 'f3',
          question: '환각(hallucination)이란?',
          options: ['화면 깨짐', '그럴듯한 거짓 답', '느린 속도', '광고'],
          correctIndex: 1,
          timeLimitSec: 15,
        },
        {
          id: 'f4',
          question: '비전공자에게 가장 중요한 AI 역량은?',
          options: ['코딩 암기', '맥락을 잘 주는 능력', '타자 속도', '비싼 장비'],
          correctIndex: 1,
          timeLimitSec: 15,
        },
        {
          id: 'f5',
          question: '타인 동의 없는 딥페이크는?',
          options: ['재밌는 장난', '범죄가 될 수 있음', '권장 활동', '필수 숙제'],
          correctIndex: 1,
          timeLimitSec: 15,
        },
      ],
    },
    'poll-feedback': {
      type: 'poll',
      id: 'poll-feedback',
      title: '소감 한마디',
      prompt: '오늘 특강, 한 단어로 남긴다면?',
      mode: 'wordcloud',
    },
  },
  slides: buildSlides(),
};

function buildSlides() {
  const S = (s: import('../../../shared/types').Slide) => s;
  return [
    // ── 파트 0 ──
    S({ id: 's0-1', part: 0, partTitle: '입장 & 워밍업', layout: 'title',
      title: 'AI와 나의 미래', subtitle: '생성형 AI 4시간 특강 — 만지고, 만들고, 생각하기',
      notes: '환영 인사. 토큰으로 입장했는지 확인.' }),
    S({ id: 's0-2', part: 0, partTitle: '입장 & 워밍업', layout: 'content',
      title: '오늘 우리가 할 일', blocks: [
        { kind: 'bullet', text: '직접 AI와 대화하고, 그림도 만들어 본다' },
        { kind: 'bullet', text: '"왜 어떤 사람은 AI를 잘 쓸까?"의 비밀을 실험으로 밝힌다' },
        { kind: 'bullet', text: '게임(퀴즈)으로 복습하고, AI 윤리와 진로까지 본다' },
        { kind: 'callout', text: '오늘의 한 줄: 주문을 외우지 말고, "맥락"을 줘라.' },
      ], notes: '큰 흐름만 짚고 빠르게 워밍업으로.' }),
    S({ id: 's0-3', part: 0, partTitle: '입장 & 워밍업', layout: 'big',
      title: 'AI 하면 떠오르는 단어는?', subtitle: '폰을 들고 한 단어 입력!', activityId: 'poll-warmup',
      notes: '워드클라우드 투표 열기. 나온 단어로 대화 유도.' }),
    S({ id: 's0-4', part: 0, partTitle: '입장 & 워밍업', layout: 'big',
      title: '몸풀기 퀴즈 🎮', subtitle: '빠르고 정확하게! 점수가 쌓인다', activityId: 'quiz-warmup',
      notes: 'Kahoot 워밍업. 점수·리더보드 작동 확인.' }),

    // ── 파트 1 ──
    S({ id: 's1-1', part: 1, partTitle: '생성형 AI의 정체와 특성', layout: 'section',
      title: 'PART 1', subtitle: '생성형 AI는 도대체 뭘까?' }),
    S({ id: 's1-2', part: 1, partTitle: '생성형 AI의 정체와 특성', layout: 'content',
      title: '생성형 AI = "다음에 올 것"을 예측하는 기계', blocks: [
        { kind: 'p', text: '엄청난 양의 글·그림을 학습해서, "그 다음에 가장 그럴듯한 것"을 한 조각씩 만들어낸다.' },
        { kind: 'quote', text: '“오늘 날씨가 ___” → "좋다", "맑다" … 다음 말을 예측하는 거대한 자동완성!' },
        { kind: 'bullet', text: '글(텍스트), 그림(이미지), 음성, 영상까지 생성한다' },
      ] }),
    S({ id: 's1-3', part: 1, partTitle: '생성형 AI의 정체와 특성', layout: 'twocol',
      title: '잘하는 것 vs 못하는 것', blocks: [
        { kind: 'h', text: '✅ 잘하는 것' },
        { kind: 'bullet', text: '초안·아이디어 빠르게 쏟아내기' },
        { kind: 'bullet', text: '요약·번역·다듬기' },
        { kind: 'bullet', text: '지치지 않고 반복' },
        { kind: 'h', text: '⚠️ 못하는 것' },
        { kind: 'bullet', text: '최신·정확한 사실 보장' },
        { kind: 'bullet', text: '진짜 이해/책임' },
        { kind: 'bullet', text: '"환각" — 그럴듯한 거짓말' },
      ] }),
    S({ id: 's1-4', part: 1, partTitle: '생성형 AI의 정체와 특성', layout: 'big',
      title: '직접 말 걸어보자 💬', subtitle: '미션을 골라 AI와 첫 대화', activityId: 'chat-first',
      notes: '채팅 실습 열기. 몇 명 결과를 화면에 공유.' }),
    S({ id: 's1-5', part: 1, partTitle: '생성형 AI의 정체와 특성', layout: 'big',
      title: '특성 퀴즈 🎮', activityId: 'quiz-part1' }),

    // ── 파트 2 ──
    S({ id: 's2-1', part: 2, partTitle: '프롬프트는 이제 덜 중요하다', layout: 'section',
      title: 'PART 2', subtitle: '"마법 주문"은 정말 중요할까?' }),
    S({ id: 's2-2', part: 2, partTitle: '프롬프트는 이제 덜 중요하다', layout: 'content',
      title: '예전엔 "프롬프트 비법"이 유행했다', blocks: [
        { kind: 'p', text: '"전문가인 척 해줘", "단계별로 생각해" 같은 주문을 외우는 게 비결처럼 여겨졌다.' },
        { kind: 'p', text: '그런데 모델이 똑똑해지면서… 표현을 조금 바꾸는 것만으로는 결과가 크게 안 변한다.' },
        { kind: 'callout', text: '진짜로 그런지, 우리가 직접 실험해보자!' },
      ] }),
    S({ id: 's2-3', part: 2, partTitle: '프롬프트는 이제 덜 중요하다', layout: 'big',
      title: '반전 실험 🔄', subtitle: '말투만 바꿔서 같은 요청 보내기', activityId: 'lab-prompt',
      notes: '정중 vs 퉁명 — 결과가 비슷함을 학생들이 직접 확인.' }),
    S({ id: 's2-4', part: 2, partTitle: '프롬프트는 이제 덜 중요하다', layout: 'content',
      title: '그래서 결론은?', blocks: [
        { kind: 'p', text: '표현(어떻게 말하나)보다, 정보(무엇을 주나)가 결과를 가른다.' },
        { kind: 'callout', text: '다음 무기 → "컨텍스트(맥락)"' },
      ] }),

    // ── 파트 3 ──
    S({ id: 's3-1', part: 3, partTitle: '컨텍스트 엔지니어링', layout: 'section',
      title: 'PART 3', subtitle: '진짜 지렛대 — 맥락을 줘라' }),
    S({ id: 's3-2', part: 3, partTitle: '컨텍스트 엔지니어링', layout: 'content',
      title: '컨텍스트 = 심부름 전에 쥐여주는 정보', blocks: [
        { kind: 'p', text: '"추천 좀" 보다 "나는 OO를 좋아하고, 시간은 2시간, 무서운 건 싫어 → 추천"이 훨씬 낫다.' },
        { kind: 'bullet', text: '배경 / 조건 / 예시 / 역할 / 원하는 형식' },
      ] }),
    S({ id: 's3-3', part: 3, partTitle: '컨텍스트 엔지니어링', layout: 'big',
      title: '컨텍스트 비교 랩 🆚', subtitle: '맥락 없음 vs 맥락 있음', activityId: 'lab-context',
      notes: '두 결과 차이가 확연함을 강조.' }),
    S({ id: 's3-4', part: 3, partTitle: '컨텍스트 엔지니어링', layout: 'big',
      title: '이번엔 그림이다 🎨', subtitle: '머릿속 장면을 글로 묘사 → 이미지', activityId: 'image-gen',
      notes: '키워드/분위기를 바꾸며 맥락의 힘을 그림으로 체감.' }),
    S({ id: 's3-5', part: 3, partTitle: '컨텍스트 엔지니어링', layout: 'big',
      title: '베스트 작품 투표 🗳️', activityId: 'poll-image' }),
    S({ id: 's3-6', part: 3, partTitle: '컨텍스트 엔지니어링', layout: 'content',
      title: '☕ 잠깐 쉬어가기 (10분)', blocks: [
        { kind: 'callout', text: '물 마시고 스트레칭! 곧 더 재밌는 게 온다.' },
      ] }),

    // ── 파트 4 ──
    S({ id: 's4-1', part: 4, partTitle: '하네스 — AI를 엮어 쓰기', layout: 'section',
      title: 'PART 4', subtitle: '한 번에 vs 단계로 — 똑똑하게 부려먹기' }),
    S({ id: 's4-2', part: 4, partTitle: '하네스 — AI를 엮어 쓰기', layout: 'content',
      title: '하네스(harness) = 일 시키는 "방식" 설계', blocks: [
        { kind: 'p', text: '복잡한 일을 한 번에 통째로 시키면 엉성하다. 단계로 쪼개 시키면 훨씬 좋아진다.' },
        { kind: 'bullet', text: '계획 세우기 → 세부 작성 → 스스로 점검' },
        { kind: 'bullet', text: '필요하면 계산기·검색 같은 "도구"도 붙인다' },
      ] }),
    S({ id: 's4-3', part: 4, partTitle: '하네스 — AI를 엮어 쓰기', layout: 'big',
      title: '하네스 비교 랩 🆚', subtitle: '싱글샷 vs 다단계', activityId: 'lab-harness' }),
    S({ id: 's4-4', part: 4, partTitle: '하네스 — AI를 엮어 쓰기', layout: 'big',
      title: '정리 퀴즈 🎮', activityId: 'quiz-harness' }),

    // ── 파트 5 ──
    S({ id: 's5-1', part: 5, partTitle: 'AI 윤리', layout: 'section',
      title: 'PART 5', subtitle: '똑똑하게, 그리고 책임감 있게' }),
    S({ id: 's5-2', part: 5, partTitle: 'AI 윤리', layout: 'content',
      title: '강력한 도구엔 책임이 따른다', blocks: [
        { kind: 'bullet', text: '환각 — 사실은 꼭 확인' },
        { kind: 'bullet', text: '저작권 — 통째 베끼기/제출은 표절' },
        { kind: 'bullet', text: '개인정보 — 민감 정보 입력 금지' },
        { kind: 'bullet', text: '편향 — AI도 치우칠 수 있다' },
        { kind: 'bullet', text: '딥페이크 — 타인 동의 없는 합성은 범죄가 될 수 있다' },
      ] }),
    S({ id: 's5-3', part: 5, partTitle: 'AI 윤리', layout: 'big',
      title: '상황 판단 퀴즈 🎮', subtitle: '가장 바람직한 행동은?', activityId: 'quiz-ethics',
      notes: '각 문항 공개 후 30초 토론 유도.' }),

    // ── 파트 6 ──
    S({ id: 's6-1', part: 6, partTitle: 'AI와 너의 진로', layout: 'section',
      title: 'PART 6', subtitle: 'AI는 너의 미래에 뼛속까지 들어온다' }),
    S({ id: 's6-2', part: 6, partTitle: 'AI와 너의 진로', layout: 'content',
      title: 'AI학과는 뭘 배우고, 뭘 할까?', blocks: [
        { kind: 'p', text: '"모델 만드는 사람"만 있는 게 아니다. 스펙트럼이 아주 넓다.' },
        { kind: 'bullet', text: '데이터·서비스 기획, AI 윤리/정책' },
        { kind: 'bullet', text: '의료·법률·예술·교육과의 융합' },
        { kind: 'bullet', text: '수학/코딩 + 호기심 + 글쓰기(맥락 설계!) 모두 무기' },
      ] }),
    S({ id: 's6-3', part: 6, partTitle: 'AI와 너의 진로', layout: 'content',
      title: '직업은 사라지는 게 아니라 재편된다', blocks: [
        { kind: 'p', text: '의사·변호사·디자이너·마케터·기자… "AI를 쓰는 사람"으로 바뀐다.' },
        { kind: 'quote', text: '“AI가 당신을 대체하는 게 아니라, AI를 잘 쓰는 사람이 대체한다.”' },
      ] }),
    S({ id: 's6-4', part: 6, partTitle: 'AI와 너의 진로', layout: 'content',
      title: '비전공자도 AI를 잘해야 하는 이유', blocks: [
        { kind: 'p', text: '오늘 배운 "맥락을 잘 주는 능력"이 곧 경쟁력이다. 전공 무관!' },
        { kind: 'bullet', text: '코딩을 몰라도, 좋은 질문·좋은 맥락을 주면 결과가 다르다' },
        { kind: 'bullet', text: '어떤 진로든 "AI 활용 + 사람만의 판단/책임"이 핵심' },
      ] }),
    S({ id: 's6-5', part: 6, partTitle: 'AI와 너의 진로', layout: 'big',
      title: '진로 투표 🗳️', activityId: 'poll-career' }),

    // ── 파트 7 ──
    S({ id: 's7-1', part: 7, partTitle: '마무리 & 종합 대회', layout: 'section',
      title: 'PART 7', subtitle: '오늘의 챔피언은?' }),
    S({ id: 's7-2', part: 7, partTitle: '마무리 & 종합 대회', layout: 'big',
      title: '🏆 종합 토너먼트', subtitle: '총정리 퀴즈! 누가 1등?', activityId: 'quiz-final' }),
    S({ id: 's7-3', part: 7, partTitle: '마무리 & 종합 대회', layout: 'big',
      title: '소감 한마디 💬', activityId: 'poll-feedback' }),
    S({ id: 's7-4', part: 7, partTitle: '마무리 & 종합 대회', layout: 'title',
      title: '수고했어요! 🎉', subtitle: '주문을 외우지 말고, 맥락을 줘라. 그리고 AI를 너의 무기로.' }),
  ];
}
