import { loadScheduleData } from './loadScheduleData.js';

const rows = await loadScheduleData();
const required = [
  'schedule_number', 'schedule_title', 'series_number', 'series_title',
  'series_description', 'series_retention_period', 'series_disposition_method', 'text_to_embed',
];
const seen = new Set();
for (const [index, row] of rows.entries()) {
  if ('id' in row) throw new Error(`Row ${index} must not contain an id; Milvus AutoID owns the primary key.`);
  for (const key of required) {
    if (typeof row[key] !== 'string') throw new Error(`Row ${index} field ${key} must be a string`);
  }
  if (!row.schedule_number || !row.series_number || !row.series_title || !row.text_to_embed) {
    throw new Error(`Row ${index} is missing a required non-empty value`);
  }
  const naturalKey = `${row.schedule_number}:${row.series_number}`;
  if (seen.has(naturalKey)) throw new Error(`Duplicate schedule/series key ${naturalKey}`);
  seen.add(naturalKey);
}
const counts = rows.reduce((acc, row) => {
  acc[row.schedule_number] = (acc[row.schedule_number] || 0) + 1;
  return acc;
}, {});
console.log(`Records: ${rows.length}`);
for (const [schedule, count] of Object.entries(counts)) console.log(`${schedule}: ${count}`);
console.log('Primary-key field in source JSON: NONE (Milvus AutoID).');
console.log('Schedule data validation passed.');
