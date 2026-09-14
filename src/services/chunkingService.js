import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getTokenizerFor, modelProfile } from './embeddingService.js';
import { cleanExtractedText } from '../utils/text.js';

function uniqueChunks(chunks) {
  const seen = new Set();
  return chunks.filter((chunk) => {
    const normalized = chunk.text.toLowerCase().replace(/\s+/g, ' ').trim();
    const hash = crypto.createHash('sha1').update(normalized).digest('hex');
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}

function coverageSelect(chunks, maxChunks) {
  if (chunks.length <= maxChunks) return chunks;
  const selected = new Set([0, 1, chunks.length - 2, chunks.length - 1].filter((i) => i >= 0 && i < chunks.length));
  const remaining = Math.max(0, maxChunks - selected.size);
  for (let i = 1; i <= remaining; i += 1) {
    const idx = Math.round((i * (chunks.length - 1)) / (remaining + 1));
    selected.add(idx);
  }
  return [...selected].sort((a, b) => a - b).slice(0, maxChunks).map((idx) => chunks[idx]);
}

export async function chunkDocumentText(input, options = {}) {
  const text = cleanExtractedText(input);
  if (!text) return [];

  const model = options.model || env.embeddingModel;
  const tokenizer = await getTokenizerFor(model);
  const profile = modelProfile(model);
  const prefixTokens = tokenizer.encode(profile.queryPrefix || '', { add_special_tokens: false }).length;
  const hardMaximum = Math.max(32, profile.maxTokens - prefixTokens - 4);
  const chunkSize = Math.min(options.chunkSizeTokens ?? env.chunkSizeTokens, hardMaximum);
  const overlap = Math.min(options.overlapTokens ?? env.chunkOverlapTokens, Math.max(0, chunkSize - 32));
  const maxChunks = options.maxChunks ?? env.maxDocumentChunks;

  if (overlap >= chunkSize) throw new Error('Chunk overlap must be smaller than chunk size.');
  const tokenIds = tokenizer.encode(text, { add_special_tokens: false });
  if (!Array.isArray(tokenIds) || tokenIds.length === 0) return [];

  const stride = Math.max(1, chunkSize - overlap);
  const chunks = [];
  for (let start = 0, index = 0; start < tokenIds.length; start += stride, index += 1) {
    const end = Math.min(start + chunkSize, tokenIds.length);
    const ids = tokenIds.slice(start, end);
    const decoded = cleanExtractedText(tokenizer.decode(ids, {
      skip_special_tokens: true,
      clean_up_tokenization_spaces: true,
    }));
    if (decoded) chunks.push({ index, tokenStart: start, tokenEnd: end, tokenCount: ids.length, text: decoded });
    if (end >= tokenIds.length) break;
  }

  const deduped = uniqueChunks(chunks);
  const selected = coverageSelect(deduped, maxChunks);
  return selected.map((chunk, selectedIndex) => ({ ...chunk, selectedIndex }));
}

export async function chunkingInfo(text, options = {}) {
  const model = options.model || env.embeddingModel;
  const tokenizer = await getTokenizerFor(model);
  const profile = modelProfile(model);
  const tokenCount = tokenizer.encode(cleanExtractedText(text), { add_special_tokens: false }).length;
  const chunks = await chunkDocumentText(text, options);
  return {
    model,
    modelMaxTokens: profile.maxTokens,
    inputTokens: tokenCount,
    chunkSizeTokens: options.chunkSizeTokens ?? env.chunkSizeTokens,
    overlapTokens: options.overlapTokens ?? env.chunkOverlapTokens,
    maxDocumentChunks: options.maxChunks ?? env.maxDocumentChunks,
    producedChunks: chunks.length,
    chunks: chunks.map(({ index, tokenStart, tokenEnd, tokenCount }) => ({ index, tokenStart, tokenEnd, tokenCount })),
  };
}
