import { createRequire } from 'node:module';
import { cleanExtractedText } from '../../utils/text.js';

const require = createRequire(import.meta.url);
const WordExtractor = require('word-extractor');
const extractor = new WordExtractor();

export async function extractDoc(buffer) {
  const doc = await extractor.extract(buffer);
  const parts = [doc.getBody?.(), doc.getHeaders?.(), doc.getFootnotes?.(), doc.getEndnotes?.()]
    .filter(Boolean);
  return {
    text: cleanExtractedText(parts.join('\n\n')),
    method: 'legacy-word-text',
    ocrUsed: false,
  };
}
