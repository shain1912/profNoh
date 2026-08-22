import type { WritingActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, ChoiceChips, clampStr } from '../editorKit';
import WritingStudent from '../../components/activities/WritingStudent';

function Editor({ act, onChange }: { act: WritingActivity; onChange: (a: WritingActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="활동 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <ChoiceChips
        label="장르"
        value={act.genre}
        options={[
          { value: 'poem', label: '🪶 시' },
          { value: 'story', label: '📖 이야기' },
          { value: 'essay', label: '📝 에세이' },
        ]}
        onChange={(genre) => onChange({ ...act, genre })}
      />
      <TextField
        label="소재 입력 예시 (placeholder, 선택)"
        value={act.promptPlaceholder ?? ''}
        maxLength={100}
        placeholder="예: 우리 반, 첫눈, 여름 방학"
        onChange={(v) => onChange({ ...act, promptPlaceholder: v || undefined })}
      />
    </div>
  );
}

const def: ActivityDef<WritingActivity> = {
  type: 'writing',
  label: '문학 창작',
  icon: '✍️',
  aiQuick: true,
  blank: (id) => ({ type: 'writing', id, title: '새 문학 창작', intro: '', genre: 'poem', promptPlaceholder: '' }),
  fromAI: (raw, id) => ({
    type: 'writing',
    id,
    title: clampStr(raw?.title, 80) || '문학 창작',
    intro: clampStr(raw?.intro, 200) || undefined,
    genre: ['poem', 'story', 'essay'].includes(raw?.genre) ? raw.genre : 'poem',
    promptPlaceholder: clampStr(raw?.promptPlaceholder, 100) || undefined,
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <WritingStudent activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
