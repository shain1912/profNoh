import type { QaSettings, QuestionItem } from '@shared/types';
import type { AppSocket } from '../lib/socket';

// 강사 Q&A 콘솔 — 업보트순 목록 + 답변완료 체크 + 승인 후 공개(모더레이션) 토글 + 프로젝터 카드 뷰 토글
function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

/** 강사용 정렬: 승인 대기 → 미답변(업보트순) → 답변됨 */
function sortForInstructor(qs: QuestionItem[]): QuestionItem[] {
  return [...qs].sort((a, b) =>
    Number(a.approved) - Number(b.approved) ||
    Number(a.answered) - Number(b.answered) ||
    b.upvotes - a.upvotes ||
    b.createdAt - a.createdAt,
  );
}

export default function InstructorQa({
  questions,
  qa,
  socket,
  onClose,
}: {
  questions: QuestionItem[];
  qa: QaSettings;
  socket: AppSocket;
  onClose: () => void;
}) {
  const pending = questions.filter((q) => !q.approved).length;
  const sorted = sortForInstructor(questions);
  const setQa = (p: Partial<QaSettings>) => socket.emit('instructor:qaSettings', p);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card flex max-h-[85vh] max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="text-lg font-bold text-brand">
          ❓ 질문 ({questions.length}){pending > 0 && <span className="ml-2 rounded-full bg-warn/10 px-2 py-0.5 text-xs text-warn">승인 대기 {pending}</span>}
        </h2>
        <p className="mt-1 text-xs text-muted">익명 질문이에요. 👍 많은 순으로 보여요. 답한 질문은 ✅ 체크하세요.</p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            className={['rounded-full px-3 py-1 font-bold ring-1 transition', qa.onScreen ? 'bg-brand text-on-brand ring-brand' : 'bg-surface-2 text-body ring-hairline hover:bg-surface-3'].join(' ')}
            onClick={() => setQa({ onScreen: !qa.onScreen })}
            data-testid="qa-onscreen"
          >
            📺 프로젝터에 질문 카드 {qa.onScreen ? 'ON' : 'OFF'}
          </button>
          <button
            className={['rounded-full px-3 py-1 font-bold ring-1 transition', qa.moderation ? 'bg-warn/15 text-warn ring-warn/40' : 'bg-surface-2 text-body ring-hairline hover:bg-surface-3'].join(' ')}
            onClick={() => setQa({ moderation: !qa.moderation })}
            data-testid="qa-moderation"
          >
            🛡️ {qa.moderation ? '승인 후 공개' : '자동 공개'}
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto custom-scrollbar">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-2">아직 들어온 질문이 없어요.</p>
          ) : (
            sorted.map((q) => (
              <div
                key={q.id}
                className={[
                  'rounded-xl px-3 py-2.5 text-left ring-1',
                  !q.approved ? 'bg-warn/5 ring-warn/40' : q.answered ? 'bg-surface-2 ring-hairline opacity-60' : 'bg-surface-2 ring-hairline',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 rounded-lg bg-surface px-2 py-1 text-xs font-bold tabular-nums ring-1 ring-hairline">👍 {q.upvotes}</span>
                  <p className="flex-1 text-sm leading-relaxed">{q.text}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-2">
                  <span>{timeAgo(q.createdAt)}{!q.approved && ' · ⏳ 승인 대기'}{q.answered && ' · ✅ 답변됨'}</span>
                  <span className="flex gap-1">
                    {!q.approved && (
                      <button className="rounded bg-up/15 px-2 py-0.5 font-bold text-up hover:bg-up/25" onClick={() => socket.emit('instructor:questionApprove', { questionId: q.id })}>
                        승인
                      </button>
                    )}
                    <button
                      className={['rounded px-2 py-0.5 font-bold', q.answered ? 'bg-surface ring-1 ring-hairline text-muted hover:text-strong' : 'bg-brand/10 text-brand hover:bg-brand/20'].join(' ')}
                      onClick={() => socket.emit('instructor:questionAnswered', { questionId: q.id, answered: !q.answered })}
                    >
                      {q.answered ? '↩ 되돌리기' : '✅ 답변완료'}
                    </button>
                    <button className="rounded px-2 py-0.5 text-muted hover:bg-down/10 hover:text-down" onClick={() => socket.emit('instructor:questionRemove', { questionId: q.id })}>
                      삭제
                    </button>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
