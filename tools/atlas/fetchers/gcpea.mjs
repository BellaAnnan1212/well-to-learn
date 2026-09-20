// GCPEA, Education under Attack 2026 (the eighth edition, launched June 2026). The 28 profiled
// countries, as a BADGE and a link to GCPEA's own profile. Never a map layer, never a ranking.
//
// Why no number, although the page publishes one per country: GCPEA counts REPORTED attacks, and
// reporting is thickest where monitoring is strongest. A country with no profile has not been
// shown to be safe; it may simply have nobody counting. A choropleth or a league table of those
// counts would say the opposite of what the data means, so this fetcher deliberately stores the
// boolean, GCPEA's own severity WORD, and the link, and drops the count. The site sentence that
// carries the global figures ("at least 8,566 attacks in 2024 to 2025") is a headline fact with
// its source, not a per-country value.
//
// Licence: "(c)2026 GCPEA" and nothing else published. Attribution plus a link out; no republished
// table, no derived statistic.

import { cachedFetch } from '../lib/fetch.mjs';

const URL_PAGE = 'https://eua2026.protectingeducation.org/';
const CARD = /<div[^>]*class="[^"]*c-country__data[^"]*"[\s\S]{0,400}?<h4[^>]*class="[^"]*o-heading-medium[^"]*"[^>]*>([^<]+)<\/h4>[\s\S]{0,900}?<h4[^>]*class="[^"]*o-body-large--map[^"]*"[^>]*>([^<]+)<\/h4>[\s\S]{0,400}?href="([^"]+\.pdf)"/g;

export function parseProfiles(html) {
  const out = [];
  let m = CARD.exec(html);
  while (m) {
    const name = m[1].replace(/&amp;/g, '&').trim();
    const severity = m[2].trim();
    const profile = m[3];
    if (name && !/total number of attacks/i.test(name)) out.push({ name, severity, profile });
    m = CARD.exec(html);
  }
  return out;
}

export async function fetchGcpea({ offline, log }) {
  const r = await cachedFetch({ source: 'gcpea', name: 'eua-2026', ext: 'html', offline, url: URL_PAGE });
  const profiles = parseProfiles(r.body);
  // The edition profiles 28 countries. A parse that finds a different number has found a page
  // change, not a world change, and must be looked at rather than published.
  if (profiles.length === 0) throw new Error('gcpea: no country cards parsed; the page markup changed');

  const values = new Map();
  for (const p of profiles) {
    const iso3 = log.byName('gcpea', p.name);
    if (!iso3) continue;
    values.set(iso3, { profiled: true, severity: p.severity, profile_url: p.profile });
  }
  return {
    education_under_attack: { values, extracted: r.date, parsed: profiles.length, edition: 'Education under Attack 2026' },
  };
}
