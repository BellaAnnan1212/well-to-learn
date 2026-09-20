// End Corporal Punishment, "Global progress towards prohibiting all corporal punishment", the
// legality table PDF, LAST UPDATED March 2025. Read with `pdftotext -layout`, ROWS ONLY.
//
// LICENCE, and the reason this fetcher is deliberately narrow: no licence is published on the table
// or its host page (checked by the storm's critic on 2026-09-04 and unchanged). The site therefore
// republishes ONE FACT PER COUNTRY with attribution and a link, and never the table, never the
// footnotes, never the totals as a dataset. Permission has been asked for in writing: until it is
// granted, this is the most the site takes.
//
// Two things the parser must not get wrong:
//   1. A name can wrap onto a second line ("Bosnia and" / "Herzegovina77"). The continuation line
//      is joined, never aliased away: an alias for a truncated name would silently match the wrong
//      state if the PDF ever re-wraps.
//   2. "Information in square brackets is unconfirmed" (the PDF's own words, p. 13). A bracketed
//      verdict is stored with confirmed:false and the card says so. Dropping the brackets would
//      turn the publisher's hedge into our certainty.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { cachedFetch, newestCache } from '../lib/fetch.mjs';

const URL_PDF = 'https://endcorporalpunishment.org/wp-content/uploads/legality-tables/Global-progress-table-commitment.pdf';

// Six settings, in the PDF's column order. Schools is the only one the site publishes in v1.
const COLUMNS = ['home', 'alternative_care', 'day_care', 'schools', 'penal', 'sentence'];
const VERDICT = /\[?(YES|NO|SOME)\]?\d{0,3}/g;
const ROW_START = /^\s{1,12}([A-Z][^\d]*?)\s*\d{0,3}\s{2,}\[?(?:YES|NO|SOME)\]?/;

export function parseTable(text) {
  const lines = text.split('\n');
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const verdicts = line.match(VERDICT) || [];
    if (verdicts.length < 6) continue;
    const m = ROW_START.exec(line);
    if (!m) continue;
    let name = m[1].trim();
    // A wrapped name: the next line carries the rest and no verdict of its own.
    const next = lines[i + 1] || '';
    if (/^\s{1,12}[A-Za-z]/.test(next) && !(next.match(VERDICT) || []).length && next.trim().length <= 24) {
      name = `${name} ${next.trim().replace(/\d{1,3}$/, '').trim()}`.replace(/\s+/g, ' ').trim();
    }
    const settings = {};
    verdicts.slice(0, 6).forEach((raw, idx) => {
      const confirmed = !raw.startsWith('[');
      const verdict = /YES|NO|SOME/.exec(raw)[0];
      settings[COLUMNS[idx]] = { verdict, confirmed };
    });
    rows.push({ name, settings });
  }
  return rows;
}

// The PDF's own summary line for the Schools column. It is read back so a parse that loses or
// invents rows fails the build instead of shipping a short table.
export function parseSchoolTotals(text) {
  const full = /^\s*Fully prohibited\s+(\d+)‡?\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m.exec(text);
  const not = /^\s*Not fully prohibited\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m.exec(text);
  if (!full || !not) return null;
  return { fully: Number(full[4]), notFully: Number(not[4]) };
}

export async function fetchCorporal({ offline, log }) {
  const pdf = await cachedFetch({ source: 'corporal', name: 'global-progress-table', ext: 'pdf', offline, binary: true, url: URL_PDF });
  const txtPath = pdf.file.replace(/\.pdf$/, '.txt');
  if (!fs.existsSync(txtPath)) {
    try {
      execFileSync('pdftotext', ['-layout', pdf.file, txtPath], { stdio: 'pipe' });
    } catch (err) {
      throw new Error(`corporal: pdftotext failed (${err.message}). Install poppler, or delete the cached PDF and retry.`);
    }
  }
  const text = fs.readFileSync(txtPath, 'utf8');

  const updated = /LAST UPDATED ([A-Z][a-z]+ \d{4})/.exec(text);
  if (!updated) throw new Error('corporal: no "LAST UPDATED" line in the PDF text; refusing to date the table myself');

  const rows = parseTable(text);
  const totals = parseSchoolTotals(text);
  const values = new Map();
  for (const row of rows) {
    const iso3 = log.byName('corporal', row.name);
    if (!iso3) continue;
    values.set(iso3, row.settings.schools);
  }

  return {
    school_corporal_punishment: {
      values,
      extracted: pdf.date,
      tableUpdated: updated[1],
      rowsParsed: rows.length,
      totals,
    },
  };
}

// Exposed so the offline rebuild can find the cached text without re-running pdftotext.
export function cachedText() {
  const hit = newestCache('corporal', 'global-progress-table', 'pdf');
  return hit ? hit.file.replace(/\.pdf$/, '.txt') : null;
}
