// Automated sanity checks. These are the things a person would not notice in a 200-country JSON:
// a rate of 400 per 100,000, a year from 1998, a treaty count that moved by forty overnight, a
// source that started reporting zeros. Each check returns findings; the build prints them all and
// FAILS on the ones that would put a wrong number on a card.
//
// A finding is `hard` when the value must not ship, and soft when it must be looked at. Nothing
// here silently corrects anything: the pipeline's job is to notice, and a person decides.

// Plausible ranges. A value outside its range is dropped from atlas.json and named in coverage:
// a rate of 400 per 100,000 is a units error, and a units error on a suicide layer is unforgivable.
export const RANGES = {
  suicide_10_19: { min: 0, max: 60, unit: 'per 100,000' },
  suicide_std: { min: 0, max: 100, unit: 'per 100,000' },
  psychiatrists: { min: 0, max: 60, unit: 'per 100,000' },
  out_of_school_lsec: { min: 0, max: 100, unit: 'per cent' },
  completion_lsec: { min: 0, max: 100, unit: 'per cent' },
  learning_poverty: { min: 0, max: 100, unit: 'per cent' },
  gdp_per_capita: { min: 0, max: 300000, unit: 'US$' },
};

// How old a value may be before the card calls it stale. These are not "wrong": MH_6 has not been
// refreshed since 2017 and that is the point of the badge.
export const MAX_AGE = {
  suicide_10_19: 6,
  suicide_std: 6,
  psychiatrists: 12,
  out_of_school_lsec: 5,
  completion_lsec: 6,
  learning_poverty: 8,
  gdp_per_capita: 4,
};

export function checkRanges(indicatorId, values) {
  const range = RANGES[indicatorId];
  const findings = [];
  if (!range) return findings;
  for (const [iso3, v] of values) {
    if (typeof v.value !== 'number' || Number.isNaN(v.value)) {
      findings.push({ hard: true, indicator: indicatorId, iso3, msg: `value is not a number (${JSON.stringify(v.value)})` });
    } else if (v.value < range.min || v.value > range.max) {
      findings.push({ hard: true, indicator: indicatorId, iso3, msg: `${v.value} ${range.unit} is outside the plausible range ${range.min} to ${range.max}` });
    }
  }
  return findings;
}

export function checkYears(indicatorId, values, thisYear) {
  const findings = [];
  for (const [iso3, v] of values) {
    if (!v.year || !Number.isInteger(v.year)) {
      findings.push({ hard: true, indicator: indicatorId, iso3, msg: 'no data year' });
    } else if (v.year > thisYear) {
      findings.push({ hard: true, indicator: indicatorId, iso3, msg: `data year ${v.year} is in the future` });
    }
  }
  return findings;
}

// A source-reported zero is real and is KEPT, flagged, and listed. It is not the same as missing,
// and the difference is the whole "never coerced to 0" rule read backwards.
export function findReportedZeros(indicatorId, values) {
  const zeros = [];
  for (const [iso3, v] of values) if (v.value === 0) zeros.push(iso3);
  return zeros;
}

// Compare against the previous run's atlas.json so a source that quietly halved is visible.
export function compareWithPrevious(previous, current) {
  const findings = [];
  if (!previous) return findings;
  const prevCounts = countByIndicator(previous);
  const curCounts = countByIndicator(current);
  const ids = new Set([...Object.keys(prevCounts), ...Object.keys(curCounts)]);
  for (const id of [...ids].sort()) {
    const a = prevCounts[id] || 0;
    const b = curCounts[id] || 0;
    if (a === 0) continue;
    const delta = Math.abs(b - a) / a;
    if (delta > 0.1) {
      findings.push({ hard: false, indicator: id, iso3: null, msg: `country count moved ${a} to ${b} (${(delta * 100).toFixed(1)} per cent) since the last run` });
    }
  }
  return findings;
}

function countByIndicator(atlas) {
  const counts = {};
  for (const country of Object.values(atlas.countries || {})) {
    for (const [id, field] of Object.entries(country.indicators || {})) {
      if (field && field.value !== null && field.value !== undefined) counts[id] = (counts[id] || 0) + 1;
    }
  }
  return counts;
}

// The treaty counts the UN prints are the one place where an exact expected number exists. A count
// outside its band means the parse lost or invented parties, which would misstate the law.
export function checkTreatyCounts(treaties) {
  const findings = [];
  for (const [id, t] of Object.entries(treaties)) {
    const low = t.expect - 3;
    const high = t.expect + 6;
    if (t.parties < low || t.parties > high) {
      findings.push({ hard: true, indicator: `treaty:${id}`, iso3: null, msg: `${t.parties} parties parsed, expected about ${t.expect} (band ${low} to ${high}); the grid parse is wrong or the treaty moved` });
    }
  }
  return findings;
}

export function median(numbers) {
  if (numbers.length === 0) return null;
  const s = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
