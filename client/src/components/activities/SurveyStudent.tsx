import { useState } from 'react';
import type { SurveyActivity, SurveySummary } from '@shared/types';
import { SURVEY_TEXT_MAX } from '@shared/surveyPreset';
import SurveyResultView from '../SurveyResultView';

// 참가자 설문 화면 — 한 화면에서 전 문항 응답 후 1회 제출 (자기 페이스)
// 리커트 1~5: 버튼 1탭 · NPS 0~10: 칩 1탭 · 주관식: 텍스트
type Answers = Record<string, number | string>;

export default function SurveyStudent({
  activity,
  phase,
  summary,
  onSubmit,
}: {
  activity: SurveyActivity;
  phase: 'open' | 'closed';
  summary: SurveySummary | null;
  onSubmit: (answers: Answers) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const answeredCount = activity.questions.filter((q) => {
    const v = answers[q.id];
    return v !== undefined && v !== '';
  }).length;
  const set = (id: string, v: number | string) => setAnswers((a) => ({ ...a, [id]: v }));

  if (phase === 'closed') {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <h2 className="text-center text-xl font-bold text-strong">📊 {activity.title}</h2>
        <p className="mt-1 text-center text-sm text-muted">설문이 마감됐어요. {submitted ? '응답해 주셔서 감사합니다 🙌' : ''}</p>
        <div className="mt-4">
          <SurveyResultView activity={activity} summary={summary} maxTexts={5} />
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="grid h-full place-items-center p-4 text-center">
        <div>
          <div className="text-6xl">🙌</div>
          <h2 className="mt-3 text-2xl font-extrabold text-strong">제출 완료!</h2>
          <p className="mt-2 text-sm text-muted">응답은 익명으로 집계돼요. 감사합니다.</p>
          <button className="btn-ghost mt-6 text-sm" onClick={() => setSubmitted(false)}>응답 수정하기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <h2 className="text-center text-xl font-bold text-strong">📝 {activity.title}</h2>
        <p className="mt-1 text-center text-xs text-muted">{activity.intro || '탭 몇 번이면 끝나요.'} · 🔒 익명으로 제출됩니다</p>
      </div>
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pb-2 custom-scrollbar">
        {activity.questions.map((q, i) => {
          const v = answers[q.id];
          return (
            <div key={q.id} className="rounded-xl bg-surface-2 p-3 ring-1 ring-hairline">
              <p className="text-sm font-bold text-strong">
                <span className="mr-1.5 text-muted-2">Q{i + 1}</span>
                {q.text}
              </p>
              {q.kind === 'likert' && (
                <div className="mt-2">
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={[
                          'min-h-[52px] rounded-xl text-xl font-extrabold transition active:scale-95',
                          v === n ? 'bg-brand text-on-brand shadow-lg' : 'bg-surface text-strong ring-1 ring-hairline hover:bg-surface-3',
                        ].join(' ')}
                        onClick={() => set(q.id, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-2">
                    <span>{q.lowLabel ?? '전혀 아니다'}</span>
                    <span>{q.highLabel ?? '매우 그렇다'}</span>
                  </div>
                </div>
              )}
              {q.kind === 'nps' && (
                <div className="mt-2">
                  <div className="grid grid-cols-11 gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        className={[
                          'min-h-[44px] rounded-lg text-sm font-extrabold transition active:scale-95',
                          v === n ? 'bg-brand text-on-brand shadow-lg' : 'bg-surface text-strong ring-1 ring-hairline hover:bg-surface-3',
                        ].join(' ')}
                        onClick={() => set(q.id, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-2">
                    <span>0 = {q.lowLabel ?? '전혀 아니다'}</span>
                    <span>10 = {q.highLabel ?? '적극 추천'}</span>
                  </div>
                </div>
              )}
              {q.kind === 'text' && (
                <textarea
                  className="input mt-2 w-full resize-none text-sm"
                  rows={3}
                  maxLength={SURVEY_TEXT_MAX}
                  placeholder="자유롭게 적어주세요 (선택)"
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => set(q.id, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* 좌하단 ❓ 플로팅 버튼과 겹치지 않도록 왼쪽 여백 */}
      <div className="mt-2 flex shrink-0 pl-16">
        <button
          className="btn-primary flex-1 py-3.5 text-lg font-extrabold disabled:opacity-40"
          disabled={answeredCount === 0}
          onClick={() => {
            onSubmit(answers);
            setSubmitted(true);
          }}
        >
          제출하기 ({answeredCount}/{activity.questions.length})
        </button>
      </div>
    </div>
  );
}
