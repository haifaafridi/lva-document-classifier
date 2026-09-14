import * as cheerio from 'cheerio';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OFFICIAL_SCHEDULES_URL = 'https://www.lva.virginia.gov/services/rm/schedules';
const LOCAL_SEARCH_URL = 'https://old.lva.virginia.gov/agencies/records/sched_local/search.asp';
const FETCH_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const MIN_EXPECTED_LOCALITY_SCHEDULES = 28;

const USER_AGENT =
  'LVA-Document-Classifier-Internship/1.0 (+educational prototype; respectful schedule sync)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchText(url, options) {
  return (await fetchWithRetry(url, options)).text();
}

function cleanWhitespace(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function titleFromOfficialAnchor($, anchor, code) {
  const parentText = cleanWhitespace($(anchor).parent().text());
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = parentText.match(new RegExp(`${escaped}\\s*,?\\s*([^()]+?)(?:\\s*\\(|$)`));
  return cleanWhitespace(match?.[1] || '');
}

export function parseOfficialLocalityScheduleList(html, baseUrl = OFFICIAL_SCHEDULES_URL) {
  const $ = cheerio.load(html);
  const byCode = new Map();

  $('a[href]').each((_, anchor) => {
    const code = cleanWhitespace($(anchor).text()).toUpperCase();
    // Locality General Schedules use two-digit numbers (GS-01 ... GS-33).
    // State General Schedules use three-digit numbers (GS-100+), so this
    // deliberately excludes them.
    if (!/^GS-\d{2}$/.test(code)) return;

    const href = $(anchor).attr('href');
    if (!href) return;
    const pdfUrl = new URL(href, baseUrl).href;
    if (!/\.pdf(?:$|[?#])/i.test(pdfUrl)) return;

    const title = titleFromOfficialAnchor($, anchor, code);
    byCode.set(code, { schedule_number: code, schedule_title: title, pdf_url: pdfUrl });
  });

  return [...byCode.values()].sort((a, b) =>
    Number(a.schedule_number.slice(3)) - Number(b.schedule_number.slice(3))
  );
}

function findScheduleForm(html) {
  const $ = cheerio.load(html);
  let found = null;

  $('form').each((_, form) => {
    if (found) return;
    $(form)
      .find('select')
      .each((__, select) => {
        const optionTexts = $(select)
          .find('option')
          .map((___, option) => cleanWhitespace($(option).text()).toUpperCase())
          .get();
        if (optionTexts.includes('GS-01') && optionTexts.includes('GS-02')) {
          found = { $, form, scheduleSelect: select };
        }
      });
  });

  if (!found) {
    throw new Error('Could not locate the LVA locality-schedule search form. The LVA page layout may have changed.');
  }
  return found;
}

function buildDefaultFormParams($, form) {
  const params = new URLSearchParams();
  $(form)
    .find('input[name], select[name], textarea[name]')
    .each((_, control) => {
      const node = $(control);
      const name = node.attr('name');
      if (!name || node.is(':disabled')) return;

      if (node.is('select')) {
        const option = node.find('option:selected').first().length
          ? node.find('option:selected').first()
          : node.find('option').first();
        params.set(name, option.attr('value') ?? cleanWhitespace(option.text()));
        return;
      }

      if (node.is('textarea')) {
        params.set(name, node.text() || '');
        return;
      }

      const type = (node.attr('type') || 'text').toLowerCase();
      if (['checkbox', 'radio'].includes(type) && !node.is(':checked')) return;
      if (['button', 'reset', 'file'].includes(type)) return;
      params.set(name, node.attr('value') || '');
    });
  return params;
}

export function discoverSearchForm(html, pageUrl = LOCAL_SEARCH_URL) {
  const { $, form, scheduleSelect } = findScheduleForm(html);
  const scheduleField = $(scheduleSelect).attr('name');
  if (!scheduleField) throw new Error('The LVA schedule selector has no form field name.');

  const options = new Map();
  $(scheduleSelect)
    .find('option')
    .each((_, option) => {
      const text = cleanWhitespace($(option).text()).toUpperCase();
      if (/^GS-\d{2}$/.test(text)) options.set(text, $(option).attr('value') ?? text);
    });

  const action = new URL($(form).attr('action') || 'results.asp', pageUrl).href;
  const method = ($(form).attr('method') || 'GET').toUpperCase();
  const defaults = buildDefaultFormParams($, form);

  return { action, method, scheduleField, options, defaults };
}

function htmlToLines(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  $('tr, p, li, h1, h2, h3, h4, h5, h6').each((_, el) => $(el).append('\n'));
  $('td, th').each((_, el) => $(el).append(' '));

  let text = $('body').text().replace(/\r/g, '').replace(/\u00a0/g, ' ');
  // Old ASP output is table-oriented. Inject boundaries before the labels used
  // by the official search results in case the browser collapses table cells.
  text = text
    .replace(/[ \t]+(?=(?:GS-\d{2}:|\d{3,6}:|Retention:|Disposition:|Citation:|Series Status:))/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');

  return text
    .split('\n')
    .map(cleanWhitespace)
    .filter(Boolean);
}

function cleanRetention(value) {
  return cleanWhitespace(value).replace(/^Retain\s+/i, '');
}

function finalizeRecord(record, schedule) {
  if (!record) return null;
  const description = cleanWhitespace(record.description.join(' '));
  const retention = cleanRetention(record.retention.join(' '));
  const disposition = cleanWhitespace(record.disposition.join(' '));

  return {
    schedule_number: schedule.schedule_number,
    schedule_title: schedule.schedule_title,
    series_number: record.series_number,
    series_title: cleanWhitespace(record.series_title),
    series_description: description,
    series_retention_period: retention,
    series_disposition_method: disposition,
    text_to_embed: cleanWhitespace(`${record.series_title}: ${description}`),
  };
}

export function parseSearchResults(html, schedule) {
  const lines = htmlToLines(html);
  const records = [];
  let current = null;
  let state = 'description';

  const finalize = () => {
    const row = finalizeRecord(current, schedule);
    if (row) records.push(row);
    current = null;
    state = 'description';
  };

  for (const rawLine of lines) {
    const line = cleanWhitespace(rawLine);
    const seriesMatch = line.match(/^(\d{3,6})\s*:\s*(.+)$/);
    if (seriesMatch) {
      finalize();
      current = {
        series_number: seriesMatch[1].padStart(6, '0'),
        series_title: seriesMatch[2],
        description: [],
        retention: [],
        disposition: [],
      };
      continue;
    }

    if (!current) continue;

    if (/^Retention\s*:/i.test(line)) {
      state = 'retention';
      current.retention.push(line.replace(/^Retention\s*:\s*/i, ''));
      continue;
    }
    if (/^Disposition\s*:/i.test(line)) {
      state = 'disposition';
      current.disposition.push(line.replace(/^Disposition\s*:\s*/i, ''));
      continue;
    }
    if (/^(?:Citation|Series Status)\s*:/i.test(line)) {
      // Useful for legal records management, but not part of the simplified
      // Milvus schema requested for this internship prototype.
      state = 'description';
      continue;
    }

    // Skip obvious page/navigation material that can follow the final row.
    if (/^(?:Location:|Library of Virginia|Open to the Public:|Site Index|Search Results)$/i.test(line)) {
      continue;
    }

    if (state === 'retention') current.retention.push(line);
    else if (state === 'disposition') current.disposition.push(line);
    else current.description.push(line);
  }
  finalize();

  // A valid result row always needs title, number and a useful description.
  return records.filter((row) => row.series_number && row.series_title && row.series_description);
}


function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleRegex(title) {
  const tokens = String(title ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!tokens.length) return null;
  // Permit punctuation/line-break noise between title words while still
  // anchoring on the complete title phrase.
  return new RegExp(tokens.join('[\\s\\W_]{0,8}'), 'i');
}

function stripPdfNoise(value) {
  return cleanWhitespace(value)
    .replace(/Government Records Services\s+800(?:\s+East|\s+E\.)?\s+Broad St\.?\s*,?\s*Richmond VA\s+23219/gi, ' ')
    .replace(/\(804\)\s*692-3600/gi, ' ')
    .replace(/Records Retention and Disposition Schedule/gi, ' ')
    .replace(/RECORDS SERIES AND DESCRIPTION\s+SERIES NUMBER\s+SCHEDULED RETENTION(?: PERIOD)?\s+(?:AND )?DISPOSITION(?: METHOD)?/gi, ' ')
    .replace(/Page\s+\d+\s+of\s+\d+/gi, ' ')
    .replace(/Effective schedule date\s*:?\s*[A-Za-z0-9, /-]+/gi, ' ')
    .replace(/GENERAL SCHEDULE NO\.?\s*(?:GS-)?\d+/gi, ' ')
    .replace(/COUNTY AND MUNICIPAL GOVERNMENTS/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function extractPdfPhysicalLines(pdfUrl) {
  const response = await fetchWithRetry(pdfUrl, {
    headers: { accept: 'application/pdf,*/*;q=0.8' },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: pathToFileURL(path.resolve('node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep).href,
    cMapUrl: pathToFileURL(path.resolve('node_modules', 'pdfjs-dist', 'cmaps') + path.sep).href,
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const allLines = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => typeof item.str === 'string' && item.str.trim())
        .map((item) => ({
          text: item.str.trim(),
          x: Number(item.transform?.[4] ?? 0),
          y: Number(item.transform?.[5] ?? 0),
        }))
        .sort((a, b) => (Math.abs(b.y - a.y) > 1.5 ? b.y - a.y : a.x - b.x));

      const groups = [];
      for (const item of items) {
        let group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= 1.5);
        if (!group) {
          group = { y: item.y, items: [] };
          groups.push(group);
        }
        group.items.push(item);
      }
      groups.sort((a, b) => b.y - a.y);
      for (const group of groups) {
        group.items.sort((a, b) => a.x - b.x);
        const text = cleanWhitespace(group.items.map((item) => item.text).join(' '));
        if (text) allLines.push({ page: pageNumber, text });
      }
      page.cleanup();
      allLines.push({ page: pageNumber, text: `[[PAGE_BREAK_${pageNumber}]]` });
    }
  } finally {
    await loadingTask.destroy();
  }
  return allLines;
}

function fullDescriptionFromPdfLines(lines, record) {
  const target = normalizeForMatch(record.series_title);
  let start = -1;
  let endOfTitle = -1;

  for (let i = 0; i < lines.length; i += 1) {
    let combined = '';
    for (let width = 0; width < 4 && i + width < lines.length; width += 1) {
      const text = lines[i + width].text;
      if (/^\[\[PAGE_BREAK_/.test(text)) continue;
      combined = cleanWhitespace(`${combined} ${text}`);
      if (normalizeForMatch(combined).includes(target)) {
        start = i;
        endOfTitle = i + width;
        break;
      }
    }
    if (start >= 0) break;
  }
  if (start < 0) return null;

  let numberLine = -1;
  for (let i = start; i < Math.min(lines.length, start + 45); i += 1) {
    if (new RegExp(`\\b${record.series_number}\\b`).test(lines[i].text)) {
      numberLine = i;
      break;
    }
  }
  if (numberLine < 0) return null;

  const chunk = [];
  for (let i = start; i <= numberLine; i += 1) {
    const text = lines[i].text;
    if (/^\[\[PAGE_BREAK_/.test(text)) continue;
    if (i === numberLine) {
      chunk.push(text.split(new RegExp(`\\b${record.series_number}\\b`))[0]);
      break;
    }
    chunk.push(text);
  }

  let combined = cleanWhitespace(chunk.join(' '));
  const re = titleRegex(record.series_title);
  const match = re?.exec(combined);
  if (match) combined = combined.slice(match.index + match[0].length);
  const description = stripPdfNoise(combined);

  // Avoid replacing a usable database description with a bad layout parse.
  if (description.length < 20) return null;
  return description;
}

async function enrichDescriptionsFromCurrentPdf(schedule, records) {
  try {
    const lines = await extractPdfPhysicalLines(schedule.pdf_url);
    let enriched = 0;
    const output = records.map((record) => {
      const full = fullDescriptionFromPdfLines(lines, record);
      if (!full) return record;
      enriched += 1;
      return {
        ...record,
        series_description: full,
        text_to_embed: cleanWhitespace(`${record.series_title}: ${full}`),
      };
    });
    return { records: output, enriched, total: records.length, error: null };
  } catch (error) {
    return { records, enriched: 0, total: records.length, error: error.message || String(error) };
  }
}

async function querySchedule(form, schedule) {
  const optionValue = form.options.get(schedule.schedule_number);
  if (optionValue === undefined) {
    throw new Error(`${schedule.schedule_number} is listed on the current LVA site but is missing from the LVA search database form.`);
  }

  const params = new URLSearchParams(form.defaults);
  params.set(form.scheduleField, optionValue);

  let html;
  if (form.method === 'POST') {
    html = await fetchText(form.action, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        referer: LOCAL_SEARCH_URL,
      },
      body: params.toString(),
    });
  } else {
    const url = new URL(form.action);
    for (const [key, value] of params) url.searchParams.set(key, value);
    html = await fetchText(url.href, { headers: { referer: LOCAL_SEARCH_URL } });
  }

  const records = parseSearchResults(html, schedule);
  if (records.length === 0) {
    throw new Error(`No record series were parsed for ${schedule.schedule_number}. Sync stopped without replacing local data.`);
  }
  return records;
}

function validateDataset(schedules, records) {
  if (schedules.length < MIN_EXPECTED_LOCALITY_SCHEDULES) {
    throw new Error(
      `Only ${schedules.length} locality schedules were discovered; expected at least ${MIN_EXPECTED_LOCALITY_SCHEDULES}. ` +
      'The LVA site may have changed. No data will be replaced.'
    );
  }

  const scheduleCodes = new Set(schedules.map((s) => s.schedule_number));
  const seen = new Set();
  const counts = new Map();

  for (const row of records) {
    if (!scheduleCodes.has(row.schedule_number)) {
      throw new Error(`Unexpected schedule in parsed data: ${row.schedule_number}`);
    }
    const key = `${row.schedule_number}:${row.series_number}`;
    if (seen.has(key)) throw new Error(`Duplicate series detected: ${key}`);
    seen.add(key);
    counts.set(row.schedule_number, (counts.get(row.schedule_number) || 0) + 1);
  }

  const missing = schedules.filter((s) => !counts.get(s.schedule_number));
  if (missing.length) {
    throw new Error(`Schedules with zero parsed rows: ${missing.map((s) => s.schedule_number).join(', ')}`);
  }
  return counts;
}

export async function syncAllLocalitySchedules({ onProgress = () => {} } = {}) {
  onProgress('Discovering current locality schedules from the official LVA retention-schedules page...');
  const officialHtml = await fetchText(OFFICIAL_SCHEDULES_URL);
  const schedules = parseOfficialLocalityScheduleList(officialHtml);
  if (schedules.length < MIN_EXPECTED_LOCALITY_SCHEDULES) {
    throw new Error(`Discovered only ${schedules.length} locality schedules; refusing a potentially incomplete sync.`);
  }

  onProgress(`Discovered ${schedules.length} current locality General Schedules.`);
  const searchHtml = await fetchText(LOCAL_SEARCH_URL);
  const form = discoverSearchForm(searchHtml);

  const allRecords = [];
  const manifest = [];
  for (const [index, schedule] of schedules.entries()) {
    onProgress(`[${index + 1}/${schedules.length}] Reading ${schedule.schedule_number} - ${schedule.schedule_title}...`);
    const structuredRecords = await querySchedule(form, schedule);
    const enriched = await enrichDescriptionsFromCurrentPdf(schedule, structuredRecords);
    const records = enriched.records;
    allRecords.push(...records);
    manifest.push({
      ...schedule,
      record_series_count: records.length,
      pdf_full_description_matches: enriched.enriched,
      searchable_database_description_fallbacks: records.length - enriched.enriched,
      pdf_enrichment_error: enriched.error,
    });
    onProgress(
      `    ${records.length} record series parsed; ${enriched.enriched}/${records.length} descriptions matched back to the current official PDF.`
    );
    if (enriched.error) onProgress(`    PDF enrichment warning: ${enriched.error}`);
    // Keep request rate polite to the public LVA service.
    await sleep(150);
  }

  const counts = validateDataset(schedules, allRecords);
  return {
    schedules,
    records: allRecords,
    manifest,
    counts: Object.fromEntries(counts),
    source: {
      official_schedules_url: OFFICIAL_SCHEDULES_URL,
      searchable_database_url: LOCAL_SEARCH_URL,
      note: 'Current schedule list/PDF provenance comes from the official LVA schedule page. Structured fields are read from the LVA locality General Schedules searchable database, then descriptions are matched back to the current official PDFs when possible; unmatched rows safely keep the database description.',
    },
  };
}

export const lvaSyncConstants = Object.freeze({
  OFFICIAL_SCHEDULES_URL,
  LOCAL_SEARCH_URL,
  MIN_EXPECTED_LOCALITY_SCHEDULES,
});
