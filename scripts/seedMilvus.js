import { loadScheduleData } from './loadScheduleData.js';
import { embedTexts, embeddingInfo } from '../src/services/embeddingService.js';
import {
  ensureCollection, insertKnowledgeRecords, flushAndLoad, getCollectionStatus,
} from '../src/services/milvusService.js';
import { env } from '../src/config/env.js';

const rows = await loadScheduleData();
const scheduleCount = new Set(rows.map((row) => row.schedule_number)).size;
if (env.milvusCollection === env.milvusAllLocalityCollection && scheduleCount < 20) {
  throw new Error(
    `Refusing to seed ${env.milvusCollection} from an incomplete local dataset (${scheduleCount} schedules / ${rows.length} rows). ` +
    'Run npm run lva:sync first, or npm run lva:sync-and-seed for a new cloud collection.'
  );
}
console.log('=== LVA knowledge-base one-time seed ===');
console.log(`Collection: ${env.milvusCollection}`);
console.log('Embedding:', embeddingInfo());
console.log(`Schedule records: ${rows.length}`);
console.log('Source records intentionally contain NO primary-key id; Milvus AutoID creates it.');

try {
  const collection = await ensureCollection();
  console.log(collection.created ? 'AutoID collection created.' : 'AutoID collection already exists.');

  const before = await getCollectionStatus();
  const existingRows = Number.parseInt(String(before.rowCount ?? '0'), 10) || 0;
  if (existingRows > 0) {
    throw new Error(
      `Refusing to insert: ${env.milvusCollection} already contains ${existingRows} rows. ` +
      'The knowledge base is seed-once; runtime operation is query-only.'
    );
  }

  for (let start = 0; start < rows.length; start += env.embeddingBatchSize) {
    const batch = rows.slice(start, start + env.embeddingBatchSize);
    const vectors = await embedTexts(batch.map((r) => r.text_to_embed));
    const payload = batch.map((r, i) => ({ ...r, vector: vectors[i] }));
    // No id property here. Milvus generates the INT64 primary key automatically.
    await insertKnowledgeRecords(payload);
    console.log(`Embedded + inserted ${Math.min(start + batch.length, rows.length)}/${rows.length}`);
  }

  console.log('Flushing, creating/verifying vector index, and loading collection...');
  await flushAndLoad();
  const status = await getCollectionStatus();
  console.log('Knowledge-base seed complete. Do not run this command again for normal runtime use.');
  console.log(`Reported row count: ${status.rowCount ?? 'see Zilliz console / npm run milvus:status'}`);
  console.log('Index:', status.indexes);
} catch (error) {
  console.error('Seed failed:', error.message || error);
  process.exitCode = 1;
}
