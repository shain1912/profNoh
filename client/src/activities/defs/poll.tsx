import type { PollActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, ChoiceChips, StringListEditor, clampStr, strArr } from '../editorKit';
import PollStudent from '../../components/activities/PollStudent';

function Editor({ act, onChange }: { act: PollActivity; onChange: (a: PollActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="투표 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="투표 질문" value={act.prompt} maxLength={200} placeholder="예: 오늘 특강, 한 단어로 남긴다면?" onChange={(v) => onChange({ ...act, prompt: v })} />
      <ChoiceChips
        label="응답 방식"
        value={act.mode}
        options={[
          { value: 'wordcloud', label: '☁️ 자유 단어 (워드클라우드·롤링페이퍼)' },
          { value: 'choice', label: '📊 객관식 (막대 그래프)' },
        ]}
        onChange={(mode) => onChange({ ...act, mode })}
      />
      {act.mode === 'wordcloud' ? (
        <p className="text-xs text-white/40">
          학생이 자유롭게 입력한 단어·문구가 프로젝터에 <b>워드클라우드</b> 또는 <b>롤링페이퍼(문구 대시보드)</b>로 표시됩니다. 수업 중 화면에서 두 보기를 전환할 수 있어요.
        </p>
      ) : (
        <StringListEditor
          label="보기 (2~8개)"
          items={act.options ?? []}
          maxItems={8}
          maxLength={60}
          addLabel="＋ 보기"
          onChange={(options) => onChange({ ...act, options })}
        />
      )}
    </div>
  );
}

const def: ActivityDef<PollActivity> = {
  type: 'poll',
  label: '투표',
  icon: '🗳️',
  aiQuick: true,
  blank: (id) => ({ type: 'poll', id, title: '새 투표', prompt: '', mode: 'wordcloud', options: [] }),
  fromAI: (raw, id) => ({
    type: 'poll',
    id,
    title: clampStr(raw?.title, 80) || '투표',
    prompt: clampStr(raw?.prompt, 200),
    mode: raw?.mode === 'choice' ? 'choice' : 'wordcloud',
    options: raw?.mode === 'choice' ? strArr(raw?.options, 8, 60) : [],
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <PollStudent
      activity={activity}
      dist={ctx.live.polls[activity.id] ?? null}
      onVote={(v) => ctx.live.socket.emit('student:pollVote', { activityId: activity.id, value: v })}
    />
  ),
};

export default def;
