import { writeFile, mkdir } from 'node:fs/promises';
import { retrieveCandidates } from '../src/services/retrievalService.js';
import { closeMilvusConnection } from '../src/services/milvusService.js';
import { loadGroundTruth, loadTestDocument, expectedKey, candidateKey } from './_evaluationUtils.js';

const rows = [];
try {
  const tests = await loadGroundTruth();
  for (const entry of tests.filter((t) => t.expected?.decision !== 'NO_MATCH')) {
    const { extraction } = await loadTestDocument(entry);
    const started = performance.now();
    const retrieval = await retrieveCandidates(extraction.text);
    const keys = retrieval.candidates.map(candidateKey);
    const expected = expectedKey(entry);
    const rank = keys.indexOf(expected) + 1;
    rows.push({
      file: entry.file,
      expected,
      rank: rank || null,
      top1: rank === 1,
      top3: rank > 0,
      chunks: retrieval.chunks.length,
      ms: Number((performance.now() - started).toFixed(1)),
      candidates: retrieval.candidates.map((c) => ({
        key: candidateKey(c),
        title: c.series_title,
        rerankerScore: c.rerankerScore ?? null,
        denseRank: c.denseRank ?? null,
        lexicalRank: c.lexicalRank ?? null,
      })),
    });
    console.log(`${rank ? 'PASS' : 'MISS'} ${entry.file}: expected ${expected}, rank ${rank || 'not in Top 3'}`);
    if (!rank) {
      console.log('  Returned:', retrieval.candidates.map((c, i) => `${i + 1}. ${candidateKey(c)} ${c.series_title}`).join(' | '));
      const denseTarget = retrieval.diagnostics.denseCandidates.find((c) => candidateKey(c) === expected);
      const lexicalTarget = retrieval.diagnostics.lexicalCandidates.find((c) => candidateKey(c) === expected);
      const poolTarget = retrieval.diagnostics.preRerankPool.find((c) => candidateKey(c) === expected);
      console.log(`  Target diagnostics: denseRank=${denseTarget?.denseRank ?? 'none'}, lexicalRank=${lexicalTarget?.lexicalRank ?? 'none'}, inFusionPool=${poolTarget ? 'yes' : 'no'}, evidenceQueries=${retrieval.diagnostics.evidenceQueryCount}`);
    }
  }
  const top1 = rows.filter((r) => r.top1).length / Math.max(1, rows.length);
  const top3 = rows.filter((r) => r.top3).length / Math.max(1, rows.length);
  const report = { generatedAt: new Date().toISOString(), count: rows.length, top1Accuracy: top1, top3Recall: top3, rows };
  await mkdir(new URL('../benchmarks/', import.meta.url), { recursive: true });
  await writeFile(new URL('../benchmarks/retrieval-evaluation.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(`\nTop-1: ${(top1 * 100).toFixed(1)}% | Top-3: ${(top3 * 100).toFixed(1)}%`);
} finally {
  await closeMilvusConnection();
}
