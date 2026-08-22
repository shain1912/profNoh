import type { TutorActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, TextAreaField, ChoiceChips, clampStr } from '../editorKit';
import TutorStudent from '../../components/activities/TutorStudent';

function Editor({ act, onChange }: { act: TutorActivity; onChange: (a: TutorActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="활동 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <ChoiceChips
        label="과목"
        value={act.subject}
        options={[
          { value: 'math', label: '🧮 수학' },
          { value: 'coding', label: '💻 코딩' },
          { value: 'general', label: '📚 일반' },
        ]}
        onChange={(subject) => onChange({ ...act, subject })}
      />
      <TextAreaField
        label="학생 과제 설명"
        value={act.taskDescription}
        maxLength={500}
        rows={3}
        placeholder="예: 어려운 문제 하나를 골라 AI 튜터에게 힌트를 받아가며 풀어보자."
        onChange={(v) => onChange({ ...act, taskDescription: v })}
      />
    </div>
  );
}

const def: ActivityDef<TutorActivity> = {
  type: 'tutor',
  label: 'AI 튜터',
  icon: '🧮',
  aiQuick: true,
  blank: (id) => ({ type: 'tutor', id, title: '새 AI 튜터', intro: '', subject: 'general', taskDescription: '' }),
  fromAI: (raw, id) => ({
    type: 'tutor',
    id,
    title: clampStr(raw?.title, 80) || 'AI 튜터',
    intro: clampStr(raw?.intro, 200) || undefined,
    subject: ['math', 'coding', 'general'].includes(raw?.subject) ? raw.subject : 'general',
    taskDescription: clampStr(raw?.taskDescription, 500) || '문제를 해결해 보세요.',
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <TutorStudent activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
