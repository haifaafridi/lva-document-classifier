import { getMilvusClient } from '../src/services/milvusService.js';

try {
  const client = await getMilvusClient();
  const [health, version] = await Promise.all([client.checkHealth(), client.getVersion()]);
  console.log('Milvus/Zilliz connection OK');
  console.log('Health:', health);
  console.log('Version:', version);
} catch (error) {
  console.error('Milvus/Zilliz connection failed:', error.message);
  process.exitCode = 1;
}
