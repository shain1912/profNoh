import type { ChatActivity as ChatAct } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, TextAreaField, StringListEditor, clampStr, strArr } from '../editorKit';
import ChatActivity from '../../components/activities/ChatActivity';

const DEFAULT_SYSTEM =
  '너는 한국 학생을 위한 친절하고 안전한 학습 도우미야. 쉽고 짧게, 예의 바르게 한국어로 답해. 부적절하거나 위험한 요청은 정중히 거절해.';

function Editor({ act, onChange }: { act: ChatAct; onChange: (a: ChatAct) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="활동 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} placeholder="예: 아래 미션 중 하나를 골라 AI에게 말을 걸어보자." onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <TextAreaField
        label="AI 시스템 프롬프트 (AI가 따라야 할 역할·말투 지시문)"
        value={act.systemPrompt ?? ''}
        maxLength={1000}
        placeholder={DEFAULT_SYSTEM}
        onChange={(v) => onChange({ ...act, systemPrompt: v || undefined })}
      />
      <StringListEditor
        label="가이드 미션 (학생에게 칩으로 표시)"
        items={act.missions ?? []}
        maxItems={6}
        maxLength={120}
        placeholder="예: 오늘 기분을 한 줄 시로 만들어줘."
        addLabel="＋ 미션"
        onChange={(missions) => onChange({ ...act, missions })}
      />
    </div>
  );
}

const def: ActivityDef<ChatAct> = {
  type: 'chat',
  label: 'AI 대화',
  icon: '💬',
  aiQuick: true,
  blank: (id) => ({ type: 'chat', id, title: '새 AI 대화', intro: '', systemPrompt: DEFAULT_SYSTEM, missions: [] }),
  fromAI: (raw, id) => ({
    type: 'chat',
    id,
    title: clampStr(raw?.title, 80) || 'AI와 대화하기',
    intro: clampStr(raw?.intro, 200) || undefined,
    systemPrompt: clampStr(raw?.systemPrompt, 1000) || DEFAULT_SYSTEM,
    missions: strArr(raw?.missions, 6, 120),
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <ChatActivity activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
