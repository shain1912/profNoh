import type { LabActivity as LabAct } from '@shared/types';
import type { ActivityDef } from '../types';
import { TextField, TextAreaField, ChoiceChips, StringListEditor, clampStr, strArr } from '../editorKit';
import LabActivity from '../../components/activities/LabActivity';

const LABEL_DEFAULTS: Record<LabAct['labType'], [string, string]> = {
  prompt: ['정중한 표현', '퉁명스러운 표현'],
  context: ['맥락 없음', '맥락 있음'],
  harness: ['싱글샷(한 번에)', '다단계(계획→세부→점검)'],
};

function Editor({ act, onChange }: { act: LabAct; onChange: (a: LabAct) => void }) {
  const canned = act.cannedResults ?? {};
  const setCanned = (prompt: string, patch: Partial<{ outputA: string; outputB: string }>) => {
    const cur = canned[prompt] ?? { outputA: '', outputB: '' };
    onChange({ ...act, cannedResults: { ...canned, [prompt]: { ...cur, ...patch } } });
  };
  const removeCanned = (prompt: string) => {
    const next = { ...canned };
    delete next[prompt];
    onChange({ ...act, cannedResults: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="space-y-3">
      <TextField label="실습 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} onChange={(v) => onChange({ ...act, intro: v || undefined })} />
      <ChoiceChips
        label="비교 유형"
        value={act.labType}
        options={[
          { value: 'prompt', label: '🔄 표현/말투 비교' },
          { value: 'context', label: '🆚 맥락 유무 비교' },
          { value: 'harness', label: '⚙️ 한 번에 vs 단계별' },
        ]}
        onChange={(labType) => {
          const [a, b] = LABEL_DEFAULTS[labType];
          const keepA = Object.values(LABEL_DEFAULTS).some(([x]) => x === act.labelA) ? a : act.labelA;
          const keepB = Object.values(LABEL_DEFAULTS).some(([, y]) => y === act.labelB) ? b : act.labelB;
          onChange({ ...act, labType, labelA: keepA || a, labelB: keepB || b });
        }}
      />
      <TextAreaField label="학생 과제 설명" value={act.task} maxLength={500} rows={3} placeholder="예: 하고 싶은 요청을 한 줄로 적어줘." onChange={(v) => onChange({ ...act, task: v })} />
      <TextField label="입력 예시 (placeholder, 선택)" value={act.inputPlaceholder ?? ''} maxLength={100} placeholder="예: 주말에 볼 영화 추천해줘" onChange={(v) => onChange({ ...act, inputPlaceholder: v || undefined })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="A쪽 라벨" value={act.labelA} maxLength={60} onChange={(v) => onChange({ ...act, labelA: v })} />
        <TextField label="B쪽 라벨" value={act.labelB} maxLength={60} onChange={(v) => onChange({ ...act, labelB: v })} />
      </div>
      <StringListEditor
        label="원클릭 예시 요청 (칩으로 표시, 선택)"
        items={act.examplePrompts ?? []}
        maxItems={8}
        maxLength={100}
        placeholder="예: 우리 반 체육대회 운영 계획 짜줘"
        addLabel="＋ 예시"
        onChange={(examplePrompts) => onChange({ ...act, examplePrompts })}
      />
      {(act.examplePrompts ?? []).filter(Boolean).length > 0 && (
        <details className="rounded-xl border border-white/10 bg-white/5 p-3">
          <summary className="cursor-pointer text-sm text-white/60">
            🔒 예시별 고정 결과 (선택 — 실시간 AI 호출 대신 항상 이 결과를 보여줌)
          </summary>
          <p className="mt-2 text-xs text-white/40">
            AI 응답 편차 때문에 두 결과의 차이가 매번 크게 안 날 수 있어요. 고정 결과를 넣어두면 그 예시를 눌렀을 때 항상 확실한 대조를 보장합니다.
          </p>
          <div className="mt-2 space-y-3">
            {(act.examplePrompts ?? []).filter(Boolean).map((p) => (
              <div key={p} className="rounded-lg bg-black/20 p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white/70 truncate">“{p}”</span>
                  {canned[p] ? (
                    <button className="shrink-0 text-xs text-down" onClick={() => removeCanned(p)}>고정 해제</button>
                  ) : (
                    <button className="shrink-0 text-xs text-brand" onClick={() => setCanned(p, {})}>고정 결과 넣기</button>
                  )}
                </div>
                {canned[p] && (
                  <>
                    <TextAreaField label={`${act.labelA} 결과`} value={canned[p].outputA} maxLength={4000} rows={3} onChange={(v) => setCanned(p, { outputA: v })} />
                    <TextAreaField label={`${act.labelB} 결과`} value={canned[p].outputB} maxLength={4000} rows={3} onChange={(v) => setCanned(p, { outputB: v })} />
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const def: ActivityDef<LabAct> = {
  type: 'lab',
  label: '비교 실습',
  icon: '🔬',
  aiQuick: true,
  blank: (id) => ({
    type: 'lab', id, labType: 'context', title: '새 비교 실습', intro: '',
    task: '', inputPlaceholder: '', examplePrompts: [],
    labelA: LABEL_DEFAULTS.context[0], labelB: LABEL_DEFAULTS.context[1],
  }),
  fromAI: (raw, id) => {
    const labType: LabAct['labType'] = ['prompt', 'context', 'harness'].includes(raw?.labType) ? raw.labType : 'context';
    return {
      type: 'lab',
      id,
      labType,
      title: clampStr(raw?.title, 80) || '비교 실습',
      intro: clampStr(raw?.intro, 200) || undefined,
      task: clampStr(raw?.task, 500) || '비교 분석해보세요.',
      inputPlaceholder: clampStr(raw?.inputPlaceholder, 100) || undefined,
      examplePrompts: strArr(raw?.examplePrompts, 8, 100),
      labelA: clampStr(raw?.labelA, 60) || LABEL_DEFAULTS[labType][0],
      labelB: clampStr(raw?.labelB, 60) || LABEL_DEFAULTS[labType][1],
    };
  },
  Editor,
  Student: ({ activity, ctx }) => (
    <LabActivity activity={activity} token={ctx.token} sessionId={ctx.sessionId} />
  ),
};

export default def;
