#!/usr/bin/env node
// build-methodology.mjs: site/data/{atlas,indicators,sources}.json + docs/coverage.md +
// data/verification/spotcheck-*.csv + content/rights/ -> site/methodology/index.html
//
//   node tools/build-methodology.mjs [--root <repo>]
//
// WHY THIS PAGE IS GENERATED. Methodology is the page that says how many values are stale, how many
// states have a number, which names were deliberately left out and what the last spot check found.
// Every one of those moves when the data is rebuilt. A count typed into HTML is right on the day it
// is typed and wrong, silently, from the next build on. So no number on that page is typed: each is
// counted here, from the same files the Atlas itself reads, in the same run that writes the page.
//
// REFUSES (exit 1, nothing written) when a file it counts from is missing, when docs/coverage.md
// does not say in so many words that there were no failed joins (the page states that there were
// none, so it must be read, not assumed), or when no spot-check file exists.
// Output is deterministic: run twice, no diff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, parseArgs, readJson, render, writeIfChanged } from './lib/common.mjs';
import { loadPartials, stampHtml } from './stamp.mjs';

const REL_PATH = 'methodology/index.html';
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-09-19" -> "19 September 2026". Anything else is returned untouched.
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// A tiny CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// The rows of the "Deliberately ignored" table in docs/coverage.md, and whether the failed-joins
// section says there were none.
export function readCoverage(md) {
  const section = (title) => {
    const m = new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm').exec(`${md}\n## `);
    return m ? m[1] : null;
  };
  const failed = section('Failed joins');
  const ignoredText = section('Deliberately ignored');
  const ignored = [];
  if (ignoredText) {
    for (const line of ignoredText.split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 5 || cells[1] === 'Source' || /^-+$/.test(cells[1])) continue;
      ignored.push({ source: cells[1], name: cells[2], rows: Number(cells[3]) });
    }
  }
  return { noFailedJoins: failed !== null && /^\s*None\./.test(failed), ignored, hasIgnoredSection: ignoredText !== null };
}

// What each name on the ignore list is, in words a reader can check. A name that is not explained
// here is printed with the plain statement that it has no ISO 3166-1 code, and nothing more.
const IGNORED_WHY = {
  'Republic of Kosovo': 'Kosovo has no ISO 3166-1 code',
  XKX: 'the World Bank\'s own code for Kosovo, which has no ISO 3166-1 code',
  'European Union': 'the European Union is a party to the treaty and is not a state',
  CHI: 'the World Bank\'s code for the Channel Islands, which ISO lists as Jersey and Guernsey and not as one state',
};

