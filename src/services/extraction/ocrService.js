import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { cleanExtractedText } from '../../utils/text.js';

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(env.ocrLanguage);
  }
  return workerPromise;
}

async function preprocessForOcr(buffer) {
  const image = sharp(buffer, { failOn: 'none' }).rotate().grayscale().normalize();
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  if (width > 0 && width < 1600) {
    return image.resize({ width: 1600, withoutEnlargement: false }).sharpen().png().toBuffer();
  }
  return image.sharpen().png().toBuffer();
}

export async function ocrImage(buffer) {
  if (!env.ocrEnabled) throw new Error('OCR is disabled by OCR_ENABLED=false.');
  const prepared = await preprocessForOcr(buffer);
  const worker = await getWorker();
  const result = await worker.recognize(prepared);
  return {
    text: cleanExtractedText(result?.data?.text || ''),
    confidence: Number.isFinite(result?.data?.confidence) ? result.data.confidence : null,
  };
}


export async function warmOcrWorker() {
  if (!env.ocrEnabled) return { enabled: false, ready: false };
  await getWorker();
  return { enabled: true, ready: true, language: env.ocrLanguage };
}

export async function terminateOcrWorker() {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } finally {
    workerPromise = undefined;
  }
}
