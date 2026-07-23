// 강의자료 자동 생성 파이프라인 평가 하네스
//
// 사용:
//   node eval/run-eval.mjs --samples eval/runs/samples-XXX.json   # 기존 수집본 채점
//   node eval/run-eval.mjs --collect [BASE_URL]                   # 새로 수집 후 채점
//   옵션: --no-judge (LLM judge 생략, 결정적 체크만)
//
// 채점 구조:
//   [결정적] 스키마/개수/위치분산/보기중복/키워드 단일성/투표 모드 분포 — 코드로 판정
//   [Judge]  grounding/정답 정확성·유일성/오답 품질/Bloom 수준/사실 정확성/투표의 의견성 —
//            생성 모델(MiniMax)과 다른 모델(Claude CLI)로 판정해 자기채점 편향 방지
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const NO_JUDGE = args.includes('--no-judge');
const samplesArg = args.includes('--samples') ? args[args.indexOf('--samples') + 1] : null;

// ── 샘플 로드/수집 ─────────────────────────────────────────────
let samples;
if (samplesArg) {
  samples = JSON.parse(readFileSync(resolve(samplesArg), 'utf8'));
} else {
  // 최신 수집본 자동 선택 — 이름 정렬은 태그에 따라 오판하므로("p10" < "p9") 수정시각 기준
  const { statSync } = await import('node:fs');
  const runs = readdirSync(resolve(here, 'runs')).filter((f) => f.startsWith('samples-'))
    .sort((a, b) => statSync(resolve(here, 'runs', a)).mtimeMs - statSync(resolve(here, 'runs', b)).mtimeMs);
  if (runs.length === 0) { console.error('수집본이 없습니다. 먼저 node eval/collect-samples.mjs 실행'); process.exit(1); }
  samples = JSON.parse(readFileSync(resolve(here, 'runs', runs[runs.length - 1]), 'utf8'));
  console.log('using latest samples:', runs[runs.length - 1]);
}

const fixtureText = (key) => readFileSync(resolve(here, 'fixtures', key + '.txt'), 'utf8');

// ── 결정적 체크 ─────────────────────────────────────────────────
function checkDeterministic(group) {
  const issues = [];
  const m = {};
  m.countFulfilled = group.returned === group.requested ? 1 : 0;
  if (!m.countFulfilled) issues.push(`개수 미달 ${group.returned}/${group.requested}`);

  const positions = group.operations.map((o) => o.afterSlideIndex);
  m.positionDistinctRatio = positions.length ? new Set(positions).size / positions.length : 0;
  if (m.positionDistinctRatio < 1 && group.slideCount >= group.requested) issues.push('위치 중복: ' + positions.join(','));

  let schemaOk = 0;
  for (const op of group.operations) {
    const a = op.activity;
    let ok = true;
    if (group.type === 'quiz') {
      const q = a.questions?.[0];
      ok = !!q?.question && Array.isArray(q.options) && q.options.length >= 2 &&
        q.options.every((o) => o?.trim()) &&
        Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length &&
        !!q.explanation?.trim();
      if (ok && new Set(q.options.map((o) => o.trim())).size !== q.options.length) { ok = false; issues.push('보기 중복: ' + q.question.slice(0, 30)); }
    } else if (group.type === 'roleplay') {
      ok = !!a.systemPrompt?.trim() && !!a.missionKeyword?.trim() && !!a.missionDescription?.trim();
      if (ok && /[,、]/.test(a.missionKeyword)) { ok = false; issues.push('키워드 복수 나열: ' + a.missionKeyword); }
    } else if (group.type === 'poll') {
      ok = !!a.prompt?.trim() && ['choice', 'wordcloud'].includes(a.mode) &&
        (a.mode !== 'choice' || (a.options?.length ?? 0) >= 2);
    }
    if (ok) schemaOk++;
  }
  m.schemaPassRatio = group.operations.length ? schemaOk / group.operations.length : 0;

  if (group.type === 'poll') {
    m.wordcloudRatio = group.operations.length
      ? group.operations.filter((o) => o.activity.mode === 'wordcloud').length / group.operations.length : 0;
  }
  return { metrics: m, issues };
}

// ── LLM Judge (Claude CLI) ─────────────────────────────────────
const RUBRICS = {
  quiz: `각 퀴즈를 다음 기준으로 채점해:
- grounded(0|1): 문항과 정답의 근거가 [원문]에 있는가 (합리적 추론 포함)
- answerCorrect(0|1): correctIndex가 가리키는 보기가 실제 정답인가
- answerUnique(0|1): 다른 보기는 명확히 오답인가 (복수 정답 여지 없음)
- distractorQuality(1|2|3): 오답이 그럴듯한가 (1=뻔함, 2=보통, 3=변별력 있음)
- bloom("recall"|"apply"|"analyze"): 단순 암기 회상인지, 적용/계산인지, 분석/판단인지
- titleMatch(0|1): title이 문항 내용과 일치하는가`,
  roleplay: `각 역할극을 다음 기준으로 채점해:
- factuallyAccurate(0|1): systemPrompt/mission의 사실(연도·인과·용어 등)이 [원문] 및 일반 상식과 일치하는가
- keywordReachable(0|1): missionDescription대로 대화하면 AI 답변에 missionKeyword 문자열이 자연스럽게 등장할 수 있는가
- missionClear(0|1): 학생이 무엇을 해야 하는지 명확한가
- grounded(0|1): 주제가 [원문] 내용에 기반하는가`,
  poll: `각 투표를 다음 기준으로 채점해:
- isOpinion(0|1): 정답이 존재하지 않는 의견/선호/경험/예측 질문인가 (정답 있는 문제면 0 — 투표로 부적합)
- grounded(0|1): 주제가 [원문] 내용과 관련 있는가
- clear(0|1): 질문과 보기가 명확한가`,
};

