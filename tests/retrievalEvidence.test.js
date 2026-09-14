import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRetrievalEvidence } from '../src/services/retrievalEvidenceService.js';
import { hybridFuse } from '../src/services/rerankerService.js';

test('retrieval evidence keeps the business-purpose sentence and removes demo boilerplate', () => {
  const units = buildRetrievalEvidence(`
    SYNTHETIC DEMO DOCUMENT - NO REAL PERSONS OR CASES
    The county received an invoice from a technology supplier for delivered equipment.
    The purpose of the file is to document money the locality must pay to a creditor.
    This is a synthetic born-digital test document with selectable text. It does not require OCR.
  `);
  const joined = units.map((x) => x.text).join(' ');
  assert.match(joined, /money the locality must pay to a creditor/i);
  assert.doesNotMatch(joined, /does not require OCR/i);
});

test('hybrid fusion rewards agreement and strong lexical evidence without requiring a cross-encoder', () => {
  const rows = hybridFuse([
    { schedule_number: 'GS-X', series_number: '1', denseRank: 1, aggregateScore: 0.9, lexicalRank: null, lexicalScore: 0 },
    { schedule_number: 'GS-02', series_number: '010143', denseRank: 5, aggregateScore: 0.75, lexicalRank: 1, lexicalScore: 14 },
    { schedule_number: 'GS-Y', series_number: '2', denseRank: 2, aggregateScore: 0.84, lexicalRank: 8, lexicalScore: 2 },
  ]);
  assert.equal(rows[0].series_number, '010143');
});
