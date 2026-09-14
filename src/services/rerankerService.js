import path from 'node:path';
import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  env as hfEnv,
} from '@huggingface/transformers';
import { env } from '../config/env.js';
import { buildRetrievalEvidence } from './retrievalEvidenceService.js';
import { lexicalTokens } from './lexicalRetrievalService.js';

hfEnv.cacheDir = path.resolve(env.transformersCache);
hfEnv.allowRemoteModels = true;

const modelPromises = new Map();
const tokenizerPromises = new Map();

async function getModel() {
  const key = `${env.rerankerModel}::${env.rerankerDtype}`;
  if (!modelPromises.has(key)) {
    modelPromises.set(key, AutoModelForSequenceClassification.from_pretrained(
      env.rerankerModel,
      { dtype: env.rerankerDtype },
    ));
  }
  return modelPromises.get(key);
}

async function getTokenizer() {
  if (!tokenizerPromises.has(env.rerankerModel)) {
    tokenizerPromises.set(env.rerankerModel, AutoTokenizer.from_pretrained(env.rerankerModel));
  }
  return tokenizerPromises.get(env.rerankerModel);
}

function numbersFromOutput(output) {
  const tensor = output?.logits ?? output;
  let values;
  if (typeof tensor?.tolist === 'function') values = tensor.tolist();
  else if (tensor?.data) values = Array.from(tensor.data);
  else if (Array.isArray(tensor)) values = tensor;
  else throw new Error('Unexpected reranker model output.');

  if (!Array.isArray(values)) throw new Error('Unexpected reranker score format.');
  if (Array.isArray(values[0])) return values.map((row) => Number(row[0]));
  return values.map(Number);
}

function candidatePassage(candidate) {
  return [
    candidate.series_title ? `Record series: ${candidate.series_title}.` : '',
    candidate.series_description ? `Definition: ${candidate.series_description}` : '',
  ].filter(Boolean).join(' ');
}

function minMax(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return values.map(() => 0);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 1e-9) return values.map((v) => (Number.isFinite(v) ? 1 : 0));
  return values.map((v) => (Number.isFinite(v) ? (v - min) / (max - min) : 0));
}

export function hybridFuse(candidates) {
  const denseNorm = minMax(candidates.map((c) => Number(c.aggregateScore ?? c.score ?? Number.NaN)));
  const lexicalNorm = minMax(candidates.map((c) => Number(c.lexicalScore ?? Number.NaN)));
  return candidates
    .map((candidate, i) => {
      const denseRankPrior = candidate.denseRank ? 1 / (10 + candidate.denseRank) : 0;
      const lexicalRankPrior = candidate.lexicalRank ? 1 / (10 + candidate.lexicalRank) : 0;
      const agreement = candidate.denseRank && candidate.lexicalRank ? 1 : 0;
      const hybridScore = (
        (0.48 * denseNorm[i])
        + (0.42 * lexicalNorm[i])
        + (0.06 * agreement)
        + (0.02 * denseRankPrior * 11)
        + (0.02 * lexicalRankPrior * 11)
      );
      return {
        ...candidate,
        denseNormalized: Number(denseNorm[i].toFixed(6)),
        lexicalNormalized: Number(lexicalNorm[i].toFixed(6)),
        hybridScore: Number(hybridScore.toFixed(6)),
      };
    })
    .sort((a, b) => b.hybridScore - a.hybridScore);
}

function overlapScore(query, passage) {
  const q = new Set(lexicalTokens(query));
  const p = new Set(lexicalTokens(passage));
  if (!q.size || !p.size) return 0;
  let overlap = 0;
  for (const token of q) if (p.has(token)) overlap += 1;
  return overlap / Math.sqrt(q.size * p.size);
}

function candidateEvidence(documentChunks, candidate, limit) {
  const passage = candidatePassage(candidate);
  const evidence = buildRetrievalEvidence(documentChunks.map((c) => c.text).join('\n\n'), {
    maxUnits: Math.max(12, limit * 4),
    minWords: 6,
    maxWords: 90,
  });
  const ranked = evidence
    .map((unit) => ({ text: unit.text, overlap: overlapScore(unit.text, passage) }))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((x) => x.text);
  if (ranked.length) return ranked;
  return documentChunks.slice(0, limit).map((chunk) => chunk.text);
}

export async function rerankCandidates(documentChunks, candidates, finalK = 3) {
  if (!candidates.length) return [];

  // Dense + lexical hybrid fusion is the safe production default. The optional
  // cross-encoder is kept for benchmarking because it must prove an accuracy gain
  // on this LVA dataset before it is allowed to replace the deterministic fusion.
  const fused = hybridFuse(candidates);
  if (!env.rerankerEnabled) return fused.slice(0, finalK);

  try {
    const model = await getModel();
    const tokenizer = await getTokenizer();
    const queries = [];
    const passages = [];
    const owners = [];

    for (let candidateIndex = 0; candidateIndex < fused.length; candidateIndex += 1) {
      const candidate = fused[candidateIndex];
      const selected = candidateEvidence(documentChunks, candidate, env.rerankerChunksPerCandidate);
      for (const evidence of selected) {
        if (queries.length >= env.rerankerMaxPairs) break;
        queries.push(evidence);
        passages.push(candidatePassage(candidate));
        owners.push(candidateIndex);
      }
      if (queries.length >= env.rerankerMaxPairs) break;
    }

    if (!queries.length) return fused.slice(0, finalK);
    const features = tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
    });
    const output = await model(features);
    const scores = numbersFromOutput(output);
    const grouped = fused.map(() => []);
    scores.forEach((score, i) => grouped[owners[i]]?.push(score));

    const cross = fused
      .map((candidate, i) => {
        const sorted = [...grouped[i]].sort((a, b) => b - a);
        const max = sorted[0] ?? Number.NEGATIVE_INFINITY;
        const meanTop2 = sorted.slice(0, 2).reduce((sum, x) => sum + x, 0) / Math.max(1, Math.min(2, sorted.length));
        const rerankerScore = Number((0.75 * max + 0.25 * meanTop2).toFixed(6));
        return { ...candidate, rerankerScore };
      });
    const crossNorm = minMax(cross.map((c) => c.rerankerScore));
    return cross
      .map((candidate, i) => ({
        ...candidate,
        finalRetrievalScore: Number(((0.70 * crossNorm[i]) + (0.30 * candidate.hybridScore)).toFixed(6)),
      }))
      .sort((a, b) => b.finalRetrievalScore - a.finalRetrievalScore)
      .slice(0, finalK);
  } catch (error) {
    console.warn(`[Retrieval] Optional reranker unavailable; using validated dense+lexical fusion: ${error.message}`);
    return fused.slice(0, finalK);
  }
}

export function rerankerInfo() {
  return {
    enabled: env.rerankerEnabled,
    model: env.rerankerModel,
    dtype: env.rerankerDtype,
    purpose: 'optional retrieval reranking only; final LVA classification is still performed by Gemini',
  };
}
