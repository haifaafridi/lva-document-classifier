import mammoth from 'mammoth';
import { cleanExtractedText } from '../../utils/text.js';

export async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: cleanExtractedText(result.value),
    method: 'docx-text',
    ocrUsed: false,
    warnings: (result.messages || []).map((m) => m.message).filter(Boolean),
  };
}
