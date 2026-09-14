import { Router } from 'express';
import { upload } from '../middleware/uploadMiddleware.js';
import { classifyDocument, classifyDocumentInternal, uploadAndExtract } from '../controllers/documentController.js';
import { env } from '../config/env.js';

export const documentRouter = Router();
documentRouter.post('/classify', upload.single('document'), classifyDocument);

if (env.enableInternalRoutes) {
  documentRouter.post('/classify-internal', upload.single('document'), classifyDocumentInternal);
  documentRouter.post('/extract', upload.single('document'), uploadAndExtract);
}
