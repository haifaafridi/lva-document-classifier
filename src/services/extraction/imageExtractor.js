import { ocrImage } from './ocrService.js';

export async function extractImage(buffer) {
  const result = await ocrImage(buffer);
  return {
    text: result.text,
    method: 'image-ocr',
    ocrUsed: true,
    ocrConfidence: result.confidence,
  };
}
