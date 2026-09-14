import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { embedWithModel, modelProfile } from '../src/services/embeddingService.js';
import { chunkDocumentText } from '../src/services/chunkingService.js';
import { loadGroundTruth, loadTestDocument, expectedKey } from './_evaluationUtils.js';

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

async function embedBatches(texts, model, mode) {
  const out = [];
  for (let i = 0; i < texts.length; i += env.embeddingBatchSize) {
    const batch = texts.slice(i, i + env.embeddingBatchSize);
    out.push(...await embedWithModel(batch, { model, mode }));
    process.stdout.write(`\r${model} ${mode}: ${Math.min(i + batch.length, texts.length)}/${texts.length}`);
  }
  process.stdout.write('\n');
  return out;
}

const scheduleRows = JSON.parse(await readFile(new URL('../data/lva_schedules.json', import.meta.url), 'utf8'));
if (scheduleRows.length < 500) {
  console.warn(`WARNING: local data/lva_schedules.json has only ${scheduleRows.length} rows. Run npm run lva:sync first for the full locality benchmark.`);
}
const tests = (await loadGroundTruth()).filter((t) => t.expected?.decision !== 'NO_MATCH' && t.benchmark_embedding !== false);
const report = { generatedAt: new Date().toISOString(), knowledgeBaseRows: scheduleRows.length, models: [] };

for (const model of env.embeddingBenchmarkModels) {
  console.log(`\n=== Embedding benchmark: ${model} ===`);
  const startModel = performance.now();
  const kbStart = performance.now();
  const kbVectors = await embedBatches(scheduleRows.map((r) => r.text_to_embed), model, 'passage');
  const kbMs = performance.now() - kbStart;
  const rows = [];

  for (const entry of tests) {
    const { extraction } = await loadTestDocument(entry);
    const chunks = await chunkDocumentText(extraction.text, { model });
    const queryVectors = await embedWithModel(chunks.map((c) => c.text), { model, mode: 'query' });
    const seriesScores = scheduleRows.map((record, idx) => {
      let best = -Infinity;
      for (const q of queryVectors) best = Math.max(best, dot(q, kbVectors[idx]));
      return { key: `${record.schedule_number}::${record.series_number}`, score: best };
    }).sort((a, b) => b.score - a.score);
    const expected = expectedKey(entry);
    const rank = seriesScores.findIndex((r) => r.key === expected) + 1;
    rows.push({ file: entry.file, expected, rank: rank || null, top1: rank === 1, top3: rank > 0 && rank <= 3, reciprocalRank: rank ? 1 / rank : 0, chunks: chunks.length });
    console.log(`${entry.file}: rank ${rank || 'not found'}`);
  }

  report.models.push({
    model,
    dimension: modelProfile(model).dimension,
    maxTokens: modelProfile(model).maxTokens,
    knowledgeBaseEmbeddingMs: Number(kbMs.toFixed(1)),
    totalMs: Number((performance.now() - startModel).toFixed(1)),
    top1Accuracy: rows.filter((r) => r.top1).length / Math.max(1, rows.length),
    top3Recall: rows.filter((r) => r.top3).length / Math.max(1, rows.length),
    MRR: rows.reduce((s, r) => s + r.reciprocalRank, 0) / Math.max(1, rows.length),
    rows,
  });
}

await mkdir(new URL('../benchmarks/', import.meta.url), { recursive: true });
await writeFile(new URL('../benchmarks/embedding-model-comparison.json', import.meta.url), JSON.stringify(report, null, 2));
console.table(report.models.map((m) => ({ model: m.model, top1: `${(m.top1Accuracy*100).toFixed(1)}%`, top3: `${(m.top3Recall*100).toFixed(1)}%`, MRR: m.MRR.toFixed(3), kbEmbedSeconds: (m.knowledgeBaseEmbeddingMs/1000).toFixed(1) })));
console.log('Saved benchmarks/embedding-model-comparison.json');
