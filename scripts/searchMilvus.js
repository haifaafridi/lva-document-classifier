import { embedDocument } from '../src/services/embeddingService.js';
import { searchVector } from '../src/services/milvusService.js';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: npm run milvus:search -- "invoice and receipt for payment to a vendor"');
  process.exit(1);
}

try {
  const vector = await embedDocument(query);
  const hits = await searchVector(vector, 3);
  console.log(`Transient query embedding dimension: ${vector.length} (NOT stored)\n`);
  console.log(`Top 3 semantic-retrieval matches for: ${query}\n`);
  hits.forEach((hit, i) => {
    console.log(`${i + 1}. ${hit.schedule_number} / ${hit.series_number} - ${hit.series_title}`);
    console.log(`   score: ${hit.score}`);
    console.log(`   retention: ${hit.series_retention_period || '(none; see disposition)'}`);
    console.log(`   disposition: ${hit.series_disposition_method}`);
    console.log();
  });
  console.log('Retrieval only: no classification model was called and the query vector was not persisted.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
