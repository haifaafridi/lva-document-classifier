import { readFile } from 'node:fs/promises';
import { buildRetrievalEvidence } from './retrievalEvidenceService.js';

const STOP_WORDS = new Set(`
  a an and are as at be been being by for from had has have he her hers him his i if in into is it its
  me my of on or our ours she that the their theirs them they this to was were will with you your yours
  may include includes including but limited series documents document records record file files
`.trim().split(/\s+/));

let indexPromise;

function normalizeToken(token) {
  let t = token.toLowerCase();
  if (t.endsWith('ies') && t.length > 4) t = `${t.slice(0, -3)}y`;
  else if (t.endsWith('s') && t.length > 4 && !t.endsWith('ss')) t = t.slice(0, -1);
  return t;
}

export function lexicalTokens(text) {
  return (String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function termCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

async function buildIndex() {
  const rows = JSON.parse(await readFile(new URL('../../data/lva_schedules.json', import.meta.url), 'utf8'));
  const docs = rows.map((row) => {
    const titleTokens = lexicalTokens(row.series_title || '');
    const descriptionTokens = lexicalTokens(row.series_description || '');
    // Title gets a moderate boost, but the official description remains the main evidence.
    const tokens = [...titleTokens, ...titleTokens, ...descriptionTokens];
    return { row, tokens, tf: termCounts(tokens), length: Math.max(1, tokens.length) };
  });
  const df = new Map();
  for (const doc of docs) {
    for (const token of new Set(doc.tokens)) df.set(token, (df.get(token) || 0) + 1);
  }
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  return { docs, df, avgLength, count: docs.length };
}

async function getIndex() {
  indexPromise ||= buildIndex();
  return indexPromise;
}

export function resetLexicalIndexForTests() {
  indexPromise = undefined;
}

function bm25Score(queryTokens, doc, index) {
  const k1 = 1.2;
  const b = 0.75;
  const queryTf = termCounts(queryTokens);
  let score = 0;
  for (const token of new Set(queryTokens)) {
    const frequency = doc.tf.get(token) || 0;
    if (!frequency) continue;
    const containingDocs = index.df.get(token) || 0;
    // Cap extreme IDF so one accidental rare word cannot dominate the business purpose.
    const idf = Math.min(4.5, Math.log(1 + ((index.count - containingDocs + 0.5) / (containingDocs + 0.5))));
    const denom = frequency + k1 * (1 - b + (b * doc.length / Math.max(1, index.avgLength)));
    const qtfWeight = 1 + Math.log(Math.max(1, queryTf.get(token) || 1));
    score += idf * ((frequency * (k1 + 1)) / denom) * qtfWeight;
  }
  return score;
}

export async function lexicalSearch(documentText, limit = 20) {
  const wholeTokens = lexicalTokens(documentText);
  if (!wholeTokens.length || limit <= 0) return [];
  const index = await getIndex();
  const evidence = buildRetrievalEvidence(documentText, { maxUnits: 20, minWords: 6, maxWords: 90 });
  const evidenceTokens = evidence.map((unit) => ({ text: unit.text, tokens: lexicalTokens(unit.text) })).filter((x) => x.tokens.length);

  const ranked = index.docs
    .map((doc) => {
      const whole = bm25Score(wholeTokens, doc, index);
      const sentenceScores = evidenceTokens
        .map((unit) => ({ text: unit.text, score: bm25Score(unit.tokens, doc, index) }))
        .sort((a, b) => b.score - a.score);
      const best = sentenceScores[0]?.score || 0;
      const second = sentenceScores[1]?.score || 0;
      // Sentence-level evidence reduces dilution from headers, metadata and unrelated sections.
      const lexicalScore = (0.25 * whole) + (0.60 * best) + (0.15 * second);
      return {
        row: doc.row,
        lexicalScore,
        lexicalEvidence: sentenceScores[0]?.text || '',
      };
    })
    .filter((item) => item.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore)
    .slice(0, limit);

  return ranked.map((item, i) => ({
    ...item.row,
    lexicalScore: Number(item.lexicalScore.toFixed(6)),
    lexicalRank: i + 1,
    lexicalEvidence: item.lexicalEvidence,
  }));
}
