import 'dotenv/config';
import path from 'node:path';

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function csvEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

export const env = Object.freeze({
  port: intEnv('PORT', 3000),
  maxFileSizeBytes: intEnv('MAX_FILE_SIZE_BYTES', 2 * 1024 * 1024),
  enableInternalRoutes: boolEnv('ENABLE_INTERNAL_ROUTES', false),

  storageMode: (process.env.STORAGE_MODE || 'local').toLowerCase(),
  localUploadDir: path.resolve(process.env.LOCAL_UPLOAD_DIR || 'storage/uploads'),
  azureConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  azureContainer: process.env.AZURE_STORAGE_CONTAINER || 'lva-documents',

  milvusAddress: process.env.MILVUS_ADDRESS || '',
  milvusToken: process.env.MILVUS_TOKEN || '',
  milvusCollection: process.env.MILVUS_COLLECTION || 'GS_Schedules_All_Localities',
  milvusVectorDim: intEnv('MILVUS_VECTOR_DIM', 384),
  milvusIndexType: (process.env.MILVUS_INDEX_TYPE || 'AUTOINDEX').toUpperCase(),
  milvusMetricType: (process.env.MILVUS_METRIC_TYPE || 'COSINE').toUpperCase(),
  milvusAllLocalityCollection: process.env.MILVUS_ALL_LOCALITY_COLLECTION || 'GS_Schedules_All_Localities',

  embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/bge-small-en-v1.5',
  embeddingDtype: process.env.EMBEDDING_DTYPE || 'q8',
  embeddingBatchSize: intEnv('EMBEDDING_BATCH_SIZE', 16),
  transformersCache: process.env.TRANSFORMERS_CACHE || '.hf-cache',

  chunkSizeTokens: intEnv('CHUNK_SIZE_TOKENS', 380),
  chunkOverlapTokens: intEnv('CHUNK_OVERLAP_TOKENS', 64),
  maxDocumentChunks: intEnv('MAX_DOCUMENT_CHUNKS', 32),
  retrievalPerChunk: intEnv('RETRIEVAL_PER_CHUNK', 20),
  retrievalCandidatePool: intEnv('RETRIEVAL_CANDIDATE_POOL', 24),
  retrievalLexicalPool: intEnv('RETRIEVAL_LEXICAL_POOL', 20),
  retrievalEvidenceUnits: intEnv('RETRIEVAL_EVIDENCE_UNITS', 18),
  retrievalEvidenceMinWords: intEnv('RETRIEVAL_EVIDENCE_MIN_WORDS', 6),
  retrievalEvidenceMaxWords: intEnv('RETRIEVAL_EVIDENCE_MAX_WORDS', 90),
  retrievalFinalK: intEnv('RETRIEVAL_FINAL_K', 3),
  retrievalSearchConcurrency: intEnv('RETRIEVAL_SEARCH_CONCURRENCY', 4),

  rerankerEnabled: boolEnv('RERANKER_ENABLED', false),
  rerankerModel: process.env.RERANKER_MODEL || 'Xenova/ms-marco-MiniLM-L-6-v2',
  rerankerDtype: process.env.RERANKER_DTYPE || 'q8',
  rerankerChunksPerCandidate: intEnv('RERANKER_CHUNKS_PER_CANDIDATE', 3),
  rerankerMaxPairs: intEnv('RERANKER_MAX_PAIRS', 72),
  classifierMaxDocumentChunks: intEnv('CLASSIFIER_MAX_DOCUMENT_CHUNKS', 8),

  ocrEnabled: boolEnv('OCR_ENABLED', true),
  ocrLanguage: process.env.OCR_LANGUAGE || 'eng',
  pdfOcrPageMinChars: intEnv('PDF_OCR_PAGE_MIN_CHARS', 40),
  pdfOcrMaxPages: intEnv('PDF_OCR_MAX_PAGES', 20),
  pdfOcrRenderScale: numberEnv('PDF_OCR_RENDER_SCALE', 2),

  classifierProvider: (process.env.CLASSIFIER_PROVIDER || 'gemini').toLowerCase(),
  classifierModel: process.env.CLASSIFIER_MODEL || 'gemini-3.5-flash-lite',
  classifierFallbackModels: csvEnv('CLASSIFIER_FALLBACK_MODELS', ['gemini-3.1-flash-lite']),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  classifierThinkingLevel: (process.env.CLASSIFIER_THINKING_LEVEL || 'minimal').toLowerCase(),

  embeddingBenchmarkModels: csvEnv('EMBEDDING_BENCHMARK_MODELS', [
    'Xenova/bge-small-en-v1.5',
    'Xenova/e5-small-v2',
    'Xenova/gte-small',
  ]),
  classifierBenchmarkModels: csvEnv('CLASSIFIER_BENCHMARK_MODELS', [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ]),
});

export function requireMilvusEnv() {
  const missing = [];
  if (!env.milvusAddress) missing.push('MILVUS_ADDRESS');
  if (!env.milvusToken) missing.push('MILVUS_TOKEN');
  if (missing.length) throw new Error(`Missing Milvus/Zilliz configuration: ${missing.join(', ')}`);
}

export function requireAzureEnv() {
  if (!env.azureConnectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is required when STORAGE_MODE=azure');
  }
}

export function requireClassifierEnv() {
  if (env.classifierProvider === 'gemini' && !env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required for final classification. Retrieval can still run without it.');
  }
  if (!['gemini', 'disabled'].includes(env.classifierProvider)) {
    throw new Error(`Unsupported CLASSIFIER_PROVIDER=${env.classifierProvider}`);
  }
}
