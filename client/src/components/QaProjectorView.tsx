import type { QuestionItem } from '@shared/types';
import { sortQuestions } from './QaPanel';

// 프로젝터 Q&A 카드 뷰 — 승인된 질문을 업보트순 큰 카드로. 1위는 특대, 답변된 질문은 체크 표시로 뒤에
export default function QaProjectorView({ questions, max = 6 }: { questions: QuestionItem[]; max?: number }) {
  const visible = sortQuestions(questions.filter((q) => q.approved));
  const top = visible.slice(0, max);
  const rest = visible.length - top.length;

  return (
    <div className="flex h-full flex-col p-10">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-4xl font-extrabold text-strong">❓ 질문 <span className="text-muted">{visible.length}</span></h1>
        <p className="text-2xl text-muted">폰의 ❓ 버튼으로 질문하고, 궁금한 질문에 👍를 눌러주세요</p>
      </div>
      {top.length === 0 ? (
        <div className="grid flex-1 place-items-center text-3xl text-muted">아직 질문이 없어요 — 첫 질문을 기다리고 있어요 🙋</div>
      ) : (
        <div className="grid flex-1 grid-cols-2 content-start gap-5 overflow-hidden">
          {top.map((q, i) => (
            <div
              key={q.id}
              className={[
                'flex items-start gap-5 rounded-3xl p-6 ring-2',
                i === 0 ? 'col-span-2 bg-brand/15 ring-brand' : 'bg-surface-2 ring-hairline',
                q.answered ? 'opacity-50' : '',
              ].join(' ')}
            >
              <div className={['flex shrink-0 flex-col items-center rounded-2xl bg-surface px-4 py-2 font-extrabold tabular-nums text-strong', i === 0 ? 'text-4xl' : 'text-2xl'].join(' ')}>
                <span>👍</span>
                <span>{q.upvotes}</span>
              </div>
              <p className={['flex-1 font-bold leading-snug text-strong', i === 0 ? 'text-4xl' : 'text-2xl'].join(' ')}>
                {q.answered && <span className="mr-2 text-up">✅</span>}
                {q.text}
              </p>
            </div>
          ))}
        </div>
      )}
      {rest > 0 && <p className="mt-4 text-right text-2xl text-muted">외 {rest}개</p>}
    </div>
  );
}
