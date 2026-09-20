// WHO Global Health Observatory, OData. Three series:
//   SDGSUICIDE  suicide rate ages 10 to 19, both sexes, crude, GHE 2021. No interval is published
//               for this age split, which is why the layer wears a modelled badge and the card
//               prints the sentence in indicators.json rather than a bare number.
//   MH_12       age-standardised suicide rate, all ages, with the Low and High bounds. Card only:
//               it is a different denominator from the 10 to 19 layer and must never be compared
//               with it on the same axis.
//   MH_6        psychiatrists per 100,000. Never refreshed since 2013 to 2017, so every value
//               wears its own year and the layer ships default-off.
//
// WHO terms: public-health purposes only, with the dataset name, the year, the date of access and
// an acknowledgement of the countries that provided the underlying data. sources.json carries the
// string; Methodology prints it.

import { cachedJson } from '../lib/fetch.mjs';

const BASE = 'https://ghoapi.azureedge.net/api';

// One row per country: WHO returns one per sex, and only SEX_BTSX is "both sexes".
function pickBothSexes(rows, log, source) {
  const out = new Map();
  for (const r of rows) {
    if (r.SpatialDimType !== 'COUNTRY') continue;
    if (r.Dim1 && r.Dim1 !== 'SEX_BTSX') continue;
    const iso3 = log.byCode(source, r.SpatialDim);
    if (!iso3) continue;
    const value = r.NumericValue;
    if (value === null || value === undefined) continue;
    const prev = out.get(iso3);
    // Keep the newest year; a tie keeps the first, which is stable because WHO returns sorted ids.
    if (!prev || r.TimeDim > prev.year) {
      out.set(iso3, {
        value,
        year: r.TimeDim,
        low: r.Low === null || r.Low === undefined ? null : r.Low,
        high: r.High === null || r.High === undefined ? null : r.High,
      });
    }
  }
  return out;
}

export async function fetchWhoGho({ offline, log }) {
  const suicideRaw = await cachedJson({
    source: 'who-gho',
    name: 'SDGSUICIDE-10-19',
    offline,
    url: `${BASE}/SDGSUICIDE?$filter=Dim2%20eq%20'AGEGROUP_YEARS10-19'`,
  });
  const stdRaw = await cachedJson({ source: 'who-gho', name: 'MH_12', offline, url: `${BASE}/MH_12` });
  const psyRaw = await cachedJson({ source: 'who-gho', name: 'MH_6', offline, url: `${BASE}/MH_6` });

  // The age filter is the whole point of the layer: if WHO ever changes the dimension code the
  // request would silently return every age band, so the rows are checked, not trusted.
  const wrongBand = suicideRaw.data.value.filter((r) => r.Dim2 !== 'AGEGROUP_YEARS10-19');
  if (wrongBand.length) {
    throw new Error(`who-gho SDGSUICIDE: ${wrongBand.length} row(s) are not AGEGROUP_YEARS10-19; the filter no longer holds`);
  }

  return {
    suicide_10_19: { values: pickBothSexes(suicideRaw.data.value, log, 'who-gho'), extracted: suicideRaw.date },
    suicide_std: { values: pickBothSexes(stdRaw.data.value, log, 'who-gho'), extracted: stdRaw.date },
    psychiatrists: { values: pickBothSexes(psyRaw.data.value, log, 'who-gho'), extracted: psyRaw.date },
  };
}
