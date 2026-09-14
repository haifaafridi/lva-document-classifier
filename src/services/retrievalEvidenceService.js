import { cleanExtractedText } from '../utils/text.js';

const BOILERPLATE_PATTERNS = [
  /synthetic\s+(demo|test)\s+document/i,
  /no\s+real\s+(persons?|cases?|transactions?)/i,
  /does\s+not\s+require\s+ocr/i,
  /selectable\s+text/i,
  /testing\s+note\s*:/i,
];

function wordCount(text) {
  return (String(text || '').match(/[A-Za-z0-9]+/g) || []).length;
}

function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sentencePieces(text) {
  // PDF extraction can preserve hard line breaks in the middle of sentences.
  // First collapse single newlines, while retaining paragraph boundaries.
  const paragraphs = cleanExtractedText(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const pieces = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    pieces.push(...sentences);
  }
  return pieces;
}

function informativeness(text) {
  const words = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const unique = new Set(words);
  // Prefer substantive sentences, but avoid allowing very long boilerplate to dominate.
  return Math.min(40, unique.size) + Math.min(20, words.length / 4);
}

export function buildRetrievalEvidence(input, {
  maxUnits = 18,
  minWords = 6,
  maxWords = 90,
} = {}) {
  const text = cleanExtractedText(input);
  if (!text) return [];

  const seen = new Set();
  const units = [];
  for (const piece of sentencePieces(text)) {
    const count = wordCount(piece);
    if (count < minWords || count > maxWords) continue;
    if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(piece))) continue;
    const key = normalizeKey(piece);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    units.push({ text: piece, score: informativeness(piece) });
  }

  // Retain document-order coverage while still favoring informative evidence.
  if (units.length <= maxUnits) return units.map((unit, index) => ({ ...unit, index }));
  const ranked = [...units]
    .map((unit, sourceIndex) => ({ ...unit, sourceIndex }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxUnits)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
  return ranked.map((unit, index) => ({ ...unit, index }));
}

export function evidenceInfo(units) {
  return {
    count: units.length,
    units: units.map((unit) => unit.text),
  };
}
