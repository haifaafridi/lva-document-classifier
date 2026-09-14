import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { env } from './src/config/env.js';
import { documentRouter } from './src/routes/documentRoutes.js';
import { knowledgeRouter } from './src/routes/knowledgeRoutes.js';
import { classifierInfo } from './src/services/classificationService.js';
import { warmApplication, printWarmupReport } from './src/services/startupWarmup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  project: 'LVA Document Classifier',
  throughWeek: 10,
  classifier: classifierInfo(),
}));
app.use('/api/documents', documentRouter);
app.use('/api/knowledge', knowledgeRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File exceeds the ${env.maxFileSizeBytes / 1024 / 1024} MB limit.` });
  }
  const message = error?.message || 'Unexpected server error';
  const status = /unsupported|no document|not contain enough|required|only/i.test(message) ? 400 : 500;
  return res.status(status).json({ error: message });
});

const warmupReport = await warmApplication();
printWarmupReport(warmupReport);

app.listen(env.port, () => {
  console.log(`LVA Document Classifier Weeks 8-10 running at http://localhost:${env.port}`);
  console.log(`Storage mode: ${env.storageMode}`);
  console.log(`Milvus collection: ${env.milvusCollection}`);
  console.log(`Classifier: ${env.classifierProvider}/${env.classifierModel}${env.geminiApiKey ? '' : ' (API key not configured - retrieval fallback only)'}`);
  console.log(`Startup warm-up: ${env.startupWarmup ? 'enabled' : 'disabled'}${env.startupWarmupOcr ? ' + OCR worker' : ''}`);
});
