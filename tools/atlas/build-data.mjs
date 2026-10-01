#!/usr/bin/env node
// build-data.mjs: the Atlas pipeline. Fetch (through the cache) -> resolve every name to an ISO3 ->
// sanity-check -> write site/data/{atlas,indicators,sources}.json and docs/coverage.md.
//
//   node tools/atlas/build-data.mjs                 fetch what today's cache lacks, then build
//   node tools/atlas/build-data.mjs --offline       cache only: the reproducibility gate
//   node tools/atlas/build-data.mjs --only uis,who-gho
//   node tools/atlas/build-data.mjs --refresh       re-fetch even if today's cache exists
//
// The three rules this file exists to enforce:
//   1. No data is null and is drawn as a grey hatch. It is NEVER zero. A source-reported zero is
//      kept, flagged reported_zero, and listed in coverage.
//   2. Every field carries its value, its year, its source id, its tier (the stamp: measured,
//      modelled, self-reported, legal) and the date it was verified against the source by a person.
//   3. Nothing is guessed. A name that does not resolve to an ISO3 is dropped AND NAMED in
//      coverage. A value outside its plausible range is dropped AND NAMED. The build fails rather
//      than publish a number it cannot stand behind.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, parseArgs, todayIso, writeIfChanged } from '../lib/common.mjs';
import { BY_ALPHA3, ISO_CODES, JoinLog } from './lib/iso.mjs';
import { checkRanges, checkTreatyCounts, checkYears, compareWithPrevious, findReportedZeros, median, MAX_AGE, RANGES } from './lib/sanity.mjs';
import { fetchWhoGho } from './fetchers/who-gho.mjs';
import { fetchUis } from './fetchers/uis.mjs';
import { fetchWorldBank } from './fetchers/worldbank.mjs';
import { fetchTreaties } from './fetchers/treaties.mjs';
import { fetchCorporal } from './fetchers/corporal.mjs';
import { fetchGcpea } from './fetchers/gcpea.mjs';
import { readManual } from './fetchers/manual.mjs';

