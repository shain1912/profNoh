import { chatComplete, type ChatMessage } from './minimax';

const SYS: ChatMessage = {
  role: 'system',
  content: '너는 한국 고등학생을 위한 친절한 한국어 학습 도우미야. 쉽고 간결하게 답해.',
};

type LabType = 'prompt' | 'context' | 'harness';

function buildPair(labType: LabType, input: string): { a: ChatMessage[]; b: ChatMessage[]; configA: string; configB: string } {
  if (labType === 'prompt') {
    return {
      configA: '정중한 표현',
      configB: '퉁명스러운 표현',
      a: [SYS, { role: 'user', content: `${input}\n\n(아주 정중하고 공손하게 부탁드립니다.)` }],
      b: [SYS, { role: 'user', content: `${input}\n\n(반말로 툭툭 던지듯이.)` }],
    };
  }
  if (labType === 'context') {
    return {
      configA: '맥락 없음',
      configB: '맥락 있음',
      a: [SYS, { role: 'user', content: input }],
      b: [
        SYS,
        {
          role: 'user',
          content:
            `${input}\n\n[추가 맥락] 나는 16세 고등학생. 시간은 2시간 정도, 너무 무섭거나 잔인한 건 싫어. ` +
            `한국에서 쉽게 접할 수 있는 것으로, 각 항목에 이유를 한 줄씩 붙여서 딱 3개만 추천해줘.`,
        },
      ],
    };
  }
  // harness
  return {
    configA: '싱글샷 (한 번에)',
    configB: '다단계 (계획→세부→점검)',
    a: [SYS, { role: 'user', content: `다음 일을 바로 해줘: ${input}` }],
    b: [
      SYS,
      {
        role: 'user',
        content:
          `다음 일을 단계로 나눠서 처리해줘: "${input}"\n` +
          `1) 먼저 전체 계획을 3~5단계로 제시\n` +
          `2) 각 단계를 구체적으로 작성\n` +
          `3) 마지막에 빠진 게 없는지 스스로 점검하고 보완`,
      },
    ],
  };
}

export async function runLab(labType: LabType, input: string) {
  const { a, b, configA, configB } = buildPair(labType, input);
  const [ra, rb] = await Promise.all([chatComplete(a, { maxTokens: 700 }), chatComplete(b, { maxTokens: 900 })]);
  return {
    outputA: ra.text,
    outputB: rb.text,
    configA,
    configB,
    cost: ra.cost + rb.cost,
  };
}
