import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const pdf = await readFile(new URL('../src/services/extraction/pdfExtractor.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const warmup = await readFile(new URL('../src/services/startupWarmup.js', import.meta.url), 'utf8');

const checks = [
  ['Version is 2.2.0', pkg.version === '2.2.0'],
  ['Record-series box exists', html.includes('id="seriesTitle"') && html.includes('id="seriesNumber"')],
  ['Timing summary exists', app.includes('totalSeconds') && html.includes('processingSummary')],
  ['Frontend cache-busting enabled', html.includes('/app.js?v=2.2.0')],
  ['PDF.js uses normalized filesystem resource paths', pdf.includes("replaceAll('\\\\', '/')") && pdf.includes("+ '/'" )],
  ['Startup warm-up is wired into server', server.includes('warmApplication')],
  ['Warm-up primes embedding and Milvus search', warmup.includes('warmEmbeddingModel') && warmup.includes('searchVector')],
  ['Warm-up can prepare OCR worker', warmup.includes('warmOcrWorker')],
  ['Warm-up diagnostic command exists', pkg.scripts?.['warmup:check'] === 'node scripts/warmupCheck.js'],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`Supervisor-feedback verification failed: ${failed} check(s).`);
  process.exitCode = 1;
} else {
  console.log('Supervisor-feedback + startup-warmup update is installed correctly.');
}