export function collect(L) {
  const problems = [];
  const dataDir = path.join(L.site, 'data');
  const need = (file) => {
    if (!fs.existsSync(file)) problems.push(`missing ${path.relative(L.root, file)}`);
    return fs.existsSync(file);
  };
  const files = {
    atlas: path.join(dataDir, 'atlas.json'),
    indicators: path.join(dataDir, 'indicators.json'),
    sources: path.join(dataDir, 'sources.json'),
    coverage: path.join(L.root, 'docs', 'coverage.md'),
    chapters: path.join(L.root, 'content', 'rights', 'chapters.json'),
  };
  for (const f of Object.values(files)) need(f);
  const verDir = path.join(L.root, 'data', 'verification');
  const spotFiles = fs.existsSync(verDir) ? fs.readdirSync(verDir).filter((f) => /^spotcheck-\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort() : [];
  if (spotFiles.length === 0) problems.push('no data/verification/spotcheck-YYYY-MM-DD.csv');
  if (problems.length) return { problems };

  const atlas = readJson(files.atlas);
  const indicators = readJson(files.indicators);
  const sources = readJson(files.sources);
  const coverage = readCoverage(fs.readFileSync(files.coverage, 'utf8'));
  if (!coverage.noFailedJoins) problems.push('docs/coverage.md does not say "None." under "Failed joins": the page may not claim there were none');
  if (!coverage.hasIgnoredSection) problems.push('docs/coverage.md has no "Deliberately ignored" section');

  const countries = Object.values(atlas.countries);
  const sourceById = new Map(sources.sources.map((s) => [s.id, s]));
  const nameOf = new Map(countries.map((c) => [c.iso3, c.name]));

  let staleTotal = 0;
  let natEst = 0;
  let unconfirmed = 0;
  const zeros = [];
  const rows = indicators.indicators.map((ind) => {
    const fields = countries.map((c) => [c, c.indicators[ind.id]]).filter(([, f]) => f && f.value !== null && f.value !== undefined);
    const years = fields.map(([, f]) => f.year).filter((y) => typeof y === 'number').sort((a, b) => a - b);
    const stale = fields.filter(([, f]) => f.stale).length;
    staleTotal += stale;
    natEst += fields.filter(([, f]) => f.qualifier === 'NAT_EST').length;
    unconfirmed += fields.filter(([, f]) => f.confirmed === false).length;
    for (const [c, f] of fields) if (f.reported_zero) zeros.push({ indicator: ind.short, name: nameOf.get(c.iso3) });
    const src = sourceById.get(ind.source);
    if (!src) problems.push(`indicator ${ind.id} names source ${ind.source}, which is not in sources.json`);
    let yearText = 'no year: a legal or yes-or-no fact';
    if (years.length) yearText = years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]} to ${years[years.length - 1]}`;
    return {
      label: ind.label,
      kind: ind.kind,
      publisher: src ? src.publisher : '',
      have: fields.length,
      years: yearText,
      limit: typeof ind.max_age === 'number' ? `${ind.max_age} years` : 'none',
      stale: typeof ind.max_age === 'number' ? String(stale) : 'not applicable',
      note: ind.note,
      on_map: ind.layer ? 'a map layer' : 'on the country card only',
    };
  });

  // The newest spot check.
  const spotFile = spotFiles[spotFiles.length - 1];
  const spot = parseCsv(fs.readFileSync(path.join(verDir, spotFile), 'utf8'));
  const verdicts = { CONFIRMED: 0, REFUTED: 0, 'CANNOT VERIFY': 0 };
  for (const r of spot) {
    if (!(r.verdict in verdicts)) problems.push(`${spotFile}: unknown verdict "${r.verdict}"`);
    else verdicts[r.verdict] += 1;
  }
  const spotCountries = [...new Set(spot.map((r) => r.country.replace(/^[A-Z]{3} \((.*)\)$/, '$1')))].sort();
  const cannotIndicators = [...new Set(spot.filter((r) => r.verdict === 'CANNOT VERIFY').map((r) => r.indicator))];
  const cannotLabels = cannotIndicators.map((id) => (indicators.indicators.find((i) => i.id === id) || { label: id }).label);

  const manifest = readJson(files.chapters);
  const contentDir = path.dirname(files.chapters);
  const published = fs.readdirSync(contentDir).filter((f) => /^ch-\d\d-.*\.md$/.test(f)).length;
  const profilesFile = path.join(dataDir, 'profiles.public.json');
  const profiles = fs.existsSync(profilesFile) ? readJson(profilesFile).length : 0;

  const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

  const view = {
    built: longDate(atlas.built),
    state_count: countries.length,
    indicator_count: indicators.indicators.length,
    indicator_word: word(indicators.indicators.length),
    layer_count: indicators.indicators.filter((i) => i.layer).length,
    rows,
    stale_total: staleTotal,
    nat_est: natEst,
    unconfirmed,
    zero_count: zeros.length,
    zeros: list(zeros.map((z) => `${z.name} (${z.indicator})`)),
    has_zeros: zeros.length > 0,
    ignored: coverage.ignored.map((i) => ({
      name: i.name,
      source: i.source,
      rows: i.rows,
      row_word: i.rows === 1 ? 'row' : 'rows',
      why: IGNORED_WHY[i.name] || 'it has no ISO 3166-1 code',
    })),
    ignored_count: coverage.ignored.length,
    spot_date: longDate(spotFile.slice('spotcheck-'.length, -'.csv'.length)),
    spot_rows: spot.length,
    spot_countries: list(spotCountries),
    spot_country_count: word(spotCountries.length),
    spot_confirmed: verdicts.CONFIRMED,
    spot_refuted: verdicts.REFUTED,
    spot_cannot: verdicts['CANNOT VERIFY'],
    has_cannot: verdicts['CANNOT VERIFY'] > 0,
    spot_cannot_labels: list(cannotLabels),
    sources: sources.sources.map((s) => ({
      name: s.name,
      url: s.url,
      publisher: s.publisher,
      licence: s.licence,
      attribution: s.attribution,
      may_not: s.may_not,
      read: s.extracted ? `Read ${longDate(s.extracted)}.` : 'Not read into the Atlas yet.',
    })),
    chapters_total: manifest.length,
    chapters_published: published,
    chapters_published_word: published === 1 ? 'one is' : `${word(published)} are`,
    chapters_published_is_digit: false,
    profiles,
    profiles_none: profiles === 0,
    profiles_some: profiles > 0,
  };
  return { problems, view };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  const { problems, view } = collect(L);
  if (problems.length) {
    console.error(`build-methodology: refusing to build; ${problems.length} problem(s), nothing written.`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  const config = readJson(L.config);
  const partials = loadPartials(L.partials);
  const tpl = fs.readFileSync(path.join(L.templates, 'methodology.html'), 'utf8');
  const full = { ...view, site: config, version: config.version, root: '../' };
  const { html, missing } = stampHtml(render(tpl, full), { config, partials, relPath: REL_PATH, version: config.version });
  if (missing.length) {
    console.error(`build-methodology: template methodology.html lacks marker pair(s): ${missing.join(', ')}`);
    return 1;
  }
  const wrote = writeIfChanged(path.join(L.site, REL_PATH), html);
  console.log(`build-methodology: ${view.state_count} states, ${view.indicator_count} indicators, ${view.stale_total} stale, spot check ${view.spot_confirmed}/${view.spot_rows}. ${wrote ? 'written' : 'unchanged'}  site/${REL_PATH}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
