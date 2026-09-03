import type { SurveyActivity, SurveySummary } from '@shared/types';

// 설문 집계 뷰 — 문항별 평균·분포·NPS·주관식. 익명 집계만 표시(개인 식별 없음)
// 학생(마감 후)·강사 콘솔·프로젝터(big) 공용

export function npsScore(dist: Record<string, number>): number | null {
  let promoters = 0;
  let detractors = 0;
  let n = 0;
  for (const [k, c] of Object.entries(dist)) {
    const v = Number(k);
    n += c;
    if (v >= 9) promoters += c;
    else if (v <= 6) detractors += c;
  }
  return n ? Math.round(((promoters - detractors) / n) * 100) : null;
}

function Bars({ values, dist, big }: { values: number[]; dist: Record<string, number>; big: boolean }) {
  const counts = values.map((v) => dist[String(v)] ?? 0);
  const max = Math.max(1, ...counts);
  // 막대 영역은 고정 높이 컨테이너(items-end) 안에서 % 높이로 그린다 — 부모 높이가 없으면 % 가 0 이 되므로
  return (
    <div className="flex items-end gap-1">
      {values.map((v, i) => (
        <div key={v} className="flex flex-1 flex-col items-center gap-0.5" title={`${v}: ${counts[i]}명`}>
          <span className={['tabular-nums text-muted-2', big ? 'text-sm' : 'text-[10px]'].join(' ')}>{counts[i] || ' '}</span>
          <div className={['flex w-full items-end', big ? 'h-14' : 'h-8'].join(' ')}>
            <div className={['w-full rounded-t', counts[i] ? 'bg-brand' : 'bg-surface-3'].join(' ')} style={{ height: `${counts[i] ? Math.max(6, Math.round((counts[i] / max) * 100)) : 3}%` }} />
          </div>
          <span className={['tabular-nums text-muted', big ? 'text-base' : 'text-[10px]'].join(' ')}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function SurveyResultView({
  activity,
  summary,
  big = false,
  maxTexts = 8,
}: {
  activity: SurveyActivity;
  summary: SurveySummary | null;
  big?: boolean;
  maxTexts?: number;
}) {
  const byId = new Map((summary?.questions ?? []).map((q) => [q.id, q]));
  // 프로젝터(big)는 스크롤 없이 한 화면에 들어가야 하므로 문항이 많으면 3열
  const cols = big ? (activity.questions.filter((q) => q.kind !== 'text').length > 4 ? 3 : 2) : 1;
  return (
    <div className={big ? ['mx-auto grid w-full max-w-7xl gap-3 content-start', cols === 3 ? 'grid-cols-3' : 'grid-cols-2'].join(' ') : 'space-y-3'}>
      {activity.questions.map((q, i) => {
        const s = byId.get(q.id);
        const isText = q.kind === 'text';
        return (
          <div key={q.id} className={['rounded-xl bg-surface-2 ring-1 ring-hairline', big ? 'p-4' : 'p-3', isText && big ? (cols === 3 ? 'col-span-3' : 'col-span-2') : ''].join(' ')}>
            <div className="flex items-start justify-between gap-3">
              <p className={['font-bold text-strong', big ? 'text-xl' : 'text-sm'].join(' ')}>
                <span className="mr-1.5 text-muted-2">Q{i + 1}</span>
                {q.text}
              </p>
              {!isText && (
                <span className={['shrink-0 font-extrabold tabular-nums text-brand', big ? 'text-3xl' : 'text-lg'].join(' ')}>
                  {s?.avg == null ? '–' : s.avg.toFixed(1)}
                  <span className={['ml-0.5 font-semibold text-muted', big ? 'text-base' : 'text-xs'].join(' ')}>/ {q.kind === 'nps' ? 10 : 5}</span>
                </span>
              )}
            </div>
            {!isText && (
              <div className="mt-2">
                <Bars values={q.kind === 'nps' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5]} dist={s?.dist ?? {}} big={big} />
                <div className={['mt-1 flex justify-between text-muted-2', big ? 'text-sm' : 'text-[10px]'].join(' ')}>
                  <span>{q.lowLabel ?? ''}</span>
                  {q.kind === 'nps' && s && s.count > 0 && (
                    <span className="font-bold text-strong">NPS {npsScore(s.dist)}</span>
                  )}
                  <span>{q.highLabel ?? ''}</span>
                </div>
              </div>
            )}
            {isText && (
              <div className={['mt-2 flex flex-wrap gap-1.5', big ? 'text-base' : 'text-xs'].join(' ')}>
                {(s?.texts ?? []).slice(-maxTexts).reverse().map((t, j) => (
                  <span key={j} className="rounded-lg bg-surface px-2.5 py-1 ring-1 ring-hairline">{t}</span>
                ))}
                {(s?.texts?.length ?? 0) === 0 && <span className="text-muted-2">아직 응답이 없어요</span>}
                {(s?.count ?? 0) > maxTexts && <span className="text-muted-2">외 {s!.count - maxTexts}개</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
