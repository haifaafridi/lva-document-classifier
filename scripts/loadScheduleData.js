import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadScheduleData() {
  const p = path.resolve('data/lva_schedules.json');
  return JSON.parse(await readFile(p, 'utf8'));
}
