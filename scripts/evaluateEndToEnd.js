import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { classifyUploadedFile } from '../src/services/classificationPipeline.js';
import { loadGroundTruth, loadTestDocument, expectedKey } from './_evaluationUtils.js';

const tests = await loadGroundTruth();
const rows = [];
for (const entry of tests) {
  const { buffer } = await loadTestDocument(entry);
  const file = { buffer, originalname: entry.file, mimetype: '', size: buffer.length };
  const started = performance.now();
  try {
    const result = await classifyUploadedFile(file);
    const actual = result.result?.decision === 'MATCH' ? `${result.result.schedule_number}::${result.result.series_number}` : 'NO_MATCH';
    const expected = expectedKey(entry);
    const correct = actual === expected;
    rows.push({ file: entry.file, expected, actual, correct, model: result.classificationModel, ms: Number((performance.now()-started).toFixed(1)) });
    console.log(`${correct ? 'PASS' : 'FAIL'} ${entry.file}: ${actual} (expected ${expected})`);
  } catch (error) {
    rows.push({ file: entry.file, expected: expectedKey(entry), actual: 'ERROR', correct: false, error: error.message });
    console.log(`ERROR ${entry.file}: ${error.message}`);
  }
}
const accuracy = rows.filter((r) => r.correct).length / Math.max(1, rows.length);
const report = { generatedAt: new Date().toISOString(), count: rows.length, accuracy, rows };
await mkdir(new URL('../benchmarks/', import.meta.url), { recursive: true });
await writeFile(new URL('../benchmarks/end-to-end-evaluation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`\nEnd-to-end accuracy: ${(accuracy*100).toFixed(1)}%`);
