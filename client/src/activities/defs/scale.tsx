import type { ScaleActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, clampStr } from '../editorKit';
import ScaleStudent from '../../components/activities/ScaleStudent';

function Editor({ act, onChange }: { act: ScaleActivity; onChange: (a: ScaleActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField
        label="질문 (1~5로 답하는 자기평가)"
        value={act.prompt}
        maxLength={200}
        placeholder="예: 지금 이 방법을 내 업무에 적용할 수 있다고 느끼는 정도는?"
        onChange={(v) => onChange({ ...act, prompt: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="1점 뜻" value={act.lowLabel ?? ''} maxLength={30} placeholder="전혀 아니다" onChange={(v) => onChange({ ...act, lowLabel: v })} />
        <TextField label="5점 뜻" value={act.highLabel ?? ''} maxLength={30} placeholder="매우 그렇다" onChange={(v) => onChange({ ...act, highLabel: v })} />
      </div>
      <p className="text-xs text-white/40">큰 버튼 5개 중 하나를 탭해요. 프로젝터엔 <b>분포 막대 + 평균</b>이 실시간으로 표시됩니다. 정답 없는 의견 질문에 쓰세요.</p>
    </div>
  );
}

const def: ActivityDef<ScaleActivity> = {
  type: 'scale',
  label: '척도 투표(1~5)',
  icon: '📏',
  aiQuick: true,
  blank: (id) => ({ type: 'scale', id, title: '척도 투표', prompt: '', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' }),
  fromAI: (raw, id) => ({
    type: 'scale',
    id,
    title: clampStr(raw?.title, 80) || '척도 투표',
    prompt: clampStr(raw?.prompt, 200),
    lowLabel: clampStr(raw?.lowLabel, 30) || '전혀 아니다',
    highLabel: clampStr(raw?.highLabel, 30) || '매우 그렇다',
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <ScaleStudent
      activity={activity}
      dist={ctx.live.polls[activity.id] ?? null}
      onVote={(value) => ctx.live.socket.emit('student:pollVote', { activityId: activity.id, value })}
    />
  ),
};

export default def;
