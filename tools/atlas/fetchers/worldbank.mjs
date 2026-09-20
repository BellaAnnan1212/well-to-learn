// World Bank World Development Indicators. One layer and two context fields:
//   SE.LPV.PRIM  learning poverty, the share of 10-year-olds below minimum reading proficiency,
//                adjusted for out-of-school children. A MODELLED COMPOSITE of two measurements,
//                which is why it wears its own year badge and is never called "cannot read".
//   context      income group and GDP per capita, from the country list and NY.GDP.PCAP.CD.
//
// The 78 aggregates (region.id "NA") are dropped before anything is drawn: an aggregate row on a
// country map is a fabricated country. Licence CC BY 4.0, attribution "The World Bank: <dataset>".

import { cachedJson } from '../lib/fetch.mjs';

const BASE = 'https://api.worldbank.org/v2';

function indicatorUrl(id) {
  return `${BASE}/country/all/indicator/${id}?format=json&mrnev=1&per_page=400`;
}

// `aggregates` is the set of World Bank codes that are regions, income groups and lending groups
// rather than states (AFE, ARB, LMY, OED and the rest). They are dropped here as a DELIBERATE drop,
// not reported as failed joins: an aggregate is not a country whose name went wrong, and burying
// 70 of them in the failed-join table would hide the one real failure that matters.
function parseIndicator(payload, log, id, aggregates) {
  if (!Array.isArray(payload) || payload.length < 2) throw new Error(`worldbank ${id}: unexpected payload shape`);
  const [meta, rows] = payload;
  if (meta.pages > 1) throw new Error(`worldbank ${id}: ${meta.pages} pages; per_page is too small and rows would be silently lost`);
  const out = new Map();
  for (const r of rows || []) {
    if (r.value === null || r.value === undefined) continue;
    const code = (r.countryiso3code || '').toUpperCase();
    if (!code || aggregates.has(code)) continue;
    const iso3 = log.byCode('worldbank', code);
    if (!iso3) continue;
    out.set(iso3, { value: r.value, year: Number(r.date) });
  }
  return out;
}

export async function fetchWorldBank({ offline, log }) {
  const countries = await cachedJson({ source: 'worldbank', name: 'countries', offline, url: `${BASE}/country?format=json&per_page=400` });
  const lpv = await cachedJson({ source: 'worldbank', name: 'SE.LPV.PRIM', offline, url: indicatorUrl('SE.LPV.PRIM') });
  const gdp = await cachedJson({ source: 'worldbank', name: 'NY.GDP.PCAP.CD', offline, url: indicatorUrl('NY.GDP.PCAP.CD') });

  const [cMeta, cRows] = countries.data;
  if (cMeta.pages > 1) throw new Error('worldbank countries: more than one page; rows would be lost');

  // The country list is the only authority on which codes are aggregates, so it is read first and
  // the indicator series are filtered through it.
  const aggregateCodes = new Set(cRows.filter((c) => c.region?.id === 'NA').map((c) => c.id.toUpperCase()));

  const context = new Map();
  let aggregates = 0;
  for (const c of cRows) {
    if (c.region?.id === 'NA') { aggregates += 1; continue; } // an aggregate, not a state
    const iso3 = log.byCode('worldbank', c.id);
    if (!iso3) continue;
    context.set(iso3, {
      name: c.name,
      income_group: c.incomeLevel?.value && c.incomeLevel.value !== 'Aggregates' ? c.incomeLevel.value : null,
      region: c.region?.value || null,
    });
  }
  // The plan counted 78 aggregates on 2026-09-03. A change is not an error, but a silent change is:
  // the number goes into coverage so a shift is visible rather than absorbed.
  return {
    learning_poverty: { values: parseIndicator(lpv.data, log, 'SE.LPV.PRIM', aggregateCodes), extracted: lpv.date },
    gdp_per_capita: { values: parseIndicator(gdp.data, log, 'NY.GDP.PCAP.CD', aggregateCodes), extracted: gdp.date },
    context: { values: context, extracted: countries.date, aggregates },
  };
}
