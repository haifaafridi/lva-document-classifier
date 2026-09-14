import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { syncAllLocalitySchedules } from '../src/services/lvaScheduleSyncService.js';

const dataPath = path.resolve('data/lva_schedules.json');
const manifestPath = path.resolve('data/lva_locality_schedule_manifest.json');
const archiveDir = path.resolve('data/archive');
const tempDataPath = `${dataPath}.tmp`;
const tempManifestPath = `${manifestPath}.tmp`;

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

console.log('=== LVA ALL-LOCALITY SCHEDULE SYNC ===');
console.log('This command reads the current LVA locality General Schedules automatically.');
console.log('It does NOT write to Milvus. Run the seed step only after this sync succeeds.\n');

try {
  const result = await syncAllLocalitySchedules({ onProgress: console.log });

  const output = `${JSON.stringify(result.records, null, 2)}\n`;
  const manifest = `${JSON.stringify({
    generated_at: new Date().toISOString(),
    schedule_count: result.schedules.length,
    record_series_count: result.records.length,
    source: result.source,
    schedules: result.manifest,
  }, null, 2)}\n`;

  // Write to temporary files first. Existing known-good data is not touched if
  // fetching/parsing/validation fails midway.
  await writeFile(tempDataPath, output, 'utf8');
  await writeFile(tempManifestPath, manifest, 'utf8');

  await mkdir(archiveDir, { recursive: true });
  try {
    const previous = await readFile(dataPath, 'utf8');
    const backup = path.join(archiveDir, `lva_schedules.before-all-localities.${timestampForFilename()}.json`);
    await writeFile(backup, previous, 'utf8');
    console.log(`\nPrevious dataset backed up to: ${path.relative(process.cwd(), backup)}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await rename(tempDataPath, dataPath);
  await rename(tempManifestPath, manifestPath);

  console.log('\n=== SYNC COMPLETE ===');
  console.log(`Locality schedules: ${result.schedules.length}`);
  console.log(`Record series: ${result.records.length}`);
  for (const item of result.manifest) {
    console.log(`${item.schedule_number}: ${item.record_series_count} - ${item.schedule_title}`);
  }
  console.log('\nUpdated: data/lva_schedules.json');
  console.log('Provenance: data/lva_locality_schedule_manifest.json');
  console.log('Next: npm run data:validate');
} catch (error) {
  console.error('\nLVA locality schedule sync failed:', error.message || error);
  console.error('Existing data/lva_schedules.json was not intentionally replaced on a failed sync.');
  process.exitCode = 1;
}
