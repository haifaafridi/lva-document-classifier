import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOfficialLocalityScheduleList,
  discoverSearchForm,
  parseSearchResults,
} from '../src/services/lvaScheduleSyncService.js';

test('official schedule parser keeps locality GS-xx and excludes state GS-xxx', () => {
  const html = `
    <html><body>
      <p><a href="/pdf/GS-02.pdf">GS-02</a>, Fiscal Records (March 2024)</p>
      <p><a href="/pdf/GS-17.pdf">GS-17</a>, Law Enforcement, Fire and Emergency Services (June 2026)</p>
      <p><a href="/pdf/GS-102.pdf">GS-102</a>, Fiscal Records (March 2024)</p>
    </body></html>`;
  const rows = parseOfficialLocalityScheduleList(html, 'https://example.test/schedules');
  assert.deepEqual(rows.map((x) => x.schedule_number), ['GS-02', 'GS-17']);
  assert.equal(rows[0].schedule_title, 'Fiscal Records');
});

test('search-form discovery finds the select containing locality schedule codes', () => {
  const html = `
    <form method="post" action="results.asp">
      <select name="ScheduleNo">
        <option value="">All Schedules</option>
        <option value="02">GS-02</option>
        <option value="17">GS-17</option>
        <option value="01">GS-01</option>
      </select>
      <input name="SeriesTitle" value="" />
      <input type="submit" name="Submit" value="Search" />
    </form>`;
  const form = discoverSearchForm(html, 'https://example.test/search.asp');
  assert.equal(form.method, 'POST');
  assert.equal(form.action, 'https://example.test/results.asp');
  assert.equal(form.scheduleField, 'ScheduleNo');
  assert.equal(form.options.get('GS-17'), '17');
});

test('search-result parser creates Milvus-ready rows with text_to_embed and no id', () => {
  const html = `
    <html><body>
      <h1>Search Results</h1>
      <h2>GS-17: Law Enforcement, Fire and Emergency Services</h2>
      <p><strong>100802: Roll Call Files</strong></p>
      <p>This series documents officer attendance at meetings, briefings, inspections and other law enforcement activities.</p>
      <p>This series may include, but is not limited to: logs, rolls, rosters, and registers.</p>
      <p>Retention: Retain 3 year(s) after last action</p>
      <p>Disposition: Confidential Destruction</p>
      <p>Citation: Example</p>
      <p><strong>010143: Accounts Payable</strong></p>
      <p>This series documents moneys to be paid by the locality to its creditors.</p>
      <p>Retention: Retain 3 year(s) after end of state fiscal year</p>
      <p>Disposition: Non-confidential Destruction</p>
    </body></html>`;
  const schedule = {
    schedule_number: 'GS-17',
    schedule_title: 'Law Enforcement, Fire and Emergency Services',
  };
  const rows = parseSearchResults(html, schedule);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].series_number, '100802');
  assert.equal(rows[0].series_title, 'Roll Call Files');
  assert.match(rows[0].text_to_embed, /^Roll Call Files:/);
  assert.equal(rows[0].series_retention_period, '3 year(s) after last action');
  assert.equal(rows[0].series_disposition_method, 'Confidential Destruction');
  assert.equal('id' in rows[0], false);
});
