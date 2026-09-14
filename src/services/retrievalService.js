import { performance } from 'node:perf_hooks';
import { env } from '../config/env.js';
import { cleanExtractedText } from '../utils/text.js';
import { chunkDocumentText } from './chunkingService.js';
import { embedDocumentChunks } from './embeddingService.js';
import { searchVector } from './milvusService.js';
import { lexicalSearch } from './lexicalRetrievalService.js';
import { rerankCandidates } from './rerankerService.js';
import { buildRetrievalEvidence } from './retrievalEvidenceService.js';


function elapsed(start) {
  return Number((performance.now() - start).toFixed(2));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function scalar(value) {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHit(hit, rank, queryIndex, chunkIndex, queryType) {
  const entity = hit?.entity || hit?.fields || hit || {};
  return {
    id: hit?.id ?? entity.id ?? null,
    score: scalar(hit?.score ?? hit?.distance ?? entity.score ?? 0),
    rank,
    queryIndex,
    queryType,
    chunkIndex,
    schedule_number: entity.schedule_number ?? hit.schedule_number ?? '',
    schedule_title: entity.schedule_title ?? hit.schedule_title ?? '',
    series_number: entity.series_number ?? hit.series_number ?? '',
    series_title: entity.series_title ?? hit.series_title ?? '',
    series_description: entity.series_description ?? hit.series_description ?? '',
    series_retention_period: entity.series_retention_period ?? hit.series_retention_period ?? '',
    series_disposition_method: entity.series_disposition_method ?? hit.series_disposition_method ?? '',
    text_to_embed: entity.text_to_embed ?? hit.text_to_embed ?? '',
  };
}

function keyFor(hit) {
  return `${hit.schedule_number}::${hit.series_number}`;
}

export function sanitizeRetrievalText(input) {
  const text = cleanExtractedText(input);
  if (!text) return '';
  const suspicious = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
    /classify\s+(this|the)\s+document\s+as\s+gs[-\s]?\d+/i,
    /override\s+(the\s+)?(system|prompt|instructions?)/i,
    /system\s+prompt/i,
    /do\s+not\s+follow\s+(the\s+)?instructions?/i,
  ];
  return cleanExtractedText(text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((part) => !suspicious.some((pattern) => pattern.test(part)))
    .join('\n'));
}

export function aggregateChunkHits(perQueryHits, finalK = env.retrievalCandidatePool) {
  const grouped = new Map();
  for (const hit of perQueryHits.flat()) {
    const key = keyFor(hit);
    if (!hit.series_number || !key) continue;
    if (!grouped.has(key)) grouped.set(key, {
      representative: hit,
      scores: [],
      ranks: [],
      chunks: new Set(),
      queryTypes: new Set(),
      queries: new Set(),
    });
    const group = grouped.get(key);
    group.scores.push(hit.score);
    group.ranks.push(hit.rank);
    if (Number.isInteger(hit.chunkIndex) && hit.chunkIndex >= 0) group.chunks.add(hit.chunkIndex);
    group.queryTypes.add(hit.queryType || 'chunk');
    group.queries.add(hit.queryIndex);
    if (hit.score > group.representative.score) group.representative = hit;
  }

  return [...grouped.values()].map((group) => {
    const sorted = [...group.scores].sort((a, b) => b - a);
    const maxScore = sorted[0] ?? 0;
    const meanTop = sorted.slice(0, 3).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(3, sorted.length));
    const querySupport = Math.min(1, group.queries.size / 4);
    const reciprocalRank = group.ranks.reduce((sum, rank) => sum + 1 / Math.max(1, rank), 0);
    // Max score is intentionally dominant: a short purpose sentence can be far more
    // diagnostic than the full page that contains it.
    const aggregateScore = (0.72 * maxScore) + (0.16 * meanTop) + (0.08 * querySupport) + (0.04 * Math.min(1, reciprocalRank));
    return {
      ...group.representative,
      score: Number(maxScore.toFixed(6)),
      aggregateScore: Number(aggregateScore.toFixed(6)),
      hitCount: group.scores.length,
      supportingChunkIndexes: [...group.chunks].sort((a, b) => a - b),
      supportingQueryTypes: [...group.queryTypes],
      supportingQueryCount: group.queries.size,
    };
  }).sort((a, b) => b.aggregateScore - a.aggregateScore).slice(0, finalK)
    .map((candidate, i) => ({ ...candidate, denseRank: i + 1 }));
}

