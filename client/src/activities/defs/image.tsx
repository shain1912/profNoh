import type { ImageActivity as ImageAct } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, StringListEditor, clampStr, strArr } from '../editorKit';
import ImageActivity from '../../components/activities/ImageActivity';

function Editor({ act, onChange }: { act: ImageAct; onChange: (a: ImageAct) => void }) {
  return (
    <div className="space-y-3">
      <TextField label="활동 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} placeholder="예: 머릿속 장면을 글로 묘사하면 AI가 그림으로 만들어준다." onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <StringListEditor
        label="원클릭 예시 프롬프트 (장면 묘사 + 스타일)"
        items={act.suggestions ?? []}
        maxItems={8}
        maxLength={100}
        placeholder="예: 숲속 도서관, 따뜻한 햇살, 지브리풍 일러스트"
        addLabel="＋ 예시"
        onChange={(suggestions) => onChange({ ...act, suggestions })}
      />
    </div>
  );
}

const def: ActivityDef<ImageAct> = {
  type: 'image',
  label: '이미지 생성',
  icon: '🎨',
  aiQuick: true,
  blank: (id) => ({ type: 'image', id, title: '새 이미지 생성 실습', intro: '', suggestions: [] }),
  fromAI: (raw, id) => ({
    type: 'image',
    id,
    title: clampStr(raw?.title, 80) || '이미지 생성 실습',
    intro: clampStr(raw?.intro, 200) || undefined,
    suggestions: strArr(raw?.suggestions, 8, 100),
  }),
  Editor,
  Student: ({ activity, ctx }) => (
    <ImageActivity activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
