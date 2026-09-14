import { performance } from 'node:perf_hooks';
import { storeDocument, readStoredDocument } from '../services/storageService.js';
import { extractDocument } from '../services/extraction/index.js';
import { classifyUploadedFile } from '../services/classificationPipeline.js';

function logTiming(result) {
  const m = result.internal?.metricsMs || {};
  const r = result.internal?.retrievalMetricsMs || {};
  console.log(
    `[Classify ${result.requestId}] ${result.file.originalName} | total=${m.total ?? '?'}ms ` +
    `storage=${m.storage ?? '?'} extraction=${m.extraction ?? '?'} retrieval=${m.retrieval ?? '?'} ` +
    `classification=${m.classification ?? '?'} metadata=${m.metadataLookup ?? '?'} | ` +
    `retrieval(chunk=${r.chunking ?? '?'} embed=${r.embedding ?? '?'} dense=${r.denseSearch ?? '?'} ` +
    `lexical=${r.lexicalSearch ?? '?'} fusion=${r.fusion ?? '?'})`
  );
}

export async function classifyDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No document was uploaded.' });
    const result = await classifyUploadedFile(req.file);
    logTiming(result);
    const m = result.internal?.metricsMs || {};
    res.set('Server-Timing', [
      `storage;dur=${m.storage || 0}`,
      `extract;dur=${m.extraction || 0}`,
      `retrieve;dur=${m.retrieval || 0}`,
      `classify;dur=${m.classification || 0}`,
      `metadata;dur=${m.metadataLookup || 0}`,
      `total;dur=${m.total || 0}`,
    ].join(', '));
    const { internal, ...publicPayload } = result;
    res.json(publicPayload);
  } catch (error) {
    next(error);
  }
}

export async function classifyDocumentInternal(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No document was uploaded.' });
    const result = await classifyUploadedFile(req.file);
    logTiming(result);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// Internal extraction diagnostic. Not mounted unless ENABLE_INTERNAL_ROUTES=true.
export async function uploadAndExtract(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No document was uploaded.' });
    const totalStart = performance.now();
    const stored = await storeDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
    const buffer = await readStoredDocument(stored);
    const extraction = await extractDocument({ buffer, originalName: req.file.originalname, mimetype: req.file.mimetype });
    res.json({
      file: { originalName: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype, storage: stored },
      extraction,
      totalMs: Number((performance.now() - totalStart).toFixed(2)),
    });
  } catch (error) {
    next(error);
  }
}
