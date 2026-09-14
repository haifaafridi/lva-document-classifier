import path from 'node:path';
import { pipeline, AutoTokenizer, env as hfEnv } from '@huggingface/transformers';
import { env } from '../config/env.js';

hfEnv.cacheDir = path.resolve(env.transformersCache);
hfEnv.allowRemoteModels = true;

const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const extractorPromises = new Map();
const tokenizerPromises = new Map();

export const MODEL_PROFILES = Object.freeze({
  'Xenova/bge-small-en-v1.5': {
    dimension: 384,
    maxTokens: 512,
    queryPrefix: QUERY_PREFIX,
    passagePrefix: '',
  },
  'Xenova/e5-small-v2': {
    dimension: 384,
    maxTokens: 512,
    queryPrefix: 'query: ',
    passagePrefix: 'passage: ',
  },
  'Xenova/gte-small': {
    dimension: 384,
    maxTokens: 512,
    queryPrefix: '',
    passagePrefix: '',
  },
});

export function modelProfile(model = env.embeddingModel) {
  return MODEL_PROFILES[model] || {
    dimension: env.milvusVectorDim,
    maxTokens: 512,
    queryPrefix: '',
    passagePrefix: '',
  };
}

async function getExtractorFor(model, dtype = env.embeddingDtype) {
  const key = `${model}::${dtype}`;
  if (!extractorPromises.has(key)) {
    extractorPromises.set(key, pipeline('feature-extraction', model, { dtype }));
  }
  return extractorPromises.get(key);
}

export async function getTokenizerFor(model = env.embeddingModel) {
  if (!tokenizerPromises.has(model)) {
    tokenizerPromises.set(model, AutoTokenizer.from_pretrained(model));
  }
  return tokenizerPromises.get(model);
}

export async function embedWithModel(texts, {
  model = env.embeddingModel,
  dtype = env.embeddingDtype,
  mode = 'passage',
  validateDimension = false,
} = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const profile = modelProfile(model);
  const prefix = mode === 'query' ? profile.queryPrefix : profile.passagePrefix;
  const cleaned = texts.map((text) => `${prefix}${String(text ?? '').trim()}`);
  if (cleaned.some((text) => !text.trim())) throw new Error('Cannot embed empty text.');

  const extractor = await getExtractorFor(model, dtype);
  const output = await extractor(cleaned, {
    pooling: 'mean',
    normalize: true,
    truncation: true,
  });
  const vectors = output.tolist();
  const rows = Array.isArray(vectors[0]) ? vectors : [vectors];

  if (validateDimension) {
    for (const vector of rows) {
      if (vector.length !== env.milvusVectorDim) {
        throw new Error(`Embedding dimension ${vector.length} does not match MILVUS_VECTOR_DIM=${env.milvusVectorDim}`);
      }
    }
  }
  return rows;
}

// Permanent knowledge-base embeddings. For BGE, no query instruction is added.
export async function embedTexts(texts) {
  return embedWithModel(texts, { mode: 'passage', validateDimension: true });
}

// User document/chunk embeddings are search queries and are never persisted.
export async function embedDocument(text) {
  const [vector] = await embedWithModel([text], { mode: 'query', validateDimension: true });
  return vector;
}

export async function embedDocumentChunks(chunks) {
  return embedWithModel(chunks, { mode: 'query', validateDimension: true });
}

export async function embedQuery(text) {
  return embedDocument(text);
}

export function embeddingInfo() {
  const profile = modelProfile();
  return {
    model: env.embeddingModel,
    dtype: env.embeddingDtype,
    dimension: env.milvusVectorDim,
    maxTokens: profile.maxTokens,
    queryPrefix: profile.queryPrefix,
    pooling: 'mean',
    normalize: true,
    runtimeDocumentEmbeddingsStored: false,
  };
}

// Preload the tokenizer + embedding pipeline and execute one tiny inference so the
// first real document does not pay model initialization cost. The returned vector
// can also be used to warm the Milvus search path.
export async function warmEmbeddingModel() {
  await getTokenizerFor(env.embeddingModel);
  const [vector] = await embedWithModel(
    ['records management document classification'],
    { mode: 'query', validateDimension: true },
  );
  return vector;
}
