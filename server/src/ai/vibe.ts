import type { ChatMessage } from './minimax';
import type { ClassroomMode } from '../../../shared/types';

// ──────────────────────────────────────────────────────────────
//  바이브코딩 — 학생의 말 한마디 → 폰에서 바로 도는 한 파일짜리 HTML 앱.
//  앱은 /api/vibe/app/:id 에서 CSP sandbox(불투명 출처)로만 실행되므로
//  axedu 쿠키·API 에 접근할 수 없고, 외부 네트워크(connect-src)도 막힌다.
// ──────────────────────────────────────────────────────────────

export const VIBE_MAX_TOKENS = 6000;

/** 앱 HTML 응답 헤더용 CSP — sandbox 로 불투명 출처, 네트워크·폼 전송 차단 */
export const VIBE_CSP = [
  'sandbox allow-scripts allow-modals allow-popups',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src * data: blob:',
  'media-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
].join('; ');

function systemPrompt(mode: ClassroomMode): string {
  const who = mode === 'auditorium' ? '강당 특강에 참여한 고등학생' : '고등학생';
  return `너는 ${who}이 말로 설명한 앱을 만들어 주는 "바이브코딩" 도우미야.
학생은 코드를 모른다. 학생의 요청을 스마트폰에서 바로 실행되는 한 파일짜리 웹앱으로 만든다.

반드시 지킬 규칙:
- 출력은 \`\`\`html 코드 블록 하나만. 앞뒤 설명 금지. <!DOCTYPE html> 로 시작해 </html> 로 끝나는 완성된 문서.
- HTML·CSS·순수 JavaScript 만 사용 (한 파일 안에 <style>, <script>). 외부 라이브러리·CDN·웹폰트·fetch·외부 이미지 URL 금지 (실행 환경에서 네트워크가 막혀 있다). 아이콘·그림은 이모지나 CSS·SVG 로.
- 모바일 우선: <meta name="viewport" content="width=device-width, initial-scale=1">, 세로 화면 기준, 버튼·글자는 손가락으로 누르기 쉽게 크게.
- 화면 글자는 모두 한국어. <title> 에 앱 이름을 짧게 넣는다.
- 코드는 간결하게 (대략 250줄 이내). 꾸밈은 산뜻한 색·둥근 모서리·그림자 정도로. 저작권·연도 푸터는 넣지 않는다.
- 데이터 저장이 필요하면 localStorage 를 try/catch 로 감싸 쓰고, 실패해도 앱이 동작하게.
- 학교에서 쓰기에 부적절한 내용(폭력·선정·혐오·도박·개인정보 수집)은 만들지 않는다. 이름·전화번호 같은 개인정보 입력칸을 만들지 않는다.
- 사실 정보(수치·규정 등)를 넣을 땐 "예시 값 — 실제 매뉴얼로 확인" 같은 안내를 화면에 함께 표시한다.`;
}

export function buildVibeMessages(opts: {
  mode: ClassroomMode;
  task: string;
  request: string;
  baseHtml?: string;
  images?: { url: string; prompt: string }[];
}): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: systemPrompt(opts.mode) }];
  const imgNote = opts.images?.length
    ? `\n\n학생이 이 수업에서 직접 만든 이미지 (앱에 넣어도 된다 — <img src> 에 아래 경로를 그대로 사용):\n` +
      opts.images.map((im, i) => `${i + 1}. ${im.url}  (설명: ${im.prompt})`).join('\n')
    : '';
  if (opts.baseHtml) {
    msgs.push({
      role: 'user',
      content:
        `오늘 미션: ${opts.task}\n\n아래는 학생이 지금까지 만든 앱이다. 학생의 수정 요청을 반영해 **전체 HTML 을 다시** 출력해. ` +
        `요청하지 않은 기존 기능과 디자인은 유지한다.${imgNote}\n\n현재 앱:\n\`\`\`html\n${opts.baseHtml}\n\`\`\`\n\n학생의 수정 요청: ${opts.request}`,
    });
  } else {
    msgs.push({
      role: 'user',
      content: `오늘 미션: ${opts.task}${imgNote}\n\n학생의 요청: ${opts.request}`,
    });
  }
  return msgs;
}

/** 모델 출력 → 완성된 HTML (없거나 잘렸으면 null) */
export function extractHtml(raw: string): string | null {
  let s = raw;
  const fence = /```(?:html)?\s*\n([\s\S]*?)```/i.exec(raw);
  if (fence) s = fence[1];
  const start = s.search(/<!DOCTYPE html|<html/i);
  const endIdx = s.toLowerCase().lastIndexOf('</html>');
  if (start < 0 || endIdx < 0 || endIdx < start) return null;
  return s.slice(start, endIdx + '</html>'.length).trim();
}

export function htmlTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || '나의 앱';
}
