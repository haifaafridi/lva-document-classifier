import path from 'node:path';
import { extractPdf } from './pdfExtractor.js';
import { extractDocx } from './docxExtractor.js';
import { extractDoc } from './docExtractor.js';
import { extractXlsx } from './xlsxExtractor.js';
import { extractImage } from './imageExtractor.js';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif']);

export async function extractDocument({ buffer, originalName, mimetype }) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (mimetype === 'application/pdf' || ext === '.pdf') return extractPdf(buffer);
  if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocx(buffer);
  if (ext === '.doc' || mimetype === 'application/msword') return extractDoc(buffer);
  if (ext === '.xlsx' || ext === '.xls' || mimetype?.includes('spreadsheet') || mimetype === 'application/vnd.ms-excel') return extractXlsx(buffer);
  if (imageExtensions.has(ext) || mimetype?.startsWith('image/')) return extractImage(buffer);
  throw new Error(`Unsupported document type: ${ext || mimetype || 'unknown'}`);
}

// Backward-compatible helper used by older scripts.
export async function extractTextFromDocument(args) {
  const result = await extractDocument(args);
  return result.text;
}