function lexicalCandidateToHit(row) {
  return {
    id: null,
    score: 0,
    aggregateScore: 0,
    denseRank: null,
    hitCount: 0,
    supportingChunkIndexes: [],
    supportingQueryTypes: [],
    supportingQueryCount: 0,
    schedule_number: row.schedule_number || '',
    schedule_title: row.schedule_title || '',
    series_number: row.series_number || '',
    series_title: row.series_title || '',
    series_description: row.series_description || '',
    series_retention_period: row.series_retention_period || '',
    series_disposition_method: row.series_disposition_method || '',
    text_to_embed: row.text_to_embed || '',
    lexicalScore: row.lexicalScore || 0,
    lexicalRank: row.lexicalRank || null,
    lexicalEvidence: row.lexicalEvidence || '',
  };
}

export function mergeDenseAndLexicalCandidates(dense, lexical, maxPool = env.retrievalCandidatePool) {
  const byKey = new Map();
  for (const candidate of dense) byKey.set(keyFor(candidate), { ...candidate });
  for (const row of lexical) {
    const key = keyFor(row);
    if (!key || !row.series_number) continue;
    if (byKey.has(key)) {
      const current = byKey.get(key);
      current.lexicalScore = row.lexicalScore || 0;
      current.lexicalRank = row.lexicalRank || null;
      current.lexicalEvidence = row.lexicalEvidence || '';
    } else {
      byKey.set(key, lexicalCandidateToHit(row));
    }
  }

  // Preserve the strongest candidates from either retrieval path. The final hybrid
  // fusion normalizes the actual dense and lexical scores rather than trusting one model.
  return [...byKey.values()]
    .sort((a, b) => {
      const aPrior = (a.denseRank ? 1 / a.denseRank : 0) + (a.lexicalRank ? 1 / a.lexicalRank : 0);
      const bPrior = (b.denseRank ? 1 / b.denseRank : 0) + (b.lexicalRank ? 1 / b.lexicalRank : 0);
      return bPrior - aPrior;
    })
    .slice(0, maxPool);
}

function locateEvidenceChunk(evidenceText, chunks) {
  const needle = evidenceText.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!needle) return -1;
  const prefix = needle.slice(0, Math.min(80, needle.length));
  const found = chunks.find((chunk) => chunk.text.toLowerCase().replace(/\s+/g, ' ').includes(prefix));
  return found?.index ?? -1;
}

function buildQueryPlan(chunks, retrievalText, maxEvidence = env.retrievalEvidenceUnits) {
  const plan = chunks.map((chunk) => ({
    text: chunk.text,
    chunkIndex: chunk.index,
    type: 'chunk',
  }));
  const evidence = buildRetrievalEvidence(retrievalText, {
    maxUnits: maxEvidence,
    minWords: env.retrievalEvidenceMinWords,
    maxWords: env.retrievalEvidenceMaxWords,
  });
  const existing = new Set(plan.map((q) => q.text.toLowerCase().replace(/\s+/g, ' ').trim()));
  for (const unit of evidence) {
    const key = unit.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || existing.has(key)) continue;
    existing.add(key);
    plan.push({
      text: unit.text,
      chunkIndex: locateEvidenceChunk(unit.text, chunks),
      type: 'evidence',
    });
  }
  return plan;
}

