import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateChunkHits } from '../src/services/retrievalService.js';

test('multi-chunk aggregation promotes a series supported across chunks', () => {
  const shared = {
    schedule_number: 'GS-02', schedule_title: 'Fiscal Records',
    series_number: '010143', series_title: 'Accounts Payable',
    series_description: 'Invoices and money to be paid to creditors.',
  };
  const distractor = {
    schedule_number: 'GS-19', schedule_title: 'Administrative Records',
    series_number: '010039', series_title: 'Routine Correspondence',
    series_description: 'Routine administrative correspondence.',
  };
  const result = aggregateChunkHits([
    [{ ...shared, score: 0.74, rank: 1, chunkIndex: 0 }, { ...distractor, score: 0.73, rank: 2, chunkIndex: 0 }],
    [{ ...shared, score: 0.72, rank: 1, chunkIndex: 1 }],
    [{ ...shared, score: 0.70, rank: 2, chunkIndex: 2 }],
  ], 3);
  assert.equal(result[0].series_number, '010143');
  assert.equal(result[0].supportingChunkIndexes.length, 3);
});
