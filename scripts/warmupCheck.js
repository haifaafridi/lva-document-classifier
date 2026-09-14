import { warmApplication, printWarmupReport } from '../src/services/startupWarmup.js';
import { closeMilvusConnection } from '../src/services/milvusService.js';
import { terminateOcrWorker } from '../src/services/extraction/ocrService.js';

try {
  const report = await warmApplication({ force: true, includeOcr: true });
  printWarmupReport(report);
  const failed = Object.entries(report.steps).filter(([, x]) => !x.ok);
  if (failed.length) {
    console.error('Warm-up completed with failed steps:', failed.map(([name]) => name).join(', '));
    process.exitCode = 1;
  } else {
    console.log('Startup warm-up check passed.');
  }
} finally {
  await terminateOcrWorker();
  await closeMilvusConnection();
}
