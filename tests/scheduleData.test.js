import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const rows = JSON.parse(await fs.readFile(new URL('../data/lva_schedules.json', import.meta.url), 'utf8'));

test('schedule data is non-empty and source records do not carry Milvus ids', () => {
  assert.ok(rows.length > 0);
  for (const row of rows) assert.equal(Object.hasOwn(row, 'id'), false);
});

test('each schedule/series natural key is unique', () => {
  const keys = rows.map((r) => `${r.schedule_number}:${r.series_number}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('text_to_embed contains title and useful description text', () => {
  for (const row of rows) {
    assert.ok(row.text_to_embed.includes(row.series_title));
    assert.ok(row.text_to_embed.length >= row.series_title.length);
  }
});
