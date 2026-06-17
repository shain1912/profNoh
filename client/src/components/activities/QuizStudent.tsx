import { useEffect, useState } from 'react';
import type { QuizReveal } from '@shared/types';
import Countdown from '../Countdown';

export interface QuizQuestionPayload {
  questionId: string;
  index: number;
  total: number;
  question: string;
  options: string[];
  endsAt: number;
}

const COLORS = ['bg-red-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-600'];
const SHAPES = ['▲', '◆', '●', '■'];

export default function QuizStudent({
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
    return <div className="grid h-full place-items-center text-white/50">곧 퀴즈가 시작돼요! 🎮</div>;

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
          <h2 className="mt-3 text-2xl font-extrabold">
            {!answered ? '시간 초과!' : correct ? '정답!' : '아쉬워요!'}
          </h2>
          <p className="mt-2 text-white/70">
            정답: <b className="text-emerald-400">{question?.options[reveal.correctIndex] ?? `${reveal.correctIndex + 1}번`}</b>
          </p>
          {reveal.explanation && (
            <p className="mx-auto mt-3 max-w-md rounded-xl bg-white/5 px-4 py-3 text-sm text-white/80">
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
      <div className="mb-2 flex items-center justify-between text-sm text-white/60">
        <span>
          문제 {question.index + 1} / {question.total}
        </span>
      </div>
      <h2 className="text-center text-xl font-bold sm:text-2xl">{question.question}</h2>
      <div className="my-3">
        <Countdown endsAt={question.endsAt} total={Math.max(1, Math.round((question.endsAt - Date.now()) / 1000))} />
      </div>

      {selected !== null ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <div className="text-5xl">✅</div>
            <p className="mt-2 text-lg font-semibold">응답 완료! 결과를 기다려요…</p>
            <p className="text-white/50">고른 답: {question.options[selected]}</p>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                setSelected(i);
                onAnswer(i);
              }}
              className={[
                'flex min-h-[72px] items-center gap-3 rounded-xl px-5 py-4 text-left text-lg font-bold text-white shadow-lg transition active:scale-95',
                COLORS[i % COLORS.length],
              ].join(' ')}
            >
              <span className="text-2xl">{SHAPES[i % SHAPES.length]}</span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
