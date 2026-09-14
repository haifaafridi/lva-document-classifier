import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanExtractedText } from '../src/utils/text.js';

test('cleanExtractedText removes redundant whitespace without merging paragraphs', () => {
  assert.equal(cleanExtractedText(' Hello   world  \n\n\n  Next\tline '), 'Hello world\n\nNext\tline');
});
