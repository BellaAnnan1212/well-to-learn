// Generic reader for tools/atlas/manual/*.csv: the hand-transcribed sources, where a person read a
// PDF and typed a number. Columns, fixed:
//
//   iso3,indicator,value,year,source_url,page,transcriber,date
//
// Every row carries the page it came from and who typed it, because a hand-transcribed value has
// no API to re-check it against: the page cite IS the audit trail. A row missing any column is
// REFUSED, not skipped, so a half-typed line can never become a published number.
//
// The WHO Mental Health Atlas 2024 country profiles (about 90 PDFs) are the first user of this.
// Until a row exists for a country, its Atlas block is NOT "no programme" and NOT zero: it reads
// "not yet read from the WHO profile", which is a statement about this site, not about that
// country. Those are different facts and the site never merges them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MANUAL_DIR = path.join(HERE, '..', 'manual');
const COLUMNS = ['iso3', 'indicator', 'value', 'year', 'source_url', 'page', 'transcriber', 'date'];

// A small CSV reader: quoted fields with doubled quotes, no embedded newlines.
export function parseCsv(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

export function readManual({ log }) {
  const out = new Map(); // indicator -> Map(iso3 -> row)
  const files = fs.existsSync(MANUAL_DIR)
    ? fs.readdirSync(MANUAL_DIR).filter((f) => f.endsWith('.csv')).sort()
    : [];
  const refusals = [];
  let rowCount = 0;

  for (const file of files) {
    const rows = parseCsv(fs.readFileSync(path.join(MANUAL_DIR, file), 'utf8'));
    if (rows.length === 0) continue;
    const header = rows[0];
    if (header.join(',') !== COLUMNS.join(',')) {
      refusals.push(`${file}: header is "${header.join(',')}", expected "${COLUMNS.join(',')}"`);
      continue;
    }
    for (const [n, cells] of rows.slice(1).entries()) {
      const row = Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i] ?? '']));
      const missing = COLUMNS.filter((c) => !row[c]);
      if (missing.length) {
        refusals.push(`${file}:${n + 2}: missing ${missing.join(', ')}`);
        continue;
      }
      const iso3 = log.byCode(`manual:${file}`, row.iso3);
      if (!iso3) continue;
      if (!out.has(row.indicator)) out.set(row.indicator, new Map());
      out.get(row.indicator).set(iso3, {
        value: Number.isNaN(Number(row.value)) ? row.value : Number(row.value),
        year: Number(row.year),
        source_url: row.source_url,
        page: row.page,
        transcriber: row.transcriber,
        verified: row.date,
      });
      rowCount += 1;
    }
  }

  return { byIndicator: out, refusals, files, rowCount };
}
