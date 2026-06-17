import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const guideMenu = readFileSync('client/src/components/GuideFloatingMenu.tsx', 'utf8');
const indexHtml = readFileSync('client/index.html', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

for (const prefix of ['/screen', '/play', '/report']) {
  assert.match(
    guideMenu,
    new RegExp(`['"]${prefix.replace('/', '\\/')}['"]`),
    `GuideFloatingMenu should be hidden on ${prefix} routes`,
  );
}

assert.match(
  guideMenu,
  /some\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*location\.pathname\.startsWith\(\s*\w+\s*\)\s*\)/,
  'GuideFloatingMenu should hide using a shared route prefix list',
);

for (const blockedHost of [
  'cdn.jsdelivr.net/gh/orioncactus/pretendard',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'IBM+Plex+Mono',
]) {
  assert.equal(
    indexHtml.includes(blockedHost),
    false,
    `index.html should not depend on external font resource: ${blockedHost}`,
  );
}

assert.match(indexCss, /font-family:[^;]*system-ui/i, 'Body font stack should include system-ui fallback');
assert.match(indexCss, /font-family:[^;]*ui-monospace/i, 'Numeric font stack should include ui-monospace fallback');

