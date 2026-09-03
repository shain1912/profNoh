import type { QuizActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, Field, rid, clampStr } from '../editorKit';
import QuizStudent from '../../components/activities/QuizStudent';

function blankQuestion() {
  return { id: rid(), question: '', options: ['', ''], correctIndex: 0, timeLimitSec: 20, explanation: '' };
}

function Editor({ act, onChange }: { act: QuizActivity; onChange: (a: QuizActivity) => void }) {
  const setQ = (qi: number, patch: Partial<QuizActivity['questions'][number]>) =>
    onChange({ ...act, questions: act.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-4">
      <TextField label="퀴즈 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} placeholder="예: 가볍게 몸풀기! 빠르게 맞혀보자." onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <label className="flex items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={!!act.autoReveal} onChange={(e) => onChange({ ...act, autoReveal: e.target.checked || undefined })} />
        제한 시간이 끝나면 자동으로 정답 공개 (강사 조작 없이 진행)
      </label>
      {act.questions.map((q, qi) => (
        <div key={q.id} className="card space-y-2">
          <input className="input" placeholder="문제" value={q.question} maxLength={200} onChange={(e) => setQ(qi, { question: e.target.value })} />
          {q.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input type="radio" checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} title="정답" />
              <input className="input" placeholder={`보기 ${oi + 1}`} value={o} maxLength={120} onChange={(e) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })} />
              {q.options.length > 2 && <button className="text-down" onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi), correctIndex: 0 })}>✕</button>}
            </div>
          ))}
          {q.options.length < 4 && <button className="btn-ghost px-2 py-1 text-sm" onClick={() => setQ(qi, { options: [...q.options, ''] })}>＋ 보기</button>}
          <Field label={`제한 시간: ${q.timeLimitSec}초`}>
            <input type="range" min={5} max={120} step={5} className="w-full" value={q.timeLimitSec} onChange={(e) => setQ(qi, { timeLimitSec: Number(e.target.value) })} />
          </Field>
          <input className="input" placeholder="해설(정답 공개 시 표시)" value={q.explanation ?? ''} maxLength={300} onChange={(e) => setQ(qi, { explanation: e.target.value })} />
          {act.questions.length > 1 && <button className="text-sm text-down" onClick={() => onChange({ ...act, questions: act.questions.filter((_, i) => i !== qi) })}>문제 삭제</button>}
        </div>
      ))}
      <button className="btn-ghost" onClick={() => onChange({ ...act, questions: [...act.questions, blankQuestion()] })}>＋ 문제 추가</button>
    </div>
  );
}

const def: ActivityDef<QuizActivity> = {
  type: 'quiz',
  label: '퀴즈',
  icon: '🎮',
  aiQuick: true,
  blank: (id) => ({ type: 'quiz', id, title: '새 퀴즈', questions: [blankQuestion()] }),
  fromAI: (raw, id) => ({
    type: 'quiz',
    id,
    title: clampStr(raw?.title, 80) || '퀴즈',
    intro: clampStr(raw?.intro, 200) || undefined,
    questions: (Array.isArray(raw?.questions) ? raw.questions : []).map((q: any) => ({
      id: rid(),
      question: clampStr(q?.question, 200),
      options: Array.isArray(q?.options) && q.options.length >= 2 ? q.options.map((o: any) => clampStr(o, 120)) : ['', ''],
      correctIndex: typeof q?.correctIndex === 'number' ? q.correctIndex : 0,
      timeLimitSec: typeof q?.timeLimitSec === 'number' ? q.timeLimitSec : 20,
      explanation: clampStr(q?.explanation, 300),
    })),
  }),
  Editor,
  Student: ({ ctx }) => (
    <QuizStudent
      question={ctx.live.question}
      reveal={ctx.live.reveal}
      onAnswer={(i) =>
        ctx.live.question &&
        ctx.live.socket.emit('student:quizAnswer', { questionId: ctx.live.question.questionId, optionIndex: i })
      }
    />
  ),
};

export default def;
