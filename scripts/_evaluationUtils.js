import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractDocument } from '../src/services/extraction/index.js';

export async function loadGroundTruth() {
  return JSON.parse(await readFile(new URL('../test-documents/ground_truth.json', import.meta.url), 'utf8'));
}

export async function loadTestDocument(entry) {
  const filePath = new URL(`../test-documents/${entry.file}`, import.meta.url);
  const buffer = await readFile(filePath);
  const extraction = await extractDocument({ buffer, originalName: path.basename(filePath.pathname), mimetype: '' });
  return { buffer, extraction };
}

export function expectedKey(entry) {
  return entry.expected?.decision === 'NO_MATCH' ? 'NO_MATCH' : `${entry.expected.schedule_number}::${entry.expected.series_number}`;
}

export function candidateKey(candidate) {
  return `${candidate.schedule_number}::${candidate.series_number}`;
}