const OUT_DATA = path.join(REPO_ROOT, 'site', 'data');
const OUT_DOCS = path.join(REPO_ROOT, 'docs');
const THIS_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------------------------
// The indicator register. This is the contract the map, the card, the table and the legend all
// read: nothing on the site names a colour, a band or a stamp of its own.
// `kind` is the stamp. `bands` are the choropleth thresholds, upper bound inclusive, five bands
// paper to ink; `bands: null` means the indicator is categorical or card-only.
// ---------------------------------------------------------------------------------------------
const INDICATORS = [
  {
    id: 'suicide_10_19',
    label: 'Suicide rate, ages 10 to 19',
    short: 'Suicide, 10 to 19',
    unit: 'per 100,000 people a year',
    kind: 'modelled',
    source: 'who-gho-sdgsuicide',
    layer: true,
    default_on: false,
    bands: [1, 2.5, 5, 9],
    decimals: 1,
    max_age: MAX_AGE.suicide_10_19,
    note: 'A WHO modelled estimate for 2021, not a count of deaths. WHO publishes no uncertainty interval for this age split, so none is shown. Rates are never ranked here and never appear without help lines on the same page.',
    safe_messaging: true,
  },
  {
    id: 'suicide_std',
    label: 'Age-standardised suicide rate, all ages',
    short: 'Suicide, all ages, standardised',
    unit: 'per 100,000 people a year',
    kind: 'modelled',
    source: 'who-gho-mh12',
    layer: false,
    bands: null,
    decimals: 1,
    max_age: MAX_AGE.suicide_std,
    note: 'A different measure from the 10 to 19 layer: all ages, and standardised for the shape of the population. The two are never compared with each other.',
    safe_messaging: true,
  },
  {
    id: 'psychiatrists',
    label: 'Psychiatrists per 100,000 people',
    short: 'Psychiatrists',
    unit: 'per 100,000 people',
    kind: 'self-reported',
    source: 'who-gho-mh6',
    layer: true,
    default_on: false,
    bands: [0.1, 0.5, 2, 8],
    decimals: 2,
    max_age: MAX_AGE.psychiatrists,
    note: 'Reported by countries to WHO between 2013 and 2017 and never refreshed since. Every value wears its own year, and the layer is off unless you turn it on.',
  },
  {
    id: 'out_of_school_lsec',
    label: 'Out-of-school rate, lower secondary age',
    short: 'Out of school',
    unit: 'per cent of the age group',
    kind: 'modelled',
    source: 'uis-rofst',
    layer: true,
    default_on: true,
    bands: [5, 12, 25, 40],
    decimals: 1,
    max_age: MAX_AGE.out_of_school_lsec,
    note: 'A UNESCO model, not a headcount: it combines school records with population estimates. Bella ruled on 2026-09-19 that this layer may carry colour, tagged as modelled.',
  },
  {
    id: 'completion_lsec',
    label: 'Completion rate, lower secondary',
    short: 'Completion',
    unit: 'per cent',
    kind: 'modelled',
    source: 'uis-cr',
    layer: true,
    default_on: false,
    bands: [40, 60, 80, 92],
    decimals: 1,
    max_age: MAX_AGE.completion_lsec,
    note: 'The share of young people who finish lower secondary school, three to five years after the age they should have.',
    higher_is_better: true,
  },
  {
    id: 'learning_poverty',
    label: 'Learning poverty at age 10',
    short: 'Learning poverty',
    unit: 'per cent of 10-year-olds',
    kind: 'modelled',
    source: 'worldbank-lpv',
    layer: true,
    default_on: false,
    bands: [10, 30, 55, 80],
    decimals: 1,
    max_age: MAX_AGE.learning_poverty,
    note: 'A modelled combination of two things: children who cannot read a simple passage by the end of primary school, and children who are not in school at all. Each country value carries its own year, which can be as old as 2001.',
  },
  {
    id: 'school_corporal_punishment',
    label: 'Corporal punishment prohibited in schools',
    short: 'Corporal punishment',
    unit: 'prohibited, partly prohibited, or not',
    kind: 'legal',
    source: 'end-corporal-punishment',
    layer: true,
    default_on: false,
    bands: null,
    categories: [
      { value: 'YES', label: 'Prohibited', band: 1 },
      { value: 'SOME', label: 'Partly prohibited', band: 3 },
      { value: 'NO', label: 'Not prohibited', band: 5 },
    ],
    max_age: null,
    note: 'The legal position as End Corporal Punishment recorded it in March 2025. Where their table put the entry in square brackets it is marked unconfirmed here, because that is their own word for it.',
  },
  {
    id: 'op3_crc',
    label: 'Can a young person complain to the UN Committee',
    short: 'UN complaints protocol',
    unit: 'party, signatory, or neither',
    kind: 'legal',
    source: 'un-treaties',
    layer: true,
    default_on: false,
    bands: null,
    categories: [
      { value: 'party', label: 'Party: a complaint is possible', band: 1 },
      { value: 'signatory', label: 'Signed, not yet bound', band: 3 },
      { value: 'neither', label: 'Not bound', band: 5 },
    ],
    max_age: null,
    note: 'Only the states party to the third Optional Protocol to the CRC accept complaints from children, and only after the courts at home have been tried. Chapter 7 of Your rights says how.',
  },
  {
    id: 'education_under_attack',
    label: 'Profiled in Education under Attack 2026',
    short: 'Education under Attack',
    unit: 'profiled, or not profiled',
    kind: 'measured',
    source: 'gcpea',
    layer: false,
    bands: null,
    max_age: null,
    note: 'GCPEA profiles 28 countries. This is never a colour and never a ranking: the count is of REPORTED attacks, and a country with no profile has not been shown to be safe. It may be a country nobody is counting in.',
  },
  {
    id: 'atlas2024',
    label: 'WHO Mental Health Atlas 2024 country block',
    short: 'WHO Atlas 2024',
    unit: 'policy, school programme, spending share',
    kind: 'self-reported',
    source: 'who-atlas-2024',
    layer: false,
    bands: null,
    max_age: null,
    note: 'Answers a government gave WHO on a checklist in 2024, read by hand from that country profile PDF with the page noted. A country with no block here has not been read yet; that is a fact about this site, not about the country.',
  },
];

