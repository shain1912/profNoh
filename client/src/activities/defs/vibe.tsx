import type { VibeActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, TextAreaField, StringListEditor, ChoiceChips, clampStr, strArr } from '../editorKit';
import VibeStudent from '../../components/activities/VibeStudent';

function Editor({ act, onChange }: { act: VibeActivity; onChange: (a: VibeActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="활동 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <TextAreaField
        label="미션"
        value={act.task}
        maxLength={400}
        rows={3}
        placeholder="예: 항공 정비 체크리스트 앱을 말로 설명해서 만들어 보자."
        onChange={(v) => onChange({ ...act, task: v })}
      />
      <StringListEditor
        label="원클릭 앱 아이디어"
        items={act.ideas ?? []}
        maxItems={8}
        maxLength={100}
        placeholder="예: 비행기 부품 이름 맞히기 퀴즈 앱, 문제 5개"
        addLabel="＋ 아이디어"
        onChange={(ideas) => onChange({ ...act, ideas })}
      />
      <ChoiceChips
        label="시작 방식"
        value={act.continueMode ?? 'new'}
        options={[
          { value: 'new', label: '✨ 새로 만들기' },
          { value: 'continue', label: '🔧 이전 활동의 내 앱 이어서 고치기' },
        ]}
        onChange={(continueMode) => onChange({ ...act, continueMode })}
      />
      <ChoiceChips
        label="내가 생성한 이미지 넣기"
        value={act.useMyImages ? 'on' : 'off'}
        options={[
          { value: 'off', label: '끄기' },
          { value: 'on', label: '🎨 켜기 (이미지 생성 활동 결과 사용)' },
        ]}
        onChange={(v) => onChange({ ...act, useMyImages: v === 'on' ? true : undefined })}
      />
      <TextField
        label="1인당 생성·수정 횟수 (1~20)"
        value={String(act.maxBuilds ?? 8)}
        maxLength={2}
        onChange={(v) => {
          const n = Number(v.replace(/\D/g, ''));
          onChange({ ...act, maxBuilds: n ? Math.min(20, Math.max(1, n)) : undefined });
        }}
      />
    </div>
  );
}

const def: ActivityDef<VibeActivity> = {
  type: 'vibe',
  label: '바이브코딩',
  icon: '💻',
  aiQuick: true,
  blank: (id) => ({ type: 'vibe', id, title: '새 바이브코딩', intro: '', task: '', ideas: [], continueMode: 'new', maxBuilds: 8 }),
  fromAI: (raw, id) => ({
    type: 'vibe',
    id,
    title: clampStr(raw?.title, 80) || '바이브코딩',
    intro: clampStr(raw?.intro, 200) || undefined,
    task: clampStr(raw?.task, 400) || '말로 설명해서 나만의 앱을 만들어 보자.',
    ideas: strArr(raw?.ideas, 8, 100),
    continueMode: raw?.continueMode === 'continue' ? 'continue' : 'new',
    maxBuilds: typeof raw?.maxBuilds === 'number' ? Math.min(20, Math.max(1, Math.round(raw.maxBuilds))) : 6,
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <VibeStudent activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
