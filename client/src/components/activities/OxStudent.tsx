import { useEffect, useState } from 'react';
import type { QuizReveal } from '@shared/types';
import Countdown from '../Countdown';
import type { QuizQuestionPayload } from './QuizStudent';

// O/X 퀵 퀴즈 참가자 화면 — 2지선다 대형 버튼. 채점·점수는 quiz 엔진(quiz:question / quiz:reveal) 그대로 재사용
export const OX_LABELS = ['O', 'X'] as const;
export const OX_STYLES = ['bg-blue-600', 'bg-red-600'] as const;

export default function OxStudent({
  question,
  reveal,
  onAnswer,
}: {
  question: QuizQuestionPayload | null;
  reveal: QuizReveal | null;
  onAnswer: (optionIndex: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [question?.questionId]);

  if (!question && !reveal)
    return <div className="grid h-full place-items-center text-center text-muted">곧 OX 퀴즈가 시작돼요!<br /><span className="text-5xl">⭕❌</span></div>;

  const showReveal = reveal && (!question || reveal.questionId === question.questionId);

  if (showReveal && reveal) {
    const correct = selected === reveal.correctIndex;
    const answered = selected !== null;
    return (
      <div className="grid h-full place-items-center p-4 text-center">
        <div>
          <div className={['text-6xl', answered ? '' : 'opacity-50'].join(' ')}>
            {!answered ? '⏳' : correct ? '🎉' : '😅'}
          </div>
          <h2 className="mt-3 text-2xl font-extrabold text-strong">
            {!answered ? '시간 초과!' : correct ? '정답!' : '아쉬워요!'}
          </h2>
          <p className="mt-3 text-body">
            정답은{' '}
            <b className={['text-5xl font-black', reveal.correctIndex === 0 ? 'text-blue-600' : 'text-red-600'].join(' ')}>
              {OX_LABELS[reveal.correctIndex] ?? '?'}
            </b>
          </p>
          {reveal.explanation && (
            <p className="mx-auto mt-3 max-w-md rounded-xl bg-surface-2 px-4 py-3 text-sm text-body ring-1 ring-hairline">
              {reveal.explanation}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-center text-xl font-bold text-strong sm:text-2xl">{question.question}</h2>
      <div className="my-3">
        <Countdown endsAt={question.endsAt} total={Math.max(1, Math.round((question.endsAt - Date.now()) / 1000))} />
      </div>

      {selected !== null ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <div className={['text-8xl font-black', selected === 0 ? 'text-blue-600' : 'text-red-600'].join(' ')}>{OX_LABELS[selected]}</div>
            <p className="mt-2 text-lg font-semibold">응답 완료! 결과를 기다려요…</p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4">
          {OX_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => {
                setSelected(i);
                onAnswer(i);
              }}
              className={[
                'flex min-h-[200px] items-center justify-center rounded-3xl text-8xl font-black text-white shadow-lg transition active:scale-95 sm:text-9xl',
                OX_STYLES[i],
              ].join(' ')}
              aria-label={label === 'O' ? '맞다 (O)' : '틀리다 (X)'}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