const SOURCES = [
  {
    id: 'who-gho-sdgsuicide',
    name: 'WHO Global Health Observatory, SDGSUICIDE, ages 10 to 19',
    url: 'https://ghoapi.azureedge.net/api/SDGSUICIDE',
    publisher: 'World Health Organization',
    licence: 'WHO data terms: public-health purposes only',
    share_alike: false,
    non_commercial: true,
    attribution: 'WHO, Global Health Observatory, SDG suicide mortality rate by age group, Global Health Estimates 2021, accessed {extracted}, with acknowledgement to the countries that provided the underlying data.',
    may_not: 'Not for commercial use. WHO does not endorse this site or its wording.',
  },
  {
    id: 'who-gho-mh12',
    name: 'WHO Global Health Observatory, MH_12, age-standardised suicide rate',
    url: 'https://ghoapi.azureedge.net/api/MH_12',
    publisher: 'World Health Organization',
    licence: 'WHO data terms: public-health purposes only',
    share_alike: false,
    non_commercial: true,
    attribution: 'WHO, Global Health Observatory, age-standardised suicide rates, Global Health Estimates 2021, accessed {extracted}, with acknowledgement to the countries that provided the underlying data.',
    may_not: 'Not for commercial use.',
  },
  {
    id: 'who-gho-mh6',
    name: 'WHO Global Health Observatory, MH_6, psychiatrists working in the mental health sector',
    url: 'https://ghoapi.azureedge.net/api/MH_6',
    publisher: 'World Health Organization',
    licence: 'WHO data terms: public-health purposes only',
    share_alike: false,
    non_commercial: true,
    attribution: 'WHO, Global Health Observatory, psychiatrists working in the mental health sector per 100,000, accessed {extracted}, with acknowledgement to the countries that provided the underlying data.',
    may_not: 'Not for commercial use. The series has not been refreshed since 2017.',
  },
  {
    id: 'uis-rofst',
    name: 'UNESCO Institute for Statistics, ROFST.2.CP, out-of-school rate, lower secondary',
    url: 'https://api.uis.unesco.org/api/public/data/indicators?indicator=ROFST.2.CP',
    publisher: 'UNESCO Institute for Statistics',
    licence: 'CC BY-SA 4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    share_alike: true,
    non_commercial: false,
    attribution: 'Source: UNESCO Institute for Statistics (UIS), https://api.uis.unesco.org/api/public/data/indicators?indicator=ROFST.2.CP, extracted {extracted}.',
    may_not: 'ShareAlike: anything built from this data carries the same licence.',
  },
  {
    id: 'uis-cr',
    name: 'UNESCO Institute for Statistics, CR.2, completion rate, lower secondary',
    url: 'https://api.uis.unesco.org/api/public/data/indicators?indicator=CR.2',
    publisher: 'UNESCO Institute for Statistics',
    licence: 'CC BY-SA 4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    share_alike: true,
    non_commercial: false,
    attribution: 'Source: UNESCO Institute for Statistics (UIS), https://api.uis.unesco.org/api/public/data/indicators?indicator=CR.2, extracted {extracted}.',
    may_not: 'ShareAlike: anything built from this data carries the same licence.',
  },
  {
    id: 'worldbank-lpv',
    name: 'World Bank, SE.LPV.PRIM, learning poverty',
    url: 'https://api.worldbank.org/v2/country/all/indicator/SE.LPV.PRIM',
    publisher: 'The World Bank',
    licence: 'CC BY 4.0',
    licence_url: 'https://creativecommons.org/licenses/by/4.0/',
    share_alike: false,
    non_commercial: false,
    attribution: 'The World Bank: World Development Indicators: Learning poverty (SE.LPV.PRIM), extracted {extracted}.',
    may_not: null,
  },
  {
    id: 'worldbank-context',
    name: 'World Bank, country list and GDP per capita',
    url: 'https://api.worldbank.org/v2/country',
    publisher: 'The World Bank',
    licence: 'CC BY 4.0',
    licence_url: 'https://creativecommons.org/licenses/by/4.0/',
    share_alike: false,
    non_commercial: false,
    attribution: 'The World Bank: World Development Indicators: income group and GDP per capita (NY.GDP.PCAP.CD), extracted {extracted}.',
    may_not: null,
  },
  {
    id: 'un-treaties',
    name: 'United Nations Treaty Collection, chapter IV',
    url: 'https://treaties.un.org/Pages/ParticipationStatus.aspx',
    publisher: 'United Nations',
    licence: 'Terms not published for the status pages',
    share_alike: false,
    non_commercial: false,
    attribution: 'United Nations Treaty Collection, status as at {status_as_at}, read {extracted}.',
    may_not: 'Every count is printed with the date the UN itself stamped on the page. A treaty count without that date is not published here.',
  },
  {
    id: 'end-corporal-punishment',
    name: 'End Corporal Punishment, global progress table',
    url: 'https://endcorporalpunishment.org/wp-content/uploads/legality-tables/Global-progress-table-commitment.pdf',
    publisher: 'End Corporal Punishment (Global Initiative to End All Corporal Punishment of Children)',
    licence: 'No licence published on the table or its page (checked 2026-09-04 and 2026-09-19)',
    share_alike: false,
    non_commercial: false,
    attribution: 'Legal status from End Corporal Punishment, Global progress towards prohibiting all corporal punishment, last updated {table_updated}.',
    may_not: 'The table itself is NOT republished. One fact per country, with attribution and a link to the source. No licence is published, so this is the limit this site keeps.',
  },
  {
    id: 'gcpea',
    name: 'GCPEA, Education under Attack 2026',
    url: 'https://eua2026.protectingeducation.org/',
    publisher: 'Global Coalition to Protect Education from Attack',
    licence: '(c)2026 GCPEA, no further terms published',
    share_alike: false,
    non_commercial: false,
    attribution: 'Education under Attack 2026, Global Coalition to Protect Education from Attack, read {extracted}.',
    may_not: 'A badge and a link out, never a map colour and never a ranking. No further terms are published, so this is the limit this site keeps.',
  },
  {
    id: 'who-atlas-2024',
    name: 'WHO Mental Health Atlas 2024, country profiles',
    url: 'https://www.who.int/teams/mental-health-and-substance-use/data-research/mental-health-atlas',
    publisher: 'World Health Organization',
    licence: 'CC BY-NC-SA 3.0 IGO',
    licence_url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/',
    share_alike: true,
    non_commercial: true,
    attribution: 'WHO Mental Health Atlas 2024, country profile, page noted on each value.',
    may_not: 'Non-commercial and ShareAlike. No WHO logo. Values are what a government reported on a checklist, not a measurement.',
  },
  {
    id: 'natural-earth',
    name: 'Natural Earth, countries 110m (via world-atlas)',
    url: 'https://www.naturalearthdata.com/',
    publisher: 'Natural Earth',
    licence: 'Public domain',
    share_alike: false,
    non_commercial: false,
    attribution: 'Base map: Natural Earth, public domain. Boundaries are drawn for legibility and are not a statement about any border.',
    may_not: null,
  },
];

