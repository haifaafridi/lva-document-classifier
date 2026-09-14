import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { env } from '../config/env.js';
import { storeDocument } from './storageService.js';
import { extractDocument } from './extraction/index.js';
import { retrieveCandidates, chooseClassifierChunks } from './retrievalService.js';
import { classifyCandidates, classifierInfo } from './classificationService.js';
import { getSeriesMetadata } from './milvusService.js';

function ms(value) {
  return Number(value.toFixed(2));
}

export async function classifyUploadedFile(file, { retrievalOnly = false } = {}) {
  const requestId = crypto.randomUUID();
  const totalStart = performance.now();

  const storageStart = performance.now();
  const stored = await storeDocument(file.buffer, file.originalname, file.mimetype);
  const storageMs = performance.now() - storageStart;

  // The uploaded bytes are already in memory. Previously the app uploaded to Azure and
  // immediately downloaded the same blob again before extraction. That extra round-trip
  // increased latency without changing the document bytes, so extraction now uses the
  // original upload buffer after successful storage.
  const extractionStart = performance.now();
  const extraction = await extractDocument({ buffer: file.buffer, originalName: file.originalname, mimetype: file.mimetype });
  const extractionMs = performance.now() - extractionStart;
  if (!extraction.text || extraction.text.trim().length < 10) {
    throw new Error('The document did not contain enough readable text for classification. Try a clearer scan/image or a text-based document.');
  }

  const retrievalStart = performance.now();
  const retrieval = await retrieveCandidates(extraction.text);
  const retrievalMs = performance.now() - retrievalStart;
  const classifierChunks = chooseClassifierChunks(retrieval.chunks, retrieval.candidates);

  let classification = null;
  let classificationMs = 0;
  if (!retrievalOnly && env.classifierProvider !== 'disabled' && env.geminiApiKey) {
    const classificationStart = performance.now();
    classification = await classifyCandidates({ documentChunks: classifierChunks, candidates: retrieval.candidates });
    classificationMs = performance.now() - classificationStart;
  }

  let mapped = null;
  let metadataLookupMs = 0;
  if (classification?.decision === 'MATCH') {
    const metadataStart = performance.now();
    try {
      mapped = await getSeriesMetadata(classification.schedule_number, classification.series_number);
    } catch {
      mapped = null;
    }
    metadataLookupMs = performance.now() - metadataStart;
    mapped ||= classification.candidate;
  }

  const totalMs = performance.now() - totalStart;
  const metricsMs = {
    storage: ms(storageMs),
    extraction: ms(extractionMs),
    retrieval: ms(retrievalMs),
    classification: ms(classificationMs),
    metadataLookup: ms(metadataLookupMs),
    total: ms(totalMs),
  };

  return {
    requestId,
    file: { originalName: file.originalname, size: file.size, mimetype: file.mimetype },
    result: mapped ? {
      decision: 'MATCH',
      schedule_title: mapped.schedule_title,
      schedule_number: mapped.schedule_number,
      series_title: mapped.series_title,
      series_number: mapped.series_number,
      series_description: mapped.series_description,
      retention_period: mapped.series_retention_period,
      disposition_method: mapped.series_disposition_method,
      reasoning: classification.reasoning,
    } : classification?.decision === 'NO_MATCH' ? {
      decision: 'NO_MATCH', reasoning: classification.reasoning,
    } : null,
    candidates: retrieval.candidates.map((c) => ({
      schedule_title: c.schedule_title,
      schedule_number: c.schedule_number,
      series_title: c.series_title,
      series_number: c.series_number,
      series_description: c.series_description,
      retention_period: c.series_retention_period,
      disposition_method: c.series_disposition_method,
      retrieval_score: c.score,
      aggregate_score: c.aggregateScore,
    })),
    classificationAvailable: classifierInfo().configured && env.classifierProvider !== 'disabled',
    classificationModel: classification?.model || null,
    // Safe, user-facing performance summary. No credentials, vectors or storage paths.
    processing: {
      totalMs: metricsMs.total,
      totalSeconds: Number((metricsMs.total / 1000).toFixed(2)),
      extractionMethod: extraction.method || 'unknown',
      ocrUsed: Boolean(extraction.ocrUsed),
      chunkCount: retrieval.chunks.length,
      model: classification?.model || null,
      stagesMs: metricsMs,
      retrievalStagesMs: retrieval.diagnostics.timingsMs || {},
    },
    internal: {
      storage: stored,
      extraction,
      chunkCount: retrieval.chunks.length,
      queryVectorsStored: false,
      queryVectorDimension: retrieval.diagnostics.queryVectorDimension,
      classifierChunkCount: classifierChunks.length,
      metricsMs,
      retrievalMetricsMs: retrieval.diagnostics.timingsMs || {},
    },
  };
}
