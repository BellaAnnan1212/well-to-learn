#!/usr/bin/env node
// build-atlas-page.mjs: site/data/{atlas,indicators,sources}.json -> site/atlas/index.html
//
//   node tools/build-atlas-page.mjs [--root <repo>]
//
// The TABLE is rendered here, at build time, with every state in it. That is the whole reason this
// generator exists rather than a fetch() in the browser: with scripting off, the Atlas page must
// still be the Atlas, not an apology. The map and the country card are the enhancement; the table
// is the page. Both read the same `site/data/atlas.json`, so the two can never disagree.
//
// Three rules the markup enforces, not the stylesheet:
//   - A cell with no value prints the words "no data" in the muted mono class. Never 0, never "-".
//   - Every number prints its own year next to it, because the years differ per country.
//   - A value a source really reported as zero prints 0 AND carries a note, so it reads as a
//     measurement rather than as a gap.
// Output is deterministic: run twice, no diff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, layout, parseArgs, readJson, render, writeIfChanged } from './lib/common.mjs';
import { loadPartials, stampHtml } from './stamp.mjs';

const REL_PATH = 'atlas/index.html';

// The columns of the plain table, in the country card's own order: who lives there, young people,
// care, school, promises. The table is the card unrolled sideways.
const TABLE_COLUMNS = [
  { id: 'suicide_10_19', head: 'Suicide, 10 to 19', sub: 'per 100,000' },
  { id: 'psychiatrists', head: 'Psychiatrists', sub: 'per 100,000' },
  { id: 'out_of_school_lsec', head: 'Out of school', sub: 'per cent, lower secondary age' },
  { id: 'completion_lsec', head: 'Completion', sub: 'per cent, lower secondary' },
  { id: 'learning_poverty', head: 'Learning poverty', sub: 'per cent at age 10' },
  { id: 'school_corporal_punishment', head: 'Corporal punishment in schools', sub: 'prohibited?' },
  { id: 'op3_crc', head: 'UN complaints protocol', sub: 'party?' },
];

const CATEGORY_WORDS = {
  YES: 'Prohibited',
  SOME: 'Partly',
  NO: 'Not prohibited',
  party: 'Party',
  signatory: 'Signed only',
  neither: 'Not bound',
};

function cell(countryField, spec) {
  if (!countryField || countryField.value === null || countryField.value === undefined) {
    return '<td class="nd">no data</td>';
  }
  const v = countryField.value;
  if (typeof v === 'string' || typeof v === 'boolean') {
    const word = CATEGORY_WORDS[v] || String(v);
    const unconfirmed = countryField.confirmed === false ? ' <span class="year">unconfirmed</span>' : '';
    return `<td>${escapeHtml(word)}${unconfirmed}</td>`;
  }
  const decimals = spec && typeof spec.decimals === 'number' ? spec.decimals : 1;
  const shown = v.toFixed(decimals);
  const year = countryField.year ? ` <span class="year">${countryField.year}</span>` : '';
  const zero = countryField.reported_zero
    ? ' <span class="year">reported zero, not missing</span>'
    : '';
  // A value past its indicator's published max_age is marked here too, not only on the card.
  // The table is the page for anyone without JavaScript, so anything the card says it must say.
  const stale = countryField.stale
    ? ` <span class="stale">stale, ${countryField.age} years</span>`
    : '';
  // NAT_EST means a national estimate rather than a UIS one: a different kind of number, and
  // invisible unless it is printed.
  const qual = countryField.qualifier === 'NAT_EST'
    ? ' <span class="year">national estimate</span>'
    : '';
  return `<td class="n">${shown}${year}${stale}${qual}${zero}</td>`;
}

export function renderTable(atlas, indicators) {
  const specs = new Map(indicators.indicators.map((i) => [i.id, i]));
  const head = TABLE_COLUMNS
    .map((c) => `<th scope="col" class="${specs.get(c.id)?.bands || specs.get(c.id)?.decimals ? 'n' : ''}">${escapeHtml(c.head)}<br><span class="year">${escapeHtml(c.sub)}</span></th>`)
    .join('\n          ');

  const rows = Object.values(atlas.countries)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((c) => {
      const cells = TABLE_COLUMNS.map((col) => cell(c.indicators[col.id], specs.get(col.id))).join('');
      return `<tr id="row-${c.iso3}"><th scope="row">${escapeHtml(c.name)} <span class="year">${c.iso3}</span></th>${cells}</tr>`;
    })
    .join('\n        ');

  return { head, rows, count: Object.keys(atlas.countries).length };
}

// The layer picker. Only the indicators the register marks as layers, in register order, each with
// the stamp it wears, so nobody has to read the legend to know what kind of number they are seeing.
export function renderLayers(indicators) {
  return indicators.indicators
    .filter((i) => i.layer)
    .map((i, n) => {
      const checked = i.default_on ? ' checked' : '';
      return `<li><label class="layer-pick"><input type="radio" name="layer" value="${escapeHtml(i.id)}"${checked}>`
        + `<span class="layer-name">${escapeHtml(i.short)}</span>`
        + `<span class="layer-stamp">${escapeHtml(i.kind)}</span></label></li>`;
    })
    .join('\n            ');
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  const config = readJson(L.config);
  const partials = loadPartials(L.partials);
  const dataDir = path.join(L.site, 'data');

  for (const f of ['atlas.json', 'indicators.json', 'sources.json']) {
    if (!fs.existsSync(path.join(dataDir, f))) {
      console.error(`build-atlas-page: site/data/${f} is missing. Run node tools/atlas/build-data.mjs first.`);
      return 1;
    }
  }
  const atlas = readJson(path.join(dataDir, 'atlas.json'));
  const indicators = readJson(path.join(dataDir, 'indicators.json'));
  const sources = readJson(path.join(dataDir, 'sources.json'));

  const table = renderTable(atlas, indicators);
  const defaultLayer = indicators.indicators.find((i) => i.default_on) || indicators.indicators.find((i) => i.layer);
  if (!defaultLayer) {
    console.error('build-atlas-page: no indicator is marked as a layer; there would be nothing to draw.');
    return 1;
  }

  const tpl = fs.readFileSync(path.join(L.templates, 'atlas.html'), 'utf8');
  const view = {
    site: config,
    version: config.version,
    root: '../',
    built: atlas.built,
    country_count: table.count,
    layer_count: indicators.indicators.filter((i) => i.layer).length,
    indicator_count: indicators.indicators.length,
    table_head: table.head,
    table_rows: table.rows,
    layers: renderLayers(indicators),
    default_layer_label: defaultLayer.label,
    default_layer_note: defaultLayer.note,
    default_layer_stamp: defaultLayer.kind,
    sources: sources.sources
      .filter((s) => s.extracted || s.status_as_at || s.table_updated)
      .map((s) => ({ name: s.name, attribution: s.attribution, url: s.url })),
  };

  const { html, missing } = stampHtml(render(tpl, view), { config, partials, relPath: REL_PATH, version: config.version });
  if (missing.length) {
    console.error(`build-atlas-page: template atlas.html lacks marker pair(s): ${missing.join(', ')}`);
    return 1;
  }

  const wrote = writeIfChanged(path.join(L.site, REL_PATH), html);
  console.log(`build-atlas-page: ${table.count} state rows, ${view.layer_count} layer(s), ${view.indicator_count} indicator(s). ${wrote ? 'written' : 'unchanged'}  site/${REL_PATH}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
