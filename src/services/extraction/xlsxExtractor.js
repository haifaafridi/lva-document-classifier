import * as XLSX from 'xlsx';
import { cleanExtractedText } from '../../utils/text.js';

export async function extractXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sections = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) sections.push(`[Sheet: ${sheetName}]\n${csv}`);
  }
  return {
    text: cleanExtractedText(sections.join('\n\n')),
    method: 'spreadsheet-text',
    ocrUsed: false,
    sheets: workbook.SheetNames.length,
  };
}
