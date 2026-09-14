import { Router } from 'express';
import { env } from '../config/env.js';
import { getCollectionStatus } from '../services/milvusService.js';
import { embeddingInfo } from '../services/embeddingService.js';
import { retrieveCandidates } from '../services/retrievalService.js';
import { classifierInfo } from '../services/classificationService.js';

export const knowledgeRouter = Router();

if (env.enableInternalRoutes) {
  knowledgeRouter.get('/status', async (_req, res, next) => {
    try {
      const milvus = await getCollectionStatus();
      res.json({ milvus, embedding: embeddingInfo(), classifier: classifierInfo() });
    } catch (error) { next(error); }
  });

  knowledgeRouter.post('/search', async (req, res, next) => {
    try {
      const text = String(req.body?.text ?? '').trim();
      if (!text) return res.status(400).json({ error: 'Document text is required.' });
      const result = await retrieveCandidates(text);
      res.json({
        topK: result.candidates.length,
        matches: result.candidates,
        chunkCount: result.chunks.length,
        queryEmbedding: {
          dimension: result.diagnostics.queryVectorDimension,
          count: result.diagnostics.queryVectorCount,
          storedInMilvus: false,
        },
        classificationPerformed: false,
      });
    } catch (error) { next(error); }
  });
}