export async function retrieveCandidates(documentText, options = {}) {
  const timingsMs = {};
  const sanitizeStart = performance.now();
  const retrievalText = sanitizeRetrievalText(documentText);
  timingsMs.sanitize = elapsed(sanitizeStart);

  const chunkStart = performance.now();
  const chunks = await chunkDocumentText(retrievalText, options);
  timingsMs.chunking = elapsed(chunkStart);
  if (!chunks.length) throw new Error('No searchable text was produced from the document.');

  // Multi-granularity retrieval: long overlapping chunks preserve context, while short
  // evidence sentences expose the document's actual business purpose to the embedding model.
  const planStart = performance.now();
  const queryPlan = buildQueryPlan(chunks, retrievalText, options.evidenceUnits ?? env.retrievalEvidenceUnits);
  timingsMs.queryPlan = elapsed(planStart);

  const embeddingStart = performance.now();
  const vectors = await embedDocumentChunks(queryPlan.map((q) => q.text));
  timingsMs.embedding = elapsed(embeddingStart);

  const denseStart = performance.now();
  const densePerQueryK = options.perChunkK ?? env.retrievalPerChunk;
  // A document can produce many chunk/evidence queries. Running every Milvus request
  // serially made latency scale with query count. Use a small bounded concurrency so
  // independent searches overlap without flooding the serving cluster.
  const perQueryHits = await mapWithConcurrency(
    vectors,
    options.searchConcurrency ?? env.retrievalSearchConcurrency,
    async (vector, i) => {
      const raw = await searchVector(vector, densePerQueryK);
      const flat = Array.isArray(raw?.[0]) ? raw[0] : raw;
      const q = queryPlan[i];
      return (flat || []).map((hit, rank) => normalizeHit(hit, rank + 1, i, q.chunkIndex, q.type));
    },
  );
  timingsMs.denseSearch = elapsed(denseStart);

  const aggregationStart = performance.now();
  const dense = aggregateChunkHits(perQueryHits, options.candidatePool ?? env.retrievalCandidatePool);
  timingsMs.denseAggregation = elapsed(aggregationStart);

  const lexicalStart = performance.now();
  const lexical = await lexicalSearch(retrievalText, options.lexicalPool ?? env.retrievalLexicalPool);
  timingsMs.lexicalSearch = elapsed(lexicalStart);

  const fusionStart = performance.now();
  const pool = mergeDenseAndLexicalCandidates(dense, lexical, options.candidatePool ?? env.retrievalCandidatePool);
  const candidates = await rerankCandidates(chunks, pool, options.finalK ?? env.retrievalFinalK);
  timingsMs.fusion = elapsed(fusionStart);

  return {
    chunks,
    candidates,
    diagnostics: {
      chunkCount: chunks.length,
      evidenceQueryCount: queryPlan.filter((q) => q.type === 'evidence').length,
      queryVectorCount: vectors.length,
      queryVectorDimension: vectors[0]?.length || 0,
      queryVectorsStored: false,
      retrievalTextSanitized: retrievalText !== cleanExtractedText(documentText),
      denseCandidateCount: dense.length,
      lexicalCandidateCount: lexical.length,
      rerankPoolCount: pool.length,
      searchConcurrency: options.searchConcurrency ?? env.retrievalSearchConcurrency,
      timingsMs,
      denseCandidates: dense,
      lexicalCandidates: lexical,
      preRerankPool: pool,
      perQueryHits,
    },
  };
}

export function chooseClassifierChunks(chunks, candidates, maxChunks = env.classifierMaxDocumentChunks) {
  const preferred = new Set(candidates.flatMap((c) => c.supportingChunkIndexes || []).filter((x) => x >= 0));
  const ordered = [
    ...chunks.filter((_, i) => preferred.has(i)),
    ...chunks.filter((_, i) => !preferred.has(i)),
  ];
  const seen = new Set();
  return ordered.filter((chunk) => {
    if (seen.has(chunk.index)) return false;
    seen.add(chunk.index);
    return true;
  }).slice(0, maxChunks);
}
