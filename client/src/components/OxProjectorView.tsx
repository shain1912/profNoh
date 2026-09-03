import type { LeaderboardEntry, QuizReveal } from '@shared/types';
import type { QuizQuestionPayload } from './activities/QuizStudent';
import Countdown from './Countdown';
import Leaderboard from './Leaderboard';
import { OX_LABELS, OX_STYLES } from './activities/OxStudent';

// 프로젝터 OX 퀴즈 뷰 — 문항+카운트다운+응답 수 / 정답 공개(정답 강조 + 보기별 인원 + 리더보드)
export default function OxProjectorView({
  question,
  reveal,
  answeredCount,
  leaderboard,
}: {
  question: QuizQuestionPayload | null;
  reveal: QuizReveal | null;
  answeredCount: number;
  leaderboard: LeaderboardEntry[];
}) {
  const showReveal = reveal && (!question || reveal.questionId === question.questionId);

  if (showReveal && reveal) {
    return (
      <div className="grid h-full grid-cols-3 gap-6 p-8">
        <div className="col-span-2 flex flex-col justify-center">
          <h1 className="text-4xl font-extrabold text-strong">{question?.question ?? '정답 공개'}</h1>
          <div className="mt-8 grid grid-cols-2 gap-6">
            {OX_LABELS.map((label, i) => {
              const count = reveal.distribution[String(i)] ?? 0;
              const correct = i === reveal.correctIndex;
              return (
                <div
                  key={label}
                  className={[
                    'flex flex-col items-center justify-center rounded-3xl py-10 ring-4',
                    correct ? `${OX_STYLES[i]} text-white ring-white` : 'bg-surface-2 text-muted ring-transparent opacity-50',
                  ].join(' ')}
                >
                  <span className="text-8xl font-black">{label}</span>
                  <span className="mt-2 text-3xl font-bold">{count}명 {correct && '✓'}</span>
                </div>
              );
            })}
          </div>
          {reveal.explanation && <p className="mt-6 text-2xl text-body">💡 {reveal.explanation}</p>}
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="mb-4 text-3xl font-extrabold text-strong">🏆 순위</h2>
          <Leaderboard entries={leaderboard} />
        </div>
      </div>
    );
  }

  if (question) {
    return (
      <div className="flex h-full flex-col justify-center p-10 text-center">
        <h1 className="text-5xl font-extrabold leading-tight text-strong">{question.question}</h1>
        <div className="mx-auto my-8 w-1/2">
          <Countdown endsAt={question.endsAt} total={Math.max(1, Math.round((question.endsAt - Date.now()) / 1000))} />
          <p className="mt-2 text-xl text-muted">응답 {answeredCount}명</p>
        </div>
        <div className="grid grid-cols-2 gap-8">
          {OX_LABELS.map((label, i) => (
            <div key={label} className={['flex items-center justify-center rounded-3xl py-12 text-9xl font-black text-white', OX_STYLES[i]].join(' ')}>
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div className="grid h-full place-items-center text-3xl text-muted">OX 퀴즈 준비 중… ⭕❌</div>;
}
