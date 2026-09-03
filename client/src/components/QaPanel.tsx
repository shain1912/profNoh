import { useEffect, useState } from 'react';
import type { QuestionItem } from '@shared/types';

// 참가자 Q&A 패널 — 익명 질문 보내기 + 질문 목록(업보트순) + 👍 (1인 1질문 1회, 서버가 최종 검증)
// 내 질문·내 업보트는 이 브라우저에만 저장(localStorage) — 서버는 작성자를 기록하지 않는다

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return new Set();
  }
}
function saveSet(key: string, s: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...s].slice(-200)));
  } catch { /* ignore */ }
}

/** 업보트 내림차순 → 최신순. 답변된 질문은 뒤로 */
export function sortQuestions(qs: QuestionItem[]): QuestionItem[] {
  return [...qs].sort((a, b) =>
    Number(a.answered) - Number(b.answered) || b.upvotes - a.upvotes || b.createdAt - a.createdAt,
  );
}

export default function QaPanel({
  token,
  questions,
  moderation,
  onAsk,
  onUpvote,
  onClose,
}: {
  token: string;
  questions: QuestionItem[];
  moderation: boolean;
  onAsk: (text: string) => void;
  onUpvote: (questionId: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const [mine, setMine] = useState<Set<string>>(() => loadSet(`axedu_qa_mine_${token}`));
  const [upvoted, setUpvoted] = useState<Set<string>>(() => loadSet(`axedu_qa_up_${token}`));

  // 내가 보낸 직후 도착한 새 질문을 "내 질문"으로 표시 (서버는 작성자를 모르므로 시간 근접으로 추정)
  useEffect(() => {
    if (!sentAt) return;
    const q = questions.find((x) => Math.abs(x.createdAt - sentAt) < 4000 && !mine.has(x.id));
    if (q) {
      const next = new Set(mine).add(q.id);
      setMine(next);
      saveSet(`axedu_qa_mine_${token}`, next);
      setSentAt(0);
    }
  }, [questions, sentAt, mine, token]);

  const sorted = sortQuestions(questions);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card flex max-h-[85vh] max-w-md flex-col" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="text-lg font-bold text-brand">❓ 질문하기</h2>
        <p className="mt-1 text-xs text-muted">
          닉네임 없이 익명으로 전달돼요. 궁금한 질문에 👍를 눌러 위로 올려주세요.
          {moderation && ' 진행자 승인 후 공개됩니다.'}
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t) return;
            onAsk(t);
            setSentAt(Date.now());
            setText('');
          }}
        >
          <input
            className="input flex-1 text-sm"
            maxLength={300}
            placeholder="예) 아까 말씀하신 사례를 우리 팀에 적용하려면?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary shrink-0 px-4 text-sm font-bold disabled:opacity-40" disabled={!text.trim()}>
            보내기
          </button>
        </form>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto custom-scrollbar">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-2">아직 질문이 없어요. 첫 질문을 남겨보세요!</p>
          ) : (
            sorted.map((q) => {
              const isMine = mine.has(q.id);
              const didUp = upvoted.has(q.id);
              return (
                <div
                  key={q.id}
                  className={[
                    'flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1',
                    isMine ? 'bg-brand/5 ring-brand/40' : 'bg-surface-2 ring-hairline',
                    q.answered ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <button
                    className={[
                      'flex w-12 shrink-0 flex-col items-center rounded-lg py-1 text-xs font-bold transition active:scale-95',
                      didUp ? 'bg-brand text-on-brand' : 'bg-surface text-strong ring-1 ring-hairline hover:bg-surface-3',
                      !q.approved ? 'invisible' : '',
                    ].join(' ')}
                    disabled={didUp || !q.approved}
                    onClick={() => {
                      onUpvote(q.id);
                      const next = new Set(upvoted).add(q.id);
                      setUpvoted(next);
                      saveSet(`axedu_qa_up_${token}`, next);
                    }}
                    aria-label="공감"
                  >
                    <span className="text-base">👍</span>
                    <span className="tabular-nums">{q.upvotes}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-body">{q.text}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                      {isMine && <span className="rounded-full bg-brand/10 px-2 py-0.5 font-bold text-brand">내 질문</span>}
                      {!q.approved && <span className="rounded-full bg-warn/10 px-2 py-0.5 font-bold text-warn">⏳ 승인 대기</span>}
                      {q.answered && <span className="rounded-full bg-up/10 px-2 py-0.5 font-bold text-up">✅ 답변됨</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
