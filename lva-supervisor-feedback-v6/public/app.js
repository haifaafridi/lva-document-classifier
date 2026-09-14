const form = document.querySelector('#classifyForm');
const fileInput = document.querySelector('#document');
const fileName = document.querySelector('#fileName');
const button = document.querySelector('#classifyButton');
const statusText = document.querySelector('#statusText');
const statusLine = document.querySelector('#status');
const resultCard = document.querySelector('#resultCard');
const classificationResult = document.querySelector('#classificationResult');
const noMatch = document.querySelector('#noMatch');
const retrievalFallback = document.querySelector('#retrievalFallback');
const processingSummary = document.querySelector('#processingSummary');

fileInput.addEventListener('change', () => {
  fileName.textContent = fileInput.files[0]?.name || 'No file selected';
  setStatus('Ready to classify.', 'ready');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) return;

  button.disabled = true;
  button.textContent = 'Classifying…';
  setStatus('Processing document, retrieving LVA candidates, and making the final decision…', 'working');
  resultCard.classList.add('hidden');

  const data = new FormData();
  data.append('document', file);

  try {
    const response = await fetch('/api/documents/classify', { method: 'POST', body: data });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Classification failed.');

    resultCard.classList.remove('hidden');
    classificationResult.classList.add('hidden');
    noMatch.classList.add('hidden');
    retrievalFallback.classList.add('hidden');
    processingSummary.classList.add('hidden');

    if (body.result?.decision === 'MATCH') {
      renderClassification(body.result, body.processing);
      setStatus(`Classification complete${body.processing?.totalSeconds ? ` in ${body.processing.totalSeconds.toFixed(2)} s` : ''}.`, 'success');
    } else if (body.result?.decision === 'NO_MATCH') {
      noMatch.classList.remove('hidden');
      document.querySelector('#resultHeadingTitle').textContent = 'No reliable match';
      document.querySelector('#seriesCode').textContent = 'NO MATCH';
      document.querySelector('#noMatchReason').textContent = body.result.reasoning || 'None of the retrieved candidates was sufficiently supported.';
      setStatus(`No reliable match found${body.processing?.totalSeconds ? ` after ${body.processing.totalSeconds.toFixed(2)} s` : ''}.`, 'success');
    } else {
      renderCandidates(body.candidates || []);
      setStatus('Retrieval complete. Configure the classifier to enable the final decision.', 'ready');
    }
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Classify document';
  }
});

function setStatus(message, state = 'ready') {
  statusText.textContent = message;
  statusLine.dataset.state = state;
}

function renderClassification(result, processing) {
  classificationResult.classList.remove('hidden');
  document.querySelector('#resultHeadingTitle').textContent = 'Matched LVA record';
  document.querySelector('#seriesTitle').textContent = result.series_title || 'Matched record series';
  document.querySelector('#seriesNumber').textContent = result.series_number || '—';
  document.querySelector('#seriesCode').textContent = `${result.schedule_number || ''} / ${result.series_number || ''}`;
  document.querySelector('#scheduleTitle').textContent = result.schedule_title || '—';
  document.querySelector('#scheduleNumber').textContent = result.schedule_number || '—';
  document.querySelector('#retention').textContent = result.retention_period || '—';
  document.querySelector('#disposition').textContent = result.disposition_method || '—';
  document.querySelector('#seriesDescription').textContent = result.series_description || 'No description is available for this record series.';
  document.querySelector('#reasoningText').textContent = result.reasoning || '—';

  if (processing) {
    const method = humanizeMethod(processing.extractionMethod);
    const parts = [
      processing.totalSeconds != null ? `Completed in ${Number(processing.totalSeconds).toFixed(2)} s` : null,
      method,
      processing.ocrUsed ? 'OCR used' : 'OCR not needed',
      Number.isFinite(processing.chunkCount) ? `${processing.chunkCount} text chunk${processing.chunkCount === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    processingSummary.textContent = parts.join('  •  ');
    processingSummary.classList.remove('hidden');
  }
}

function humanizeMethod(method) {
  const labels = {
    'pdf-text': 'PDF text extraction',
    'pdf-hybrid-text-and-ocr': 'PDF + OCR extraction',
    'image-ocr': 'Image OCR',
    'spreadsheet-text': 'Spreadsheet text extraction',
    'docx-text': 'Word text extraction',
    'doc-text': 'Word text extraction',
  };
  return labels[method] || String(method || '').replaceAll('-', ' ');
}

function renderCandidates(candidates) {
  retrievalFallback.classList.remove('hidden');
  document.querySelector('#seriesCode').textContent = 'RETRIEVAL';
  const list = document.querySelector('#candidateList');
  list.innerHTML = candidates.length ? candidates.map((c, i) => `
    <article class="candidate">
      <span class="rank">${i + 1}</span>
      <div><strong>${escapeHtml(c.series_title || 'Untitled series')}</strong>
      <p>${escapeHtml(c.schedule_number || '')} / ${escapeHtml(c.series_number || '')}</p></div>
    </article>`).join('') : '<p>No candidates returned.</p>';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
