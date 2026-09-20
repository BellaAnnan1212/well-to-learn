// UN Treaty Collection: four instruments, server-rendered HTML, parsed from the participant grid.
//   IV-11    CRC     Convention on the Rights of the Child
//   IV-3     ICESCR  International Covenant on Economic, Social and Cultural Rights
//   IV-15    CRPD    Convention on the Rights of Persons with Disabilities
//   IV-11-d  OP3-CRC the complaints protocol: the one that decides whether a young person can
//                    take a case to the UN Committee at all, so it is a layer, not a card line.
//
// Every page prints its own "STATUS AS AT : DD-MM-YYYY". That string is read off the page and
// stored, never today's date: a treaty count with the wrong date on it is a false legal claim.

import { cachedFetch } from '../lib/fetch.mjs';

const TREATIES = [
  { id: 'crc', mtdsg: 'IV-11', label: 'Convention on the Rights of the Child', expect: 196 },
  { id: 'icescr', mtdsg: 'IV-3', label: 'International Covenant on Economic, Social and Cultural Rights', expect: 173 },
  { id: 'crpd', mtdsg: 'IV-15', label: 'Convention on the Rights of Persons with Disabilities', expect: 193 },
  { id: 'op3_crc', mtdsg: 'IV-11-d', label: 'Optional Protocol to the CRC on a communications procedure', expect: 54 },
];

const GRID = 'ctl00_ctl00_ContentPlaceHolder1_ContentPlaceHolderInnerPage_tblgrid';

function unescapeHtml(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function cellText(html) {
  return unescapeHtml(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// The grid prints footnote markers as trailing numbers after the participant name, and a state can
// carry several: "Denmark 1", "North Macedonia 4 ,", "United Kingdom of Great Britain and Northern
// Ireland 6 , 18 , 19 ,". Stripping the whole trailing run is safe because no state's name ends in
// a bare number, and a name this fails on lands in the failed-join list rather than in a card.
function cleanName(raw) {
  return raw.replace(/(?:\s*,)?(?:\s+\d{1,3}\s*,?)+\s*$/, '').replace(/\s+/g, ' ').trim();
}

export function parseParticipants(html, mtdsg) {
  const statusMatch = /STATUS\s+AS\s+AT\s*:?\s*([\d]{2}-[\d]{2}-[\d]{4})/i.exec(html);
  if (!statusMatch) throw new Error(`treaties ${mtdsg}: no "STATUS AS AT" date on the page; refusing to date the counts myself`);
  const [d, m, y] = statusMatch[1].split('-');
  const statusAsAt = `${y}-${m}-${d}`;

  const start = html.indexOf(`id="${GRID}"`);
  if (start === -1) throw new Error(`treaties ${mtdsg}: participant grid ${GRID} not found; the page markup changed`);
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end);

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m2) => m2[1]);
  const out = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1]));
    if (cells.length < 3) continue;
    const name = cleanName(cells[0]);
    if (!name || /^participant$/i.test(name)) continue;
    const signature = cells[1] || null;
    const action = cells[2] || null; // ratification, accession (a) or succession (d)
    out.push({ name, signature: signature || null, action: action || null });
  }
  return { statusAsAt, rows: out };
}

// A date the grid prints as "29 May\t 2013" becomes an ISO date. An unparseable one stays null
// rather than becoming a guess: the card then says "party, date not read" instead of a wrong date.
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
export function isoDate(raw) {
  if (!raw) return null;
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(raw.replace(/\s+/g, ' '));
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${String(m[1]).padStart(2, '0')}`;
}

export async function fetchTreaties({ offline, log }) {
  const out = {};
  for (const t of TREATIES) {
    const r = await cachedFetch({
      source: 'treaties',
      name: t.id,
      ext: 'html',
      offline,
      url: `https://treaties.un.org/Pages/ViewDetails.aspx?src=IND&mtdsg_no=${t.mtdsg}&chapter=4&clang=_en`,
    });
    const { statusAsAt, rows } = parseParticipants(r.body, t.mtdsg);
    const values = new Map();
    // Counted BEFORE the join, because the UN's own published total counts participants, not
    // ISO 3166-1 states: the European Union is a party to the CRPD and Cook Islands and Niue are
    // parties to the CRC, and none of the three has an ISO3. Comparing a post-join count with the
    // UN's total would fail the build every time for a reason that is not an error.
    let parties = 0;
    let signatoriesOnly = 0;
    let joined = 0;
    for (const row of rows) {
      const isPartyRow = Boolean(row.action);
      if (isPartyRow) parties += 1; else if (row.signature) signatoriesOnly += 1;
      const iso3 = log.byName(`treaties:${t.id}`, row.name);
      if (!iso3) continue;
      joined += 1;
      const isParty = isPartyRow;
      values.set(iso3, {
        status: isParty ? 'party' : (row.signature ? 'signatory' : 'neither'),
        date: isoDate(row.action) || null,
        signed: isoDate(row.signature) || null,
      });
    }
    out[t.id] = { values, extracted: r.date, statusAsAt, label: t.label, parties, signatoriesOnly, joined, rows: rows.length, expect: t.expect };
  }
  return out;
}
