import util from 'node:util';
import { getCollectionStatus } from '../src/services/milvusService.js';
import { embeddingInfo } from '../src/services/embeddingService.js';

try {
  console.log('Embedding:', embeddingInfo());
  console.log(util.inspect(await getCollectionStatus(), { depth: 6, colors: true }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
