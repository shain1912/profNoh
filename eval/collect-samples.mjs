// 현재 파이프라인의 출력 샘플 수집 — 실패 모드 라벨링/평가용
// 사용: node eval/collect-samples.mjs [--base URL] [--types quiz,poll] [--repeat N] [--tag 라벨]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
const BASE = opt('base', 'http://localhost:8787');
const TYPES = opt('types', 'quiz,roleplay,poll').split(',');
const REPEAT = Number(opt('repeat', '1'));
const TAG = opt('tag', '');
const SUBJECT_KEYS = ['ai-literacy', 'korean-history', 'physics-circuit', 'econ-supply-demand'];
const TYPE_COUNTS = { quiz: 5, roleplay: 2, poll: 2 };

async function api(path, body) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

const results = [];
const cleanupIds = [];

for (let rep = 0; rep < REPEAT; rep++) {
  for (const key of SUBJECT_KEYS) {
    const pdfB64 = readFileSync(resolve(here, 'fixtures', key + '.pdf')).toString('base64');
    const pdfText = readFileSync(resolve(here, 'fixtures', key + '.txt'), 'utf8');

    const up = await api('/api/decks/upload-pdf', { filename: key + '.pdf', base64: pdfB64 });
    cleanupIds.push(up.deckId);
    const deck = await api('/api/decks/' + up.deckId);
    console.log(`[rep${rep}]`, key, '-> deck', up.deckId);

    for (const type of TYPES) {
      const count = TYPE_COUNTS[type];
      const t0 = Date.now();
      const res = await api('/api/decks/quick-generate', { deck, pdfText, type, count });
      console.log('  ', type, 'x' + count, '->', res.operations.length, 'ops in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
      results.push({
        subject: key, type, rep, requested: count,
        returned: res.operations.length,
        message: res.message,
        operations: res.operations,
        slideCount: deck.slides.length,
      });
    }
  }
}

const outDir = resolve(here, 'runs');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = resolve(outDir, 'samples-' + (TAG ? TAG + '-' : '') + stamp + '.json');
writeFileSync(outPath, JSON.stringify({ base: BASE, tag: TAG, types: TYPES, repeat: REPEAT, collectedAt: stamp, results }, null, 2));
console.log('\nsaved', outPath);
console.log('cleanup deck ids:', cleanupIds.join(' '));
