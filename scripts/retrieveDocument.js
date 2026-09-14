import fs from 'node:fs/promises';
import path from 'node:path';
import { extractTextFromDocument } from '../src/services/extraction/index.js';
import { embedDocument } from '../src/services/embeddingService.js';
import { searchVector } from '../src/services/milvusService.js';

const filePath = process.argv.slice(2).join(' ').trim();
if (!filePath) {
  console.error('Usage: npm run milvus:search-doc -- "C:\\path\\to\\sample.pdf"');
  process.exit(1);
}

try {
  const buffer = await fs.readFile(filePath);
  const originalName = path.basename(filePath);
  const text = await extractTextFromDocument({ buffer, originalName, mimetype: '' });
  if (!text) throw new Error('No extractable text found in document.');

  const vector = await embedDocument(text);
  const matches = await searchVector(vector, 3);

  console.log(`Document: ${originalName}`);
  console.log(`Extracted characters: ${text.length}`);
  console.log(`Transient embedding: ${vector.length} dimensions; stored = NO`);
  console.log('\nTop 3 Milvus semantic matches:\n');
  for (const [i, hit] of matches.entries()) {
    console.log(`${i + 1}. ${hit.schedule_number} / ${hit.series_number} - ${hit.series_title}`);
    console.log(`   score: ${hit.score}`);
    console.log(`   retention: ${hit.series_retention_period || '(none)'}`);
    console.log(`   disposition: ${hit.series_disposition_method}`);
  }
  console.log('\nNo classification model was called.');
} catch (error) {
  console.error('Document retrieval failed:', error.message || error);
  process.exitCode = 1;
}
