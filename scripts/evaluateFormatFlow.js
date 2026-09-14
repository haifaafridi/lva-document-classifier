import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { classifyUploadedFile } from '../src/services/classificationPipeline.js';
import { closeMilvusConnection } from '../src/services/milvusService.js';
import { loadGroundTruth, expectedKey } from './_evaluationUtils.js';

function formatFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return 'PDF';
  if (ext === '.docx' || ext === '.doc') return 'Word';
  if (ext === '.xlsx' || ext === '.xls') return 'Excel';
  if (['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif'].includes(ext)) return 'Image';
  return ext || 'Unknown';
}

const tests = await loadGroundTruth();
const rows = [];
try {
  for (const entry of tests) {
    const fileUrl = new URL(`../test-documents/${entry.file}`, import.meta.url);
    const buffer = await readFile(fileUrl);
    const file = { buffer, originalname: entry.file, mimetype: '', size: buffer.length };
    const started = performance.now();
    try {
      const result = await classifyUploadedFile(file);
      const actual = result.result?.decision === 'MATCH'
        ? `${result.result.schedule_number}::${result.result.series_number}`
        : result.result?.decision === 'NO_MATCH' ? 'NO_MATCH' : 'NO_RESULT';
      const expected = expectedKey(entry);
      const correct = actual === expected;
      const extraction = result.internal?.extraction || {};
      const row = {
        file: entry.file,
        format: formatFor(entry.file),
        bytes: buffer.length,
        extractionMethod: extraction.method || 'unknown',
        ocrUsed: Boolean(extraction.ocrUsed),
        ocrPages: extraction.ocrPages || [],
        extractedCharacters: extraction.text?.length || 0,
        chunks: result.internal?.chunkCount ?? null,
        expected,
        actual,
        correct,
        model: result.classificationModel,
        metricsMs: result.internal?.metricsMs || {},
        totalMs: Number((performance.now() - started).toFixed(1)),
      };
      rows.push(row);
      console.log(`${correct ? 'PASS' : 'FAIL'} ${entry.file}`);
      console.log(`  format=${row.format} extraction=${row.extractionMethod} ocr=${row.ocrUsed ? 'YES' : 'NO'} chars=${row.extractedCharacters} chunks=${row.chunks} result=${actual}`);
    } catch (error) {
      rows.push({ file: entry.file, format: formatFor(entry.file), expected: expectedKey(entry), actual: 'ERROR', correct: false, error: error.message });
      console.log(`ERROR ${entry.file}: ${error.message}`);
    }
  }

  const accuracy = rows.filter((r) => r.correct).length / Math.max(1, rows.length);
  const formats = {};
  for (const row of rows) {
    formats[row.format] ||= { total: 0, pass: 0 };
    formats[row.format].total += 1;
    if (row.correct) formats[row.format].pass += 1;
  }
  const report = { generatedAt: new Date().toISOString(), count: rows.length, accuracy, formats, rows };
  await mkdir(new URL('../benchmarks/', import.meta.url), { recursive: true });
  await writeFile(new URL('../benchmarks/format-flow-evaluation.json', import.meta.url), JSON.stringify(report, null, 2));

  console.log('\n=== FORMAT / OCR FLOW SUMMARY ===');
  for (const [format, stats] of Object.entries(formats)) console.log(`${format}: ${stats.pass}/${stats.total} passed`);
  console.log(`Overall: ${(accuracy * 100).toFixed(1)}%`);
  console.log('Saved benchmarks/format-flow-evaluation.json');
} finally {
  await closeMilvusConnection();
}
