import type { RoleplayActivity } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, TextAreaField, clampStr } from '../editorKit';
import RoleplayStudent from '../../components/activities/RoleplayStudent';

function Editor({ act, onChange }: { act: RoleplayActivity; onChange: (a: RoleplayActivity) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="역할극 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <TextAreaField
        label="AI 캐릭터 지시문 (systemPrompt)"
        value={act.systemPrompt}
        maxLength={1000}
        rows={5}
        placeholder="예: 너는 세종대왕이야. 한글 창제의 뜻을 학생과 토론해줘…"
        onChange={(v) => onChange({ ...act, systemPrompt: v })}
      />
      <TextField
        label="미션 키워드 (10자 이내 명사 하나 — AI 답변에 이 단어가 나오면 미션 완료)"
        value={act.missionKeyword}
        maxLength={15}
        placeholder="예: 애민정신"
        onChange={(v) => onChange({ ...act, missionKeyword: v })}
      />
      <p className="text-xs text-white/40">
        문장형(“전압은 어디서나 같다”)이나 쉼표 나열은 완료 판정이 안 돼요. 어미가 바뀌어도 그대로 포함될 짧은 명사(구) 하나를 쓰세요.
      </p>
      <TextAreaField
        label="학생 미션 설명"
        value={act.missionDescription}
        maxLength={300}
        rows={3}
        placeholder="예: 세종대왕님이 백성을 사랑하는 마음을 나타내는 단어를 말씀하시게 해보자!"
        onChange={(v) => onChange({ ...act, missionDescription: v })}
      />
    </div>
  );
}

const def: ActivityDef<RoleplayActivity> = {
  type: 'roleplay',
  label: '역할극',
  icon: '🎭',
  aiQuick: true,
  blank: (id) => ({ type: 'roleplay', id, title: '새 AI 역할극', intro: '', systemPrompt: '', missionKeyword: '', missionDescription: '' }),
  fromAI: (raw, id) => ({
    type: 'roleplay',
    id,
    title: clampStr(raw?.title, 80) || 'AI 역할극',
    intro: clampStr(raw?.intro, 200) || undefined,
    systemPrompt: clampStr(raw?.systemPrompt, 1000) || '너는 가이드야.',
    missionKeyword: clampStr(raw?.missionKeyword, 100),
    missionDescription: clampStr(raw?.missionDescription, 300),
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <RoleplayStudent activity={activity} token={ctx.token} sessionId={ctx.sessionId} socket={ctx.live.socket} />
  ),
};

export default def;