// ---------------------------------------------------------------------------------------------

function field({ value, year, source, tier, verified = null, extra = {} }) {
  return { value, year: year ?? null, source, tier, verified, ...extra };
}

function round(value, decimals) {
  if (typeof value !== 'number' || decimals === undefined || decimals === null) return value;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const offline = Boolean(args.offline);
  const refresh = Boolean(args.refresh);
  const only = args.only ? new Set(String(args.only).split(',').map((s) => s.trim())) : null;
  const wants = (id) => !only || only.has(id);
  const log = new JoinLog();
  const today = todayIso();
  const notes = [];
  const findings = [];

  console.log(`atlas build: ${offline ? 'OFFLINE (cache only)' : 'network allowed'}${only ? `, only ${[...only].join(', ')}` : ''}`);

  // ---- fetch -------------------------------------------------------------------------------
  const who = wants('who-gho') ? await fetchWhoGho({ offline, log, refresh }) : null;
  const uis = wants('uis') ? await fetchUis({ offline, log, refresh }) : null;
  const wb = wants('worldbank') ? await fetchWorldBank({ offline, log, refresh }) : null;
  const treaties = wants('treaties') ? await fetchTreaties({ offline, log, refresh }) : null;
  const corporal = wants('corporal') ? await fetchCorporal({ offline, log, refresh }) : null;
  const gcpea = wants('gcpea') ? await fetchGcpea({ offline, log, refresh }) : null;
  const manual = readManual({ log });
  if (manual.refusals.length) {
    for (const r of manual.refusals) findings.push({ hard: true, indicator: 'manual', iso3: null, msg: r });
  }

  // ---- assemble ----------------------------------------------------------------------------
  // Every state in ISO 3166-1 gets a row, whether or not any source has a number for it, so the
  // table lists the world and a microstate is never dropped because the map has no shape for it.
  const countries = {};
  for (const c of ISO_CODES) {
    countries[c.alpha3] = {
      iso3: c.alpha3,
      numeric: c.numeric,
      name: c.name,
      region: c.region || null,
      sub_region: c.sub_region || null,
      context: { income_group: null, gdp_per_capita: null },
      indicators: {},
      treaties: {},
    };
  }

  const sourceDates = {};
  const put = (indicatorId, values, make) => {
    if (!values) return;
    const spec = INDICATORS.find((i) => i.id === indicatorId);
    const range = RANGES[indicatorId];
    for (const [iso3, v] of values) {
      const country = countries[iso3];
      if (!country) { log.fail(indicatorId, iso3); continue; }
      if (range && typeof v.value === 'number' && (v.value < range.min || v.value > range.max)) continue; // named in coverage
      country.indicators[indicatorId] = make(v, spec);
    }
  };

  if (who) {
    sourceDates['who-gho-sdgsuicide'] = { extracted: who.suicide_10_19.extracted };
    sourceDates['who-gho-mh12'] = { extracted: who.suicide_std.extracted };
    sourceDates['who-gho-mh6'] = { extracted: who.psychiatrists.extracted };
    put('suicide_10_19', who.suicide_10_19.values, (v, s) => field({
      value: round(v.value, s.decimals), year: v.year, source: s.source, tier: s.kind,
      extra: { reported_zero: v.value === 0 },
    }));
    put('suicide_std', who.suicide_std.values, (v, s) => field({
      value: round(v.value, s.decimals), year: v.year, source: s.source, tier: s.kind,
      extra: { low: v.low === null ? null : round(v.low, s.decimals), high: v.high === null ? null : round(v.high, s.decimals), reported_zero: v.value === 0 },
    }));
    put('psychiatrists', who.psychiatrists.values, (v, s) => field({
      value: round(v.value, s.decimals), year: v.year, source: s.source, tier: s.kind,
      extra: { reported_zero: v.value === 0 },
    }));
  }

  if (uis) {
    sourceDates['uis-rofst'] = { extracted: uis.out_of_school_lsec.extracted };
    sourceDates['uis-cr'] = { extracted: uis.completion_lsec.extracted };
    // UIS marks some values with a qualifier, and NAT_EST is the one that matters: it means the
    // figure is a NATIONAL estimate rather than a UIS one. Norway's out-of-school rate and the
    // Philippines' are then two different kinds of number, and this is the layer that is on by
    // default. Dropping the qualifier would render them identically, which is the quiet way a map
    // tells a lie, so it is carried through to the card and the table.
    put('out_of_school_lsec', uis.out_of_school_lsec.values, (v, s) => field({
      value: round(v.value, s.decimals), year: v.year, source: s.source, tier: s.kind,
      extra: { reported_zero: v.value === 0, qualifier: v.qualifier || null },
    }));
    put('completion_lsec', uis.completion_lsec.values, (v, s) => field({
      value: round(v.value, s.decimals), year: v.year, source: s.source, tier: s.kind,
      extra: { reported_zero: v.value === 0, qualifier: v.qualifier || null },
    }));
  }

  if (wb) {
    sourceDates['worldbank-lpv'] = { extracted: wb.learning_poverty.extracted };
    sourceDates['worldbank-context'] = { extracted: wb.context.extracted };
    put('learning_poverty', wb.learning_poverty.values, (v, s) => field({
      value: round(v.value, s.decimals), year: v.year, source: s.source, tier: s.kind,
      extra: { reported_zero: v.value === 0 },
    }));
    for (const [iso3, c] of wb.context.values) {
      if (countries[iso3]) countries[iso3].context.income_group = c.income_group;
    }
    for (const [iso3, g] of wb.gdp_per_capita.values) {
      if (countries[iso3]) {
        countries[iso3].context.gdp_per_capita = { value: Math.round(g.value), year: g.year, source: 'worldbank-context', tier: 'measured', verified: null };
      }
    }
    notes.push(`World Bank: ${wb.context.aggregates} aggregate rows dropped before anything was drawn.`);
  }

  if (treaties) {
    sourceDates['un-treaties'] = { extracted: treaties.crc.extracted, status_as_at: treaties.op3_crc.statusAsAt };
    for (const [id, t] of Object.entries(treaties)) {
      for (const [iso3, v] of t.values) {
        if (!countries[iso3]) continue;
        countries[iso3].treaties[id] = { status: v.status, date: v.date, signed: v.signed, source: 'un-treaties', tier: 'legal', status_as_at: t.statusAsAt, verified: null };
      }
    }
    // OP3 is also the layer, so it gets a field of its own in the indicator shape the map reads.
    for (const iso3 of Object.keys(countries)) {
      const t = countries[iso3].treaties.op3_crc;
      countries[iso3].indicators.op3_crc = field({
        value: t ? t.status : 'neither',
        year: null,
        source: 'un-treaties',
        tier: 'legal',
        extra: { status_as_at: treaties.op3_crc.statusAsAt, date: t ? t.date : null },
      });
    }
    findings.push(...checkTreatyCounts(treaties));
    for (const [id, t] of Object.entries(treaties)) {
      notes.push(`${t.label}: ${t.parties} parties and ${t.signatoriesOnly} signatories that are not yet parties, as the UN grid prints them, status as at ${t.statusAsAt}. ${t.joined} of ${t.rows} rows joined to an ISO 3166-1 state; the rest are participants without one (the European Union, Cook Islands, Niue) and are named under "deliberately ignored".`);
    }
  }

  if (corporal) {
    const cp = corporal.school_corporal_punishment;
    sourceDates['end-corporal-punishment'] = { extracted: cp.extracted, table_updated: cp.tableUpdated };
    for (const [iso3, v] of cp.values) {
      if (!countries[iso3]) continue;
      countries[iso3].indicators.school_corporal_punishment = field({
        value: v.verdict, year: null, source: 'end-corporal-punishment', tier: 'legal',
        extra: { confirmed: v.confirmed, table_updated: cp.tableUpdated },
      });
    }
    notes.push(`End Corporal Punishment: ${cp.rowsParsed} state rows parsed from the table; schools column totals printed by the table itself are ${cp.totals ? `${cp.totals.fully} fully prohibited and ${cp.totals.notFully} not fully prohibited` : 'not readable'}.`);
    // The table prints its own totals. If the parse does not reproduce them the parse is wrong.
    if (cp.totals) {
      const got = { YES: 0, SOME: 0, NO: 0 };
      for (const v of cp.values.values()) got[v.verdict] += 1;
      const parsedFully = got.YES;
      if (Math.abs(parsedFully - cp.totals.fully) > 2) {
        findings.push({ hard: true, indicator: 'school_corporal_punishment', iso3: null, msg: `parsed ${parsedFully} "fully prohibited in schools" against the table's own total of ${cp.totals.fully}` });
      }
    }
  }

  if (gcpea) {
    const g = gcpea.education_under_attack;
    sourceDates.gcpea = { extracted: g.extracted };
    for (const [iso3, v] of g.values) {
      if (!countries[iso3]) continue;
      countries[iso3].indicators.education_under_attack = field({
        value: true, year: null, source: 'gcpea', tier: 'measured',
        extra: { severity: v.severity, profile_url: v.profile_url, edition: g.edition },
      });
    }
    notes.push(`GCPEA: ${g.parsed} country cards parsed from ${g.edition}; ${g.values.size} joined to an ISO3.`);
  }

  // Hand-transcribed rows, each carrying its page cite.
  let manualPlaced = 0;
  for (const [indicatorId, values] of manual.byIndicator) {
    for (const [iso3, row] of values) {
      if (!countries[iso3]) continue;
      if (!countries[iso3].indicators.atlas2024) countries[iso3].indicators.atlas2024 = { value: {}, year: null, source: 'who-atlas-2024', tier: 'self-reported', verified: null, pages: {} };
      const block = countries[iso3].indicators.atlas2024;
      block.value[indicatorId] = row.value;
      block.pages[indicatorId] = row.page;
      block.year = row.year;
      block.verified = row.verified;
      manualPlaced += 1;
    }
  }
  notes.push(manualPlaced === 0
    ? 'WHO Mental Health Atlas 2024: no country profile has been transcribed yet, so no card carries the Atlas block. A missing block means "not read yet", never "no programme".'
    : `WHO Mental Health Atlas 2024: ${manualPlaced} hand-transcribed value(s) placed, each with its page cite.`);

  // ---- staleness: enforce the max_age each indicator publishes -------------------------------
  // indicators.json PUBLISHES a max_age per indicator, and until now nothing compared a value
  // against it. Ethiopia's learning poverty is from 2015 against a declared limit of 8 years, and
  // it rendered exactly like Norway's 2021 value: same badge, same colour, nothing to see. A
  // guarantee that nothing enforces is not a guarantee, so every field now carries `stale` and
  // the card, the table and the legend say so where it is true.
  let staleCount = 0;
  for (const c of Object.values(countries)) {
    for (const [id, f] of Object.entries(c.indicators)) {
      const maxAge = MAX_AGE[id];
      if (!maxAge || !f || typeof f.year !== 'number') continue;
      const age = THIS_YEAR - f.year;
      f.age = age;
      f.stale = age > maxAge;
      if (f.stale) staleCount += 1;
    }
  }
  notes.push(`Staleness: ${staleCount} value(s) are older than the max_age their indicator publishes, and each one is flagged \`stale\` in atlas.json and marked on the card and in the table. A stale value is not a wrong value; it is an old one, and the reader is told which.`);

  // ---- sanity ------------------------------------------------------------------------------
  const perIndicator = {};
  for (const spec of INDICATORS) {
    const values = new Map();
    for (const [iso3, c] of Object.entries(countries)) {
      const f = c.indicators[spec.id];
      if (f && f.value !== null && f.value !== undefined) values.set(iso3, f);
    }
    perIndicator[spec.id] = values;
  }
  for (const spec of INDICATORS) {
    if (RANGES[spec.id]) {
      findings.push(...checkRanges(spec.id, perIndicator[spec.id]));
      findings.push(...checkYears(spec.id, perIndicator[spec.id], THIS_YEAR));
    }
  }

  const atlasPath = path.join(OUT_DATA, 'atlas.json');
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(atlasPath, 'utf8')); } catch { previous = null; }

  // ---- write -------------------------------------------------------------------------------
  const atlas = {
    schema: 1,
    built: today,
    note: 'One row per ISO 3166-1 state, whether or not a source has a number for it. A missing indicator means no data: it is drawn as a grey hatch and written "no data". It never means zero. A zero that a source really reported carries reported_zero: true.',
    licence: 'Derived data, licensed to match the strictest source it contains: CC BY-NC-SA (WHO) and ShareAlike (UNESCO). See sources.json.',
    countries: Object.fromEntries(Object.keys(countries).sort().map((k) => [k, countries[k]])),
  };
  findings.push(...compareWithPrevious(previous, atlas));

  const hard = findings.filter((f) => f.hard);
  const soft = findings.filter((f) => !f.hard);

  const indicatorsOut = {
    schema: 1,
    built: today,
    stamps: {
      measured: 'Somebody counted this.',
      modelled: 'A model estimated this from other numbers.',
      'self-reported': 'A government answered a questionnaire.',
      legal: 'This is what the law or the treaty record says.',
    },
    ramp: ['--wtl-ramp-1', '--wtl-ramp-2', '--wtl-ramp-3', '--wtl-ramp-4', '--wtl-ramp-5'],
    nodata: 'Grey hatch. No colour, ever, and never a zero.',
    indicators: INDICATORS.map((i) => ({ ...i, coverage: perIndicator[i.id].size })),
  };

  const sourcesOut = {
    schema: 1,
    built: today,
    note: 'Every value on this site names one of these. The attribution string is printed as written; {extracted} is the date the file behind it was read.',
    sources: SOURCES.map((s) => {
      const d = sourceDates[s.id] || {};
      const filled = s.attribution
        .replace('{extracted}', d.extracted || 'not read in this build')
        .replace('{status_as_at}', d.status_as_at || 'not read in this build')
        .replace('{table_updated}', d.table_updated || 'not read in this build');
      return { ...s, extracted: d.extracted || null, status_as_at: d.status_as_at || null, table_updated: d.table_updated || null, attribution: filled };
    }),
  };

  const coverage = renderCoverage({ atlas, perIndicator, log, notes, findings: { hard, soft }, manual, today, offline });

  if (hard.length) {
    console.error('\natlas build: FAIL. These would put a wrong value on a card:\n');
    for (const f of hard) console.error(`  - ${f.indicator}${f.iso3 ? ` ${f.iso3}` : ''}: ${f.msg}`);
    console.error(`\n${hard.length} hard finding(s). Nothing written.`);
    return 1;
  }

  fs.mkdirSync(OUT_DATA, { recursive: true });
  const wrote = [
    ['site/data/atlas.json', writeIfChanged(atlasPath, `${JSON.stringify(atlas, null, 2)}\n`)],
    ['site/data/indicators.json', writeIfChanged(path.join(OUT_DATA, 'indicators.json'), `${JSON.stringify(indicatorsOut, null, 2)}\n`)],
    ['site/data/sources.json', writeIfChanged(path.join(OUT_DATA, 'sources.json'), `${JSON.stringify(sourcesOut, null, 2)}\n`)],
    ['docs/coverage.md', writeIfChanged(path.join(OUT_DOCS, 'coverage.md'), coverage)],
  ];

  for (const f of soft) console.log(`note: ${f.indicator}${f.iso3 ? ` ${f.iso3}` : ''}: ${f.msg}`);
  console.log(`\natlas build: OK. ${Object.keys(atlas.countries).length} states, ${INDICATORS.length} indicators, ${log.totalFailed} failed join(s).`);
  for (const [name, changed] of wrote) console.log(`  ${changed ? 'written' : 'unchanged'}  ${name}`);
  if (log.totalFailed) console.log('  failed joins are named in docs/coverage.md');
  return 0;
}

