import { useState } from 'react';

// OX 즉석 출제 — 덱 편집 없이 문제·정답만 입력하면 바로 활동이 열린다 (강사 콘솔)
export default function QuickOxModal({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (p: { question: string; answer: 'O' | 'X'; timeLimitSec: number }) => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<'O' | 'X'>('O');
  const [sec, setSec] = useState(20);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="text-lg font-bold text-brand">⚡ OX 즉석 퀴즈</h2>
        <p className="mt-1 text-xs text-muted">문제와 정답만 넣으면 바로 열려요. 점수는 리더보드에 합산됩니다.</p>
        <textarea
          className="input mt-4 w-full resize-none text-sm"
          rows={3}
          maxLength={200}
          placeholder="예) 생성형 AI는 다음 단어를 확률로 예측해 문장을 만든다."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          autoFocus
          data-testid="quick-ox-question"
        />
        <div className="mt-3 text-xs font-semibold text-muted">정답</div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['O', 'X'] as const).map((a) => (
            <button
              key={a}
              className={[
                'rounded-2xl py-4 text-4xl font-black text-white transition active:scale-95',
                a === 'O' ? 'bg-blue-600' : 'bg-red-600',
                answer === a ? 'ring-4 ring-brand ring-offset-2' : 'opacity-40 hover:opacity-70',
              ].join(' ')}
              onClick={() => setAnswer(a)}
              data-testid={`quick-ox-answer-${a}`}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="font-semibold text-muted">제한 시간</span>
          {[10, 20, 30].map((s) => (
            <button
              key={s}
              className={['rounded-full px-3 py-1 font-bold ring-1', sec === s ? 'bg-brand text-on-brand ring-brand' : 'bg-surface-2 ring-hairline hover:bg-surface-3'].join(' ')}
              onClick={() => setSec(s)}
            >
              {s}초
            </button>
          ))}
        </div>
        <button
          className="btn-primary mt-4 w-full py-3 text-base font-extrabold disabled:opacity-40"
          disabled={!question.trim()}
          onClick={() => onOpen({ question: question.trim(), answer, timeLimitSec: sec })}
          data-testid="quick-ox-open"
        >
          🚀 바로 열기
        </button>
      </div>
    </div>
  );
}
