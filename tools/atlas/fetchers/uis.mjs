// UNESCO Institute for Statistics, public data API. Two series in v1:
//   ROFST.2.CP  out-of-school rate, lower secondary age (SDG 4.1.4). A UIS MODEL estimate, not a
//               headcount, so it wears the modelled badge even though it is the education layer
//               people reach for first.
//   CR.2        completion rate, lower secondary (SDG 4.1.2).
//
// Licence CC BY-SA 4.0, which is the strictest ShareAlike in the set: the derived JSON inherits it
// and sources.json says so. Attribution: "Source: UNESCO Institute for Statistics (UIS), <URL>,
// date of extraction".

import { cachedJson } from '../lib/fetch.mjs';

const BASE = 'https://api.uis.unesco.org/api/public/data/indicators';

function url(indicator) {
  return `${BASE}?indicator=${indicator}&geoUnitType=NATIONAL&start=2015&end=2026`;
}

// UIS returns every year it holds. The card shows one number, so this keeps the latest year per
// country and nothing else: a chart of the series is a v2 question.
function latestByCountry(records, log, indicator) {
  const out = new Map();
  for (const r of records) {
    if (r.indicatorId !== indicator) continue;
    if (r.value === null || r.value === undefined) continue;
    const iso3 = log.byCode('uis', r.geoUnit);
    if (!iso3) continue;
    const prev = out.get(iso3);
    if (!prev || r.year > prev.year) {
      out.set(iso3, { value: r.value, year: r.year, qualifier: r.qualifier || null, magnitude: r.magnitude || null });
    }
  }
  return out;
}

export async function fetchUis({ offline, log }) {
  const oos = await cachedJson({ source: 'uis', name: 'ROFST.2.CP', offline, url: url('ROFST.2.CP') });
  const cr = await cachedJson({ source: 'uis', name: 'CR.2', offline, url: url('CR.2') });

  for (const [name, raw] of [['ROFST.2.CP', oos], ['CR.2', cr]]) {
    if (!Array.isArray(raw.data.records)) throw new Error(`uis ${name}: no records array in the response`);
    if (raw.data.records.length === 0) throw new Error(`uis ${name}: zero records; the API answered but returned nothing`);
  }

  return {
    out_of_school_lsec: { values: latestByCountry(oos.data.records, log, 'ROFST.2.CP'), extracted: oos.date },
    completion_lsec: { values: latestByCountry(cr.data.records, log, 'CR.2'), extracted: cr.date },
  };
}
