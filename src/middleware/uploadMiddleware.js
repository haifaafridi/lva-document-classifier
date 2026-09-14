import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env.js';

const allowedExtensions = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif',
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSizeBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new Error('Supported formats: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PNG, JPG/JPEG, BMP, WEBP, and non-animated GIF.'));
    }
    cb(null, true);
  },
});
