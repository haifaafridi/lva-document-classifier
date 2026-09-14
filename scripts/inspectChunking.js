import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractDocument } from '../src/services/extraction/index.js';
import { chunkingInfo, chunkDocumentText } from '../src/services/chunkingService.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run chunk:inspect -- "path/to/document.pdf"');
  process.exit(1);
}
const buffer = await readFile(filePath);
const extraction = await extractDocument({ buffer, originalName: path.basename(filePath), mimetype: '' });
const info = await chunkingInfo(extraction.text);
const chunks = await chunkDocumentText(extraction.text);
console.log(JSON.stringify({ extraction: { method: extraction.method, ocrUsed: extraction.ocrUsed, textCharacters: extraction.text.length }, ...info }, null, 2));
console.log('\nChunk previews:');
for (const chunk of chunks.slice(0, 5)) console.log(`\n#${chunk.selectedIndex + 1} (${chunk.tokenCount} tokens)\n${chunk.text.slice(0, 280)}${chunk.text.length > 280 ? '…' : ''}`);
