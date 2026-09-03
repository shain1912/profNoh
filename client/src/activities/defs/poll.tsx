import type { PollActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, ChoiceChips, StringListEditor, clampStr, strArr } from '../editorKit';
import PollStudent from '../../components/activities/PollStudent';

const TIMER_CHOICES = [0, 30, 60, 90, 120] as const;

function Editor({ act, onChange }: { act: PollActivity; onChange: (a: PollActivity) => void }) {
  const timer = act.timerSec ?? 0;
  return (
    <div className="space-y-3">
      <TextField label="투표 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="투표 질문" value={act.prompt} maxLength={200} placeholder="예: 오늘 특강, 한 단어로 남긴다면?" onChange={(v) => onChange({ ...act, prompt: v })} />
      <ChoiceChips
        label="활동 타이머 (설정하면 프로젝터에 게이지가 뜨고 시간이 끝나면 자동 마감 · 마감 전까지 결과 숨김)"
        value={String(timer)}
        options={TIMER_CHOICES.map((s) => ({ value: String(s), label: s === 0 ? '없음' : `${s}초` }))}
        onChange={(v) => onChange({ ...act, timerSec: Number(v) || undefined })}
      />
      <label className="flex items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={!!act.autoReveal} onChange={(e) => onChange({ ...act, autoReveal: e.target.checked || undefined })} />
        마감 시 결과 자동 공개 (끄면 강사가 "결과 공개"를 눌러야 함)
      </label>
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
      state={ctx.live.activity}
      poll={ctx.live.activity?.activityId === activity.id ? ctx.live.activity.poll : undefined}
      onVote={(v) => ctx.live.socket.emit('student:pollVote', { activityId: activity.id, value: v })}
    />
  ),
};

export default def;
