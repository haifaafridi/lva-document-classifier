import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType,
} from '@zilliz/milvus2-sdk-node';
import { env, requireMilvusEnv } from '../config/env.js';

let clientPromise;

export async function closeMilvusConnection() {
  if (!clientPromise) return;
  try {
    const client = await clientPromise;
    await client.closeConnection();
  } finally {
    clientPromise = undefined;
  }
}

export async function getMilvusClient() {
  requireMilvusEnv();
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new MilvusClient({
        address: env.milvusAddress,
        token: env.milvusToken,
      });
      await client.connectPromise;
      return client;
    })();
  }
  return clientPromise;
}

function metricType() {
  const map = { COSINE: MetricType.COSINE, L2: MetricType.L2, IP: MetricType.IP };
  const result = map[env.milvusMetricType];
  if (result === undefined) throw new Error(`Unsupported MILVUS_METRIC_TYPE=${env.milvusMetricType}`);
  return result;
}

function indexType() {
  const name = env.milvusIndexType;
  return IndexType?.[name] ?? name;
}

// IMPORTANT: the source JSON intentionally has no id property.
// Milvus still requires one primary field, so the collection schema keeps an
// INT64 id field with AutoID enabled. Milvus generates that value on insert.
export function expectedSchema() {
  return [
    { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
    { name: 'vector', data_type: DataType.FloatVector, dim: env.milvusVectorDim },
    { name: 'schedule_number', data_type: DataType.VarChar, max_length: 64 },
    { name: 'schedule_title', data_type: DataType.VarChar, max_length: 256 },
    { name: 'series_number', data_type: DataType.VarChar, max_length: 64 },
    { name: 'series_title', data_type: DataType.VarChar, max_length: 512 },
    { name: 'series_description', data_type: DataType.VarChar, max_length: 8192 },
    { name: 'series_retention_period', data_type: DataType.VarChar, max_length: 1024 },
    { name: 'series_disposition_method', data_type: DataType.VarChar, max_length: 512 },
    { name: 'text_to_embed', data_type: DataType.VarChar, max_length: 8192 },
  ];
}

function autoIdEnabled(field) {
  return field?.autoID === true || field?.auto_id === true || field?.autoID === 'true' || field?.auto_id === 'true';
}

export async function ensureCollection() {
  const client = await getMilvusClient();
  const has = await client.hasCollection({ collection_name: env.milvusCollection });
  if (has.value) {
    const description = await client.describeCollection({ collection_name: env.milvusCollection });
    const fields = description?.schema?.fields ?? description?.fields ?? [];
    const primary = fields.find((f) => f.is_primary_key === true || f.is_primary_key === 'true');
    if (!primary || primary.name !== 'id' || !autoIdEnabled(primary)) {
      throw new Error(
        `Collection ${env.milvusCollection} already exists but does not use the required AutoID primary key. ` +
        'Choose a new empty MILVUS_COLLECTION name before seeding; an existing primary-key schema cannot be converted in place.'
      );
    }
    return { created: false };
  }

  await client.createCollection({
    collection_name: env.milvusCollection,
    fields: expectedSchema(),
    enable_dynamic_field: false,
  });
  return { created: true };
}

export async function ensureVectorIndex() {
  const client = await getMilvusClient();
  const indexes = await client.listIndexes({ collection_name: env.milvusCollection });
  const names = indexes?.index_names || indexes?.data || [];
  if (Array.isArray(names) && names.length > 0) return { created: false, indexes: names };

  const req = {
    collection_name: env.milvusCollection,
    field_name: 'vector',
    index_name: 'vector_idx',
    index_type: indexType(),
    metric_type: metricType(),
  };
  if (env.milvusIndexType === 'HNSW') req.params = { M: 16, efConstruction: 200 };
  if (env.milvusIndexType === 'IVF_FLAT') req.params = { nlist: 128 };
  await client.createIndex(req);
  return { created: true };
}

// This is ONLY for one-time knowledge-base loading. Runtime user-document
// embeddings are never inserted into Milvus.
export async function insertKnowledgeRecords(records) {
  const client = await getMilvusClient();
  return client.insert({ collection_name: env.milvusCollection, data: records });
}

export async function flushAndLoad() {
  const client = await getMilvusClient();
  await client.flushSync({ collection_names: [env.milvusCollection] });
  await ensureVectorIndex();
  await client.loadCollection({ collection_name: env.milvusCollection });
}

export async function getCollectionStatus() {
  const client = await getMilvusClient();
  const exists = await client.hasCollection({ collection_name: env.milvusCollection });
  if (!exists.value) return { exists: false, collection: env.milvusCollection };
  const [description, stats, indexes, loadState] = await Promise.all([
    client.describeCollection({ collection_name: env.milvusCollection }),
    client.getCollectionStatistics({ collection_name: env.milvusCollection }),
    client.listIndexes({ collection_name: env.milvusCollection }),
    client.getLoadState({ collection_name: env.milvusCollection }),
  ]);
  return {
    exists: true,
    collection: env.milvusCollection,
    rowCount: stats?.data?.row_count ?? stats?.stats?.find?.((x) => x.key === 'row_count')?.value ?? null,
    fields: description?.schema?.fields ?? description?.fields ?? [],
    indexes: indexes?.index_names ?? indexes?.data ?? indexes,
    loadState,
  };
}

export async function searchVector(vector, limit = 3) {
  const client = await getMilvusClient();
  const result = await client.search({
    collection_name: env.milvusCollection,
    anns_field: 'vector',
    data: [vector],
    limit,
    output_fields: [
      'schedule_number', 'schedule_title', 'series_number', 'series_title',
      'series_description', 'series_retention_period', 'series_disposition_method', 'text_to_embed',
    ],
  });
  return Array.isArray(result?.results) ? result.results : [];
}

function escapeFilterString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

// Week 10 metadata mapping step: after the classifier selects a valid
// schedule/series pair, retrieve the canonical metadata from Milvus rather
// than trusting duplicated model output.
export async function getSeriesMetadata(scheduleNumber, seriesNumber) {
  const client = await getMilvusClient();
  const filter = `schedule_number == "${escapeFilterString(scheduleNumber)}" and series_number == "${escapeFilterString(seriesNumber)}"`;
  const result = await client.query({
    collection_name: env.milvusCollection,
    filter,
    limit: 1,
    output_fields: [
      'schedule_number', 'schedule_title', 'series_number', 'series_title',
      'series_description', 'series_retention_period', 'series_disposition_method', 'text_to_embed',
    ],
  });
  const rows = result?.data ?? result?.results ?? [];
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
}
