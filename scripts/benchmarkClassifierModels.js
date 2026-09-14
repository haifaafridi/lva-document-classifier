import { writeFile, mkdir } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { retrieveCandidates, chooseClassifierChunks } from '../src/services/retrievalService.js';
import { classifyCandidates } from '../src/services/classificationService.js';
import { loadGroundTruth, loadTestDocument, expectedKey } from './_evaluationUtils.js';

const tests = await loadGroundTruth();
const prepared = [];
for (const entry of tests) {
  const { extraction } = await loadTestDocument(entry);
  const retrieval = await retrieveCandidates(extraction.text);
  prepared.push({ entry, retrieval, classifierChunks: chooseClassifierChunks(retrieval.chunks, retrieval.candidates) });
}

const models = env.classifierBenchmarkModels;
const report = { generatedAt: new Date().toISOString(), models: [] };
for (const model of models) {
  const rows = [];
  console.log(`\n=== ${model} ===`);
  for (const item of prepared) {
    const started = performance.now();
    try {
      const c = await classifyCandidates({ documentChunks: item.classifierChunks, candidates: item.retrieval.candidates, model });
      const actual = c.decision === 'MATCH' ? `${c.schedule_number}::${c.series_number}` : 'NO_MATCH';
      const expected = expectedKey(item.entry);
      rows.push({ file: item.entry.file, expected, actual, correct: actual === expected, ms: Number((performance.now()-started).toFixed(1)) });
      console.log(`${actual === expected ? 'PASS' : 'FAIL'} ${item.entry.file}`);
    } catch (error) {
      rows.push({ file: item.entry.file, expected: expectedKey(item.entry), actual: 'ERROR', correct: false, error: error.message });
    }
  }
  report.models.push({ model, accuracy: rows.filter((r) => r.correct).length / Math.max(1, rows.length), averageMs: rows.reduce((s,r)=>s+(r.ms||0),0)/Math.max(1,rows.length), rows });
}
await mkdir(new URL('../benchmarks/', import.meta.url), { recursive: true });
await writeFile(new URL('../benchmarks/classifier-model-comparison.json', import.meta.url), JSON.stringify(report, null, 2));
console.log('\nSaved benchmarks/classifier-model-comparison.json');
