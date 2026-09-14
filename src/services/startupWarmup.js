import { performance } from 'node:perf_hooks';
import { env } from '../config/env.js';
import { warmStorage } from './storageService.js';
import { warmEmbeddingModel } from './embeddingService.js';
import { getMilvusClient, searchVector } from './milvusService.js';
import { warmOcrWorker } from './extraction/ocrService.js';

function ms(start) {
  return Number((performance.now() - start).toFixed(2));
}

async function runStep(name, fn, results) {
  const start = performance.now();
  try {
    const value = await fn();
    results[name] = { ok: true, ms: ms(start), value };
    return value;
  } catch (error) {
    results[name] = { ok: false, ms: ms(start), error: error?.message || String(error) };
    return null;
  }
}

export async function warmApplication({ force = false, includeOcr = env.startupWarmupOcr } = {}) {
  if (!env.startupWarmup && !force) {
    return { enabled: false, totalMs: 0, steps: {} };
  }

  const totalStart = performance.now();
  const steps = {};

  // These are intentionally best-effort. A temporary cloud outage during startup
  // should not prevent the web server from starting; the normal request path will
  // still surface a clear error if the dependency remains unavailable.
  await runStep('storage', () => warmStorage(), steps);
  const vector = await runStep('embedding', () => warmEmbeddingModel(), steps);

  await runStep('milvusConnect', async () => {
    await getMilvusClient();
    return { connected: true };
  }, steps);

  if (vector) {
    await runStep('milvusSearch', async () => {
      const hits = await searchVector(vector, 1);
      return { hits: Array.isArray(hits) ? hits.length : 0 };
    }, steps);
  }

  if (includeOcr && env.ocrEnabled) {
    await runStep('ocrWorker', () => warmOcrWorker(), steps);
  }

  return {
    enabled: true,
    totalMs: Number((performance.now() - totalStart).toFixed(2)),
    steps,
  };
}

export function printWarmupReport(report) {
  if (!report?.enabled) {
    console.log('[Warmup] disabled (STARTUP_WARMUP=false)');
    return;
  }
  const parts = Object.entries(report.steps).map(([name, result]) =>
    `${name}=${result.ok ? `${result.ms}ms` : `FAILED(${result.error})`}`
  );
  console.log(`[Warmup] total=${report.totalMs}ms | ${parts.join(' | ')}`);
}
