import type { OxActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, TextAreaField, ChoiceChips, Field, clampStr } from '../editorKit';
import OxStudent from '../../components/activities/OxStudent';

function Editor({ act, onChange }: { act: OxActivity; onChange: (a: OxActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextAreaField label="문제 (참/거짓 진술문)" value={act.question} maxLength={200} rows={2} placeholder="예: 생성형 AI는 다음 단어를 확률로 예측해 문장을 만든다." onChange={(v) => onChange({ ...act, question: v })} />
      <ChoiceChips
        label="정답"
        value={act.answer ?? 'O'}
        options={[
          { value: 'O', label: '⭕ O (맞다)' },
          { value: 'X', label: '❌ X (틀리다)' },
        ]}
        onChange={(answer) => onChange({ ...act, answer })}
      />
      <Field label={`제한 시간: ${act.timeLimitSec}초`}>
        <input type="range" min={5} max={120} step={5} className="w-full" value={act.timeLimitSec} onChange={(e) => onChange({ ...act, timeLimitSec: Number(e.target.value) })} />
      </Field>
      <TextField label="해설 (정답 공개 시 표시, 선택)" value={act.explanation ?? ''} maxLength={300} onChange={(v) => onChange({ ...act, explanation: v })} />
      <p className="text-xs text-white/40">
        2지선다 대형 버튼 1문항. 점수·리더보드는 퀴즈와 같은 방식이에요. 수업 중엔 강사 콘솔의 <b>⚡ OX 즉석</b> 버튼으로 덱 편집 없이도 바로 출제할 수 있어요.
      </p>
    </div>
  );
}

const def: ActivityDef<OxActivity> = {
  type: 'ox',
  label: 'OX 퀴즈',
  icon: '⭕',
  aiQuick: true,
  blank: (id) => ({ type: 'ox', id, title: 'OX 퀴즈', question: '', answer: 'O', timeLimitSec: 20 }),
  fromAI: (raw, id) => ({
    type: 'ox',
    id,
    title: clampStr(raw?.title, 80) || 'OX 퀴즈',
    question: clampStr(raw?.question, 200),
    answer: raw?.answer === 'X' ? 'X' : 'O',
    timeLimitSec: typeof raw?.timeLimitSec === 'number' ? Math.min(120, Math.max(5, raw.timeLimitSec)) : 20,
    explanation: clampStr(raw?.explanation, 300) || undefined,
  }),
  Editor,
  Student: ({ ctx }) => (
    <OxStudent
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
