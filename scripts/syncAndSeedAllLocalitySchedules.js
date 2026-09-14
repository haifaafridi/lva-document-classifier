import { spawn } from 'node:child_process';

const targetCollection = process.env.MILVUS_ALL_LOCALITY_COLLECTION || 'GS_Schedules_All_Localities';

function runNode(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

console.log('=== SYNC + ONE-TIME SEED: ALL LVA LOCALITY GENERAL SCHEDULES ===');
console.log(`Target Milvus collection: ${targetCollection}`);
console.log('Existing collections are not modified; this command targets the configured all-locality collection.\n');

try {
  await runNode('scripts/syncLocalitySchedules.js');
  await runNode('scripts/validateScheduleData.js');
  await runNode('scripts/seedMilvus.js', { MILVUS_COLLECTION: targetCollection });
  console.log('\n=== ALL-LOCALITY KNOWLEDGE BASE READY ===');
  console.log(`Seeded collection: ${targetCollection}`);
  console.log('For normal upload -> embedding -> Top-3 retrieval, set this in .env:');
  console.log(`MILVUS_COLLECTION=${targetCollection}`);
  console.log('Then restart npm start. Do not rerun the seed during normal runtime.');
} catch (error) {
  console.error('\nSync/seed stopped:', error.message || error);
  process.exitCode = 1;
}
