#!/usr/bin/env node
// spotcheck-sheet.mjs: writes the SITE HALF of a spot-check sheet, ready for a fresh-context
// Critic to fill in the source half.
//
//   node tools/atlas/spotcheck-sheet.mjs [--out data/verification/spotcheck-<today>.csv]
//
// It prints, for five countries across income groups and every indicator, exactly what the site
// says today. It deliberately leaves `source value`, `source url` and `verdict` EMPTY and sets
// `verdict` to REFUTED, because the plan's rule is that a check defaults to refuted: a blank
// verdict that quietly reads as a pass is the failure mode this whole file exists to prevent.
//
// It never opens a source. Reading the source is the Critic's job, in a fresh context, against
// the live page, never against data/raw/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, parseArgs, readJson, todayIso } from '../lib/common.mjs';

export const COUNTRIES = ['NOR', 'USA', 'BRA', 'PHL', 'ETH'];

function csvCell(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function siteValue(field, spec) {
  if (!field || field.value === null || field.value === undefined) return 'no data';
  let shown;
  if (typeof field.value === 'number') {
    shown = field.value.toFixed(typeof spec.decimals === 'number' ? spec.decimals : 1);
  } else if (typeof field.value === 'boolean') {
    shown = field.value ? 'profiled' : 'not profiled';
  } else {
    shown = String(field.value);
  }
  const bits = [shown];
  if (field.year) bits.push(`(${field.year})`);
  if (field.reported_zero) bits.push('[reported zero]');
  if (field.confirmed === false) bits.push('[unconfirmed in source table]');
  if (field.status_as_at) bits.push(`[UN status as at ${field.status_as_at}]`);
  return bits.join(' ');
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const today = todayIso();
  const atlas = readJson(path.join(REPO_ROOT, 'site', 'data', 'atlas.json'));
  const indicators = readJson(path.join(REPO_ROOT, 'site', 'data', 'indicators.json'));
  const out = args.out || path.join(REPO_ROOT, 'data', 'verification', `spotcheck-${today}.csv`);

  const lines = ['country,indicator,site value,source value,source url,verdict,checked by,date'];
  let rows = 0;
  for (const iso3 of COUNTRIES) {
    const rec = atlas.countries[iso3];
    if (!rec) throw new Error(`spotcheck: ${iso3} is not in atlas.json`);
    for (const spec of indicators.indicators) {
      lines.push([
        `${iso3} (${rec.name})`,
        spec.id,
        siteValue(rec.indicators[spec.id], spec),
        '', // the Critic fills this from the live source
        '',
        'REFUTED', // the default, per the plan: a check is refuted until something confirms it
        '',
        today,
      ].map(csvCell).join(','));
      rows += 1;
    }
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`spotcheck sheet: ${rows} rows for ${COUNTRIES.length} countries x ${indicators.indicators.length} indicators -> ${path.relative(REPO_ROOT, out)}`);
  console.log('Every verdict starts REFUTED. A fresh-context Critic fills source value, source url and verdict from the LIVE source.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
