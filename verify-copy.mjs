// 카피 톤 + 거절 비용 0 정적 검사 (R3 결핍 7, R2 A8-1~4)
//
//   C1 참가자·입장 화면 소스에 하드코딩된 교실 표현("선생님/친구들/학생")이 없어야 함 (카피 사전을 통해서만 노출)
//   C2 카피 사전(client/src/lib/copy.ts)의 강당(auditorium) 문구는 반말 종결/교실 어휘가 없어야 함
//   C3 서버 카피 사전(server/src/copy.ts)도 동일 규칙
//   C4 참가자 대상 서버 응답/소켓 메시지가 사전 밖 반말 하드코딩으로 남아 있지 않아야 함
//   C5 입장 화면에 개인정보 미수집 1줄이 있어야 함 (privacyLine)
//   A1 참가자 페이지·입장 페이지·활동 컴포넌트에 오디오/진동/푸시/카메라/위치 권한 요청 코드가 없어야 함
//
// 사용: node verify-copy.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const read = (p) => readFileSync(p, 'utf8');
// 주석(//, /* */, {/* */}) 은 검사에서 제외 — 문구 검사는 사용자에게 보이는 텍스트 대상
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(^|[^:])\/\/[^\n]*$/gm, '$1');

// ── 참가자에게 보이는 파일 목록 ──
const participantFiles = [
  'client/src/pages/Join.tsx',
  'client/src/pages/Student.tsx',
  'client/src/components/PollView.tsx',
  'client/src/components/Countdown.tsx',
  ...readdirSync('client/src/components/activities').map((f) => `client/src/components/activities/${f}`),
];

// C1: 교실 어휘 하드코딩 금지
const CLASSROOM_WORDS = /선생님|친구들|학생/;
for (const f of participantFiles) {
  const src = stripComments(read(f));
  const hits = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => CLASSROOM_WORDS.test(l));
  ok(hits.length === 0, `C1 ${f}: 교실 어휘 하드코딩 없음`, hits.map(([n, l]) => `L${n}: ${l.trim()}`).join(' | '));
}

// C2/C3: 사전의 강당 문구 검사 — 반말 종결어미 / 교실 어휘
// (해요체 "~어요/~세요" 는 존댓말이므로 허용. 한글에는 \b 가 동작하지 않아 종결 위치는 문장부호/공백/끝으로 판정)
const END = "(?=[.!?…\\s'\"]|$)";
const BANMAL = new RegExp(`(해줘|해봐|하자|보자|해볼래|할래|거야|였어|했어|(있어|없어|줘|이야|돼|야)${END})`);
function checkDictionary(file, label) {
  const src = read(file);
  // ['교실', '강당'] 튜플의 두 번째 문자열만 추출
  const tuples = [...src.matchAll(/^\s*([A-Za-z]+):\s*\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/gm)];
  ok(tuples.length > 0, `${label}: 사전 항목 파싱 (${tuples.length}개)`);
  const bad = [];
  for (const [, key, , aud] of tuples) {
    if (CLASSROOM_WORDS.test(aud) || BANMAL.test(aud)) bad.push(`${key}="${aud}"`);
  }
  ok(bad.length === 0, `${label}: 강당 문구에 반말/교실 어휘 없음`, bad.join(' | '));
  return tuples;
}
const clientTuples = checkDictionary('client/src/lib/copy.ts', 'C2 client copy.ts');
checkDictionary('server/src/copy.ts', 'C3 server copy.ts');

// C4: 참가자 대상 서버 메시지 하드코딩 검사 (socket.ts, state.ts, routes.ts 의 /api/ai/* 라우트 블록)
{
  const socketSrc = stripComments(read('server/src/socket.ts'));
  const stateSrc = stripComments(read('server/src/state.ts'));
  const routesSrc = read('server/src/routes.ts');
  // 라우트 블록 단위로 잘라 참가자 전용(/api/ai/*) 블록만 검사 — 덱 저작/관리 라우트는 강사 대상이라 제외
  const blocks = routesSrc.split(/(?=app\.(?:get|post|put|delete)\(')/);
  const aiSection = stripComments(blocks.filter((b) => /^app\.\w+\('\/api\/ai\//.test(b)).join('\n'));
  ok(aiSection.length > 0, 'C4 routes.ts: /api/ai/* 라우트 블록 추출');
  const find = (src) => [...src.matchAll(/message:\s*'([^']*)'/g)].map((m) => m[1]).filter((m) => BANMAL.test(m) || CLASSROOM_WORDS.test(m));
  ok(find(socketSrc).length === 0, 'C4 socket.ts: 참가자 메시지 반말 하드코딩 없음', find(socketSrc).join(' | '));
  ok(find(stateSrc).length === 0, 'C4 state.ts: 참가자 메시지 반말 하드코딩 없음', find(stateSrc).join(' | '));
  ok(find(aiSection).length === 0, 'C4 routes.ts(/api/ai/*): 참가자 메시지 반말 하드코딩 없음', find(aiSection).join(' | '));
  const chatBlock = blocks.find((b) => b.startsWith("app.post('/api/ai/chat'")) ?? '';
  const labSrc = stripComments(read('server/src/ai/lab.ts'));
  ok(
    !/너는 한국 고등학생/.test(stripComments(chatBlock)) && /audiencePrompt\(/.test(chatBlock) &&
      !/너는 한국 고등학생/.test(labSrc) && /audiencePrompt\(/.test(labSrc),
    'C4 chat/lab AI 시스템 프롬프트가 "고등학생" 고정이 아님 (audiencePrompt 사용)',
  );
}

// C5: 개인정보 미수집 1줄
{
  const join = read('client/src/pages/Join.tsx');
  const priv = clientTuples.find(([, k]) => k === 'privacyLine');
  ok(!!priv && /개인정보는 수집하지 않습니다/.test(priv[3]), 'C5 카피 사전에 개인정보 미수집 문구 존재');
  ok(/copy\.privacyLine/.test(join) && /privacy-line/.test(join), 'C5 입장 화면이 privacyLine 을 렌더링');
}

// A1: 권한/오디오/진동 API 사용 금지 (참가자 화면 전용 파일 + 공용 lib)
{
  const FORBIDDEN = [
    [/new\s+Audio\s*\(/, 'new Audio()'],
    [/<audio\b/i, '<audio>'],
    [/AudioContext/, 'AudioContext'],
    [/\.vibrate\s*\(/, 'navigator.vibrate'],
    [/Notification\.requestPermission|new\s+Notification\s*\(/, 'Web Notification'],
    [/pushManager|serviceWorker\.register/, 'Web Push / Service Worker'],
    [/getUserMedia|mediaDevices/, 'camera/mic (getUserMedia)'],
    [/geolocation/, 'geolocation'],
    [/permissions\.query/, 'permissions.query'],
    [/requestFullscreen/, 'requestFullscreen (참가자 화면 금지)'],
  ];
  const files = [...participantFiles, ...readdirSync('client/src/lib').map((f) => `client/src/lib/${f}`), 'client/index.html'];
  for (const f of files) {
    const src = stripComments(read(f));
    const hits = FORBIDDEN.filter(([re]) => re.test(src)).map(([, name]) => name);
    ok(hits.length === 0, `A1 ${f}: 권한/오디오/진동 요청 없음`, hits.join(', '));
  }
}

console.log(failures === 0 ? '\n🎉 verify-copy: 전부 통과' : `\n💥 verify-copy: ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