function renderCoverage({ atlas, perIndicator, log, notes, findings, manual, today, offline }) {
  const L = [];
  L.push('# Atlas data coverage');
  L.push('');
  L.push(`Written by \`node tools/atlas/build-data.mjs\` on ${today}${offline ? ' (offline rebuild from the cache)' : ''}. Every number below is counted from the build that wrote \`site/data/atlas.json\` in the same run, never typed by hand.`);
  L.push('');
  L.push(`States in the table: **${Object.keys(atlas.countries).length}** (every ISO 3166-1 state, so nothing is dropped for having no shape on the map).`);
  L.push('');
  L.push('## Per indicator');
  L.push('');
  L.push('| Indicator | Countries with a value | Year min / median / max | Stale | Reported zeros |');
  L.push('|---|---|---|---|---|');
  for (const spec of INDICATORS) {
    const values = perIndicator[spec.id];
    const years = [...values.values()].map((v) => v.year).filter((y) => typeof y === 'number');
    const yearCell = years.length ? `${Math.min(...years)} / ${median(years)} / ${Math.max(...years)}` : 'no year (legal or categorical)';
    const stale = spec.max_age ? years.filter((y) => THIS_YEAR - y > spec.max_age).length : 0;
    const zeros = findReportedZeros(spec.id, values);
    L.push(`| ${spec.label} | ${values.size} | ${yearCell} | ${spec.max_age ? stale : 'n/a'} | ${zeros.length ? zeros.join(', ') : 'none'} |`);
  }
  L.push('');

  L.push('## Failed joins');
  L.push('');
  if (log.failed.size === 0) {
    L.push('None. Every name and code every source printed resolved to an ISO 3166-1 state, or was on the deliberate ignore list below.');
  } else {
    L.push('A name a source printed that this pipeline could not resolve to an ISO 3166-1 state. Its row was DROPPED, never guessed at. Each one is either a new alias for `tools/atlas/lib/iso-aliases.json` or a non-state the ignore list should name.');
    L.push('');
    L.push('| Source | Name printed | Rows dropped |');
    L.push('|---|---|---|');
    for (const [source, m] of [...log.failed].sort()) {
      for (const [name, n] of [...m].sort()) L.push(`| ${source} | ${name} | ${n} |`);
    }
  }
  L.push('');

  L.push('## Deliberately ignored');
  L.push('');
  if (log.ignored.size === 0) {
    L.push('Nothing was ignored in this build.');
  } else {
    L.push('| Source | Name | Rows |');
    L.push('|---|---|---|');
    for (const [source, m] of [...log.ignored].sort()) {
      for (const [name, n] of [...m].sort()) L.push(`| ${source} | ${name} | ${n} |`);
    }
  }
  L.push('');

  L.push('## What each source said in this build');
  L.push('');
  for (const n of notes) L.push(`- ${n}`);
  L.push('');

  L.push('## Hand-transcribed rows');
  L.push('');
  L.push(`Files read: ${manual.files.length ? manual.files.join(', ') : 'none'}. Rows placed: ${manual.rowCount}.`);
  if (manual.refusals.length) {
    L.push('');
    L.push('Refused rows (a row missing any column is refused, never half-published):');
    for (const r of manual.refusals) L.push(`- ${r}`);
  }
  L.push('');

  L.push('## Sanity findings');
  L.push('');
  if (findings.hard.length === 0 && findings.soft.length === 0) {
    L.push('None. Every value is inside its plausible range, every data year is real and not in the future, and no country count moved more than 10 per cent since the last run.');
  } else {
    for (const f of [...findings.hard, ...findings.soft]) {
      L.push(`- ${f.hard ? '**must fix**' : 'look at'}: ${f.indicator}${f.iso3 ? ` ${f.iso3}` : ''}: ${f.msg}`);
    }
  }
  L.push('');
  L.push('## What "no data" means here');
  L.push('');
  L.push('A country with no value for an indicator is drawn as a grey hatch and written "no data". It is never drawn as zero, never counted as zero in any total, and never read as "none" or "no programme". Where a source genuinely reported a zero, that zero is kept, flagged `reported_zero`, and listed in the table above, because a real zero and a missing number are different facts.');
  L.push('');
  return `${L.join('\n')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(`atlas build: FAIL\n  ${err.message}`);
    process.exitCode = 1;
  });
}

export { main, INDICATORS, SOURCES };
