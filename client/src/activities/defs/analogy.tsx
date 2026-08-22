import type { AnalogyActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, clampStr } from '../editorKit';
import AnalogyStudent from '../../components/activities/AnalogyStudent';

function Editor({ act, onChange }: { act: AnalogyActivity; onChange: (a: AnalogyActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="활동 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <TextField
        label="주제 입력 예시 (placeholder, 선택)"
        value={act.topicPlaceholder ?? ''}
        maxLength={100}
        placeholder="예: 블록체인, 양자역학, 인플레이션"
        onChange={(v) => onChange({ ...act, topicPlaceholder: v || undefined })}
      />
      <TextField label="페르소나 A (첫 번째 눈높이)" value={act.personaA} maxLength={300} placeholder="예: 7세 아동 눈높이 비유" onChange={(v) => onChange({ ...act, personaA: v })} />
      <TextField label="페르소나 B (두 번째 눈높이)" value={act.personaB} maxLength={300} placeholder="예: 고등학생 맞춤 일상 비유" onChange={(v) => onChange({ ...act, personaB: v })} />
    </div>
  );
}

const def: ActivityDef<AnalogyActivity> = {
  type: 'analogy',
  label: '눈높이 비유',
  icon: '🔍',
  aiQuick: true,
  blank: (id) => ({ type: 'analogy', id, title: '새 눈높이 비유', intro: '', topicPlaceholder: '', personaA: '7세 아동 눈높이 비유', personaB: '고등학생 맞춤 일상 비유' }),
  fromAI: (raw, id) => ({
    type: 'analogy',
    id,
    title: clampStr(raw?.title, 80) || '눈높이 비유',
    intro: clampStr(raw?.intro, 200) || undefined,
    topicPlaceholder: clampStr(raw?.topicPlaceholder, 100) || undefined,
    personaA: clampStr(raw?.personaA, 300) || '7세 아동 눈높이 비유',
    personaB: clampStr(raw?.personaB, 300) || '고등학생 맞춤 일상 비유',
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <AnalogyStudent activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
