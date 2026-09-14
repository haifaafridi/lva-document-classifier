import path from 'node:path';
import { AutoTokenizer, pipeline, env as hfEnv } from '@huggingface/transformers';

const model = process.env.EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5';
const dtype = process.env.EMBEDDING_DTYPE || 'q8';
const cacheDir = path.resolve(process.env.TRANSFORMERS_CACHE || '.hf-cache');

hfEnv.cacheDir = cacheDir;
hfEnv.allowRemoteModels = true;

console.log(`[Docker build] Prefetching embedding model ${model} (${dtype}) into ${cacheDir}`);
await AutoTokenizer.from_pretrained(model);
const extractor = await pipeline('feature-extraction', model, { dtype });
await extractor(['records management deployment warmup'], {
  pooling: 'mean',
  normalize: true,
  truncation: true,
});
console.log('[Docker build] Embedding model cache ready.');
