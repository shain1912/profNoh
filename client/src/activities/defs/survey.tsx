import type { SurveyActivity, SurveyQuestion, SurveyQuestionKind } from '@shared/types';
import { SURVEY_PRESET, SURVEY_MAX_QUESTIONS } from '@shared/surveyPreset';
import type { ActivityDef } from '../types';
import { TextField, ChoiceChips, clampStr, rid } from '../editorKit';
import SurveyStudent from '../../components/activities/SurveyStudent';

const KIND_OPTIONS: Array<{ value: SurveyQuestionKind; label: string }> = [
  { value: 'likert', label: '1~5점' },
  { value: 'nps', label: 'NPS 0~10' },
  { value: 'text', label: '주관식' },
];

const presetCopy = (): SurveyQuestion[] => SURVEY_PRESET.map((q) => ({ ...q, id: rid() }));

function Editor({ act, onChange }: { act: SurveyActivity; onChange: (a: SurveyActivity) => void }) {
  const setQ = (i: number, patch: Partial<SurveyQuestion>) =>
    onChange({ ...act, questions: act.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-3">
      <TextField label="설문 제목" value={act.title} maxLength={80} onChange={(v) => onChange({ ...act, title: v })} />
      <TextField label="안내 문구 (선택)" value={act.intro ?? ''} maxLength={200} placeholder="예: 1분이면 끝나요. 솔직한 의견 부탁드려요!" onChange={(v) => onChange({ ...act, intro: v })} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">문항 ({act.questions.length}/{SURVEY_MAX_QUESTIONS})</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onChange({ ...act, questions: presetCopy() })}>
          ⭐ 표준 만족도 6문항 불러오기
        </button>
      </div>
      {act.questions.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-lg bg-white/5 p-3">
          <div className="flex gap-2">
            <input className="input flex-1" placeholder={`문항 ${i + 1}`} value={q.text} maxLength={200} onChange={(e) => setQ(i, { text: e.target.value })} />
            {act.questions.length > 1 && (
              <button className="text-down" onClick={() => onChange({ ...act, questions: act.questions.filter((_, j) => j !== i) })}>✕</button>
            )}
          </div>
          <ChoiceChips label="응답 방식" value={q.kind} options={KIND_OPTIONS} onChange={(kind) => setQ(i, { kind })} />
          {q.kind !== 'text' && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder={q.kind === 'nps' ? '0점 뜻 (예: 전혀 아니다)' : '1점 뜻 (예: 전혀 아니다)'} value={q.lowLabel ?? ''} maxLength={30} onChange={(e) => setQ(i, { lowLabel: e.target.value })} />
              <input className="input" placeholder={q.kind === 'nps' ? '10점 뜻 (예: 적극 추천)' : '5점 뜻 (예: 매우 그렇다)'} value={q.highLabel ?? ''} maxLength={30} onChange={(e) => setQ(i, { highLabel: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      {act.questions.length < SURVEY_MAX_QUESTIONS && (
        <button className="btn-ghost" onClick={() => onChange({ ...act, questions: [...act.questions, { id: rid(), kind: 'likert', text: '', lowLabel: '전혀 아니다', highLabel: '매우 그렇다' }] })}>
          ＋ 문항 추가
        </button>
      )}
      <p className="text-xs text-white/40">
        참가자는 한 화면에서 전부 응답하고 1번 제출해요. 프로젝터엔 응답 수만 보이고, <b>마감</b>하면 문항별 평균·분포가 공개됩니다. 응답은 익명으로 집계돼요.
      </p>
    </div>
  );
}

const def: ActivityDef<SurveyActivity> = {
  type: 'survey',
  label: '만족도 설문',
  icon: '📝',
  aiQuick: true,
  blank: (id) => ({ type: 'survey', id, title: '강연 만족도 설문', intro: '1분이면 끝나요. 솔직한 의견 부탁드려요!', questions: presetCopy() }),
  fromAI: (raw, id) => {
    const qs: SurveyQuestion[] = (Array.isArray(raw?.questions) ? raw.questions : [])
      .slice(0, SURVEY_MAX_QUESTIONS)
      .map((q: any) => {
        const text = clampStr(q?.text, 200);
        if (!text) return null;
        const kind: SurveyQuestionKind = q?.kind === 'nps' ? 'nps' : q?.kind === 'text' ? 'text' : 'likert';
        return { id: rid(), kind, text, lowLabel: clampStr(q?.lowLabel, 30) || undefined, highLabel: clampStr(q?.highLabel, 30) || undefined };
      })
      .filter(Boolean);
    return {
      type: 'survey',
      id,
      title: clampStr(raw?.title, 80) || '만족도 설문',
      intro: clampStr(raw?.intro, 200) || undefined,
      questions: qs.length ? qs : presetCopy(),
    };
  },
  Editor,
  Student: ({ activity, ctx }) => (
    <SurveyStudent
      activity={activity}
      phase={ctx.live.activity?.survey?.phase ?? 'open'}
      summary={ctx.live.surveys[activity.id] ?? null}
      onSubmit={(answers) => ctx.live.socket.emit('student:surveySubmit', { activityId: activity.id, answers })}
    />
  ),
};

export default def;
