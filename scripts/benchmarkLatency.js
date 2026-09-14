import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyUploadedFile } from '../src/services/classificationPipeline.js';
import { closeMilvusConnection } from '../src/services/milvusService.js';
import { terminateOcrWorker } from '../src/services/extraction/ocrService.js';
import { warmApplication, printWarmupReport } from '../src/services/startupWarmup.js';

function mimeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.bmp': 'image/bmp', '.webp': 'image/webp', '.gif': 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

const target = process.argv[2] || path.resolve('test-documents/01_supplier_invoice_payment_packet.pdf');
const repeats = Math.max(1, Number.parseInt(process.argv[3] || '3', 10));
const coldMode = process.argv.includes('--cold');
const buffer = await readFile(target);
const originalname = path.basename(target);
const rows = [];

console.log(`Latency benchmark: ${originalname}`);
console.log(`Repeats: ${repeats}`);
console.log(`Mode: ${coldMode ? 'cold (no explicit pre-warm)' : 'warmed before measurements'}\n`);

let warmupReport = null;
try {
  if (!coldMode) {
    warmupReport = await warmApplication({ force: true, includeOcr: true });
    printWarmupReport(warmupReport);
    console.log('');
  }
  for (let i = 1; i <= repeats; i += 1) {
    const result = await classifyUploadedFile({
      buffer,
      originalname,
      mimetype: mimeFor(originalname),
      size: buffer.length,
    });
    const m = result.internal.metricsMs;
    const r = result.internal.retrievalMetricsMs;
    const row = {
      run: i,
      result: result.result?.decision === 'MATCH' ? `${result.result.schedule_number}::${result.result.series_number}` : result.result?.decision || 'NO_RESULT',
      extractionMethod: result.internal.extraction?.method,
      ocrUsed: Boolean(result.internal.extraction?.ocrUsed),
      chunkCount: result.internal.chunkCount,
      metricsMs: m,
      retrievalMetricsMs: r,
    };
    rows.push(row);
    console.log(
      `Run ${i}: total=${m.total}ms | storage=${m.storage} extraction=${m.extraction} ` +
      `retrieval=${m.retrieval} classification=${m.classification} metadata=${m.metadataLookup}`
    );
    console.log(
      `       retrieval details: chunk=${r.chunking ?? 0} embed=${r.embedding ?? 0} ` +
      `dense=${r.denseSearch ?? 0} lexical=${r.lexicalSearch ?? 0} fusion=${r.fusion ?? 0}`
    );
  }

  const totals = rows.map((r) => r.metricsMs.total);
  const report = {
    generatedAt: new Date().toISOString(),
    file: originalname,
    repeats,
    mode: coldMode ? 'cold' : 'warm',
    warmup: warmupReport,
    summaryMs: {
      average: Number((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2)),
      p50: Number(percentile(totals, 50).toFixed(2)),
      p95: Number(percentile(totals, 95).toFixed(2)),
      min: Number(Math.min(...totals).toFixed(2)),
      max: Number(Math.max(...totals).toFixed(2)),
    },
    rows,
  };
  await mkdir(new URL('../benchmarks/', import.meta.url), { recursive: true });
  await writeFile(new URL('../benchmarks/latency-benchmark.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log('\nSummary:', report.summaryMs);
  console.log('Saved benchmarks/latency-benchmark.json');
} finally {
  await terminateOcrWorker();
  await closeMilvusConnection();
}