function judgeGroup(group) {
  const src = fixtureText(group.subject);
  const items = group.operations.map((o, i) => ({ idx: i, afterSlideIndex: o.afterSlideIndex, activity: o.activity }));
  const prompt = `너는 교육 콘텐츠 품질 평가자다. 아래 [원문]은 강의자료 전문이고, [아이템들]은 그 자료에서 자동 생성된 ${group.type} 활동이다.

${RUBRICS[group.type]}

반드시 JSON 배열만 출력해 (아이템 순서대로, 각 원소에 idx와 위 기준 필드, 그리고 issue 필드에 발견한 문제를 한국어 한 문장으로 — 없으면 빈 문자열):

[원문]
${src}

[아이템들]
${JSON.stringify(items, null, 1)}`;

  // 연속 호출 시 일시적 실패(rate limit 등)가 있어 재시도 + 백오프
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('claude', ['-p', '--output-format', 'json'], {
        input: prompt, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 180000,
        shell: process.platform === 'win32',
      });
      const wrapper = JSON.parse(out);
      const text = wrapper.result ?? '';
      const s = text.indexOf('['); const e = text.lastIndexOf(']');
      if (s < 0 || e <= s) throw new Error('judge JSON parse 실패: ' + text.slice(0, 200));
      return JSON.parse(text.slice(s, e + 1));
    } catch (e) {
      lastErr = e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000 * (attempt + 1)); // 동기 백오프
    }
  }
  throw lastErr;
}

// ── 실행 ───────────────────────────────────────────────────────
const report = { evaluatedAt: new Date().toISOString(), samplesFrom: samples.collectedAt, groups: [] };

for (const group of samples.results) {
  const det = checkDeterministic(group);
  const entry = { subject: group.subject, type: group.type, requested: group.requested, ...det };
  if (!NO_JUDGE) {
    try {
      process.stdout.write(`judging ${group.subject}/${group.type} ... `);
      entry.judge = judgeGroup(group);
      console.log('ok');
    } catch (e) {
      console.log('FAIL:', e.message?.slice(0, 150));
      entry.judgeError = String(e.message).slice(0, 300);
    }
  }
  report.groups.push(entry);
}

// ── 집계 ───────────────────────────────────────────────────────
function agg(type, field, mode = 'mean') {
  const vals = report.groups.filter((g) => g.type === type && g.judge)
    .flatMap((g) => g.judge.map((j) => j[field])).filter((v) => v !== undefined);
  if (!vals.length) return null;
  if (mode === 'mean') return (vals.reduce((a, b) => a + Number(b), 0) / vals.length);
  if (mode === 'dist') { const d = {}; vals.forEach((v) => (d[v] = (d[v] ?? 0) + 1)); return d; }
}
const pct = (v) => v === null ? 'n/a' : Math.round(v * 100) + '%';

report.summary = {
  quiz: {
    schemaPass: pct(mean('quiz', 'schemaPassRatio')), grounded: pct(agg('quiz', 'grounded')),
    answerCorrect: pct(agg('quiz', 'answerCorrect')), answerUnique: pct(agg('quiz', 'answerUnique')),
    distractorQualityAvg: agg('quiz', 'distractorQuality')?.toFixed(2) ?? 'n/a',
    bloomDist: agg('quiz', 'bloom', 'dist'), titleMatch: pct(agg('quiz', 'titleMatch')),
  },
  roleplay: {
    factuallyAccurate: pct(agg('roleplay', 'factuallyAccurate')), keywordReachable: pct(agg('roleplay', 'keywordReachable')),
    missionClear: pct(agg('roleplay', 'missionClear')), grounded: pct(agg('roleplay', 'grounded')),
  },
  poll: {
    isOpinion: pct(agg('poll', 'isOpinion')), grounded: pct(agg('poll', 'grounded')), clear: pct(agg('poll', 'clear')),
    wordcloudRatio: pct(mean('poll', 'wordcloudRatio')),
  },
};
function mean(type, metricKey) {
  const vals = report.groups.filter((g) => g.type === type).map((g) => g.metrics[metricKey]).filter((v) => v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

mkdirSync(resolve(here, 'runs'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = resolve(here, 'runs', 'report-' + stamp + '.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('\n===== SUMMARY =====');
console.log(JSON.stringify(report.summary, null, 2));
console.log('\n모든 issue:');
for (const g of report.groups) {
  for (const i of g.issues) console.log(` [det] ${g.subject}/${g.type}:`, i);
  for (const j of g.judge ?? []) if (j.issue) console.log(` [judge] ${g.subject}/${g.type}[${j.idx}]:`, j.issue);
}
console.log('\nsaved', outPath);
