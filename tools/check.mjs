#!/usr/bin/env node
// check.mjs: the gate before any push. Exits 1 with a readable report when any page under site/ lacks a
// viewport meta, exactly one h1, a skip link (whose target id exists), the three marker pairs, or a crisis
// block; when any local href/src points at a missing file; when an href is site-absolute (breaks the
// /well-to-learn/ sub-path); when ?v= stamps differ across files (or from tools/site.config.json); or when
// sitemap.xml lists a URL with no matching page. Zero pages is itself a failure. Exit 0 prints counts.
//
//   node tools/check.mjs [--root <repo>] [--site <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, parseArgs, readJson, walkHtml } from './lib/common.mjs';

const BLOCKS = ['nav', 'crisis', 'footer'];
const ATTR_RE = /\b(href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const SKIP_SCHEMES = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function hasClass(html, cls) {
  // Matches class="crisis", class="a crisis", class="crisis b", never class="crisis-lines".
  return new RegExp(`class\\s*=\\s*["'](?:[^"']*\\s)?${cls}(?:\\s[^"']*)?["']`).test(html);
}

function between(html, name) {
  const a = html.indexOf(`<!-- ${name}:start -->`);
  const b = html.indexOf(`<!-- ${name}:end -->`);
  if (a === -1 || b === -1 || b < a) return null;
  return html.slice(a, b);
}

export function checkPage(html, relPath, siteDir) {
  const errors = [];
  const stamps = [];
  let links = 0;

  if (!/<meta\s[^>]*name\s*=\s*["']viewport["']/i.test(html)) errors.push('missing <meta name="viewport">');

  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) errors.push(`expected exactly one <h1>, found ${h1s}`);

  const skip = /<a\s[^>]*class\s*=\s*["'][^"']*\bskip-link\b[^"']*["'][^>]*href\s*=\s*["']#([^"']+)["']/i.exec(html)
    || /<a\s[^>]*href\s*=\s*["']#([^"']+)["'][^>]*class\s*=\s*["'][^"']*\bskip-link\b/i.exec(html);
  if (!skip) errors.push('missing skip link (<a class="skip-link" href="#...">)');
  else if (!new RegExp(`\\bid\\s*=\\s*["']${skip[1]}["']`).test(html)) errors.push(`skip link targets #${skip[1]} but no element has that id`);

  for (const name of BLOCKS) {
    const starts = html.split(`<!-- ${name}:start -->`).length - 1;
    const ends = html.split(`<!-- ${name}:end -->`).length - 1;
    if (starts !== 1 || ends !== 1) errors.push(`marker pair ${name}:start/${name}:end must appear exactly once (found ${starts}/${ends})`);
    else if (between(html, name) === null) errors.push(`marker ${name}:end appears before ${name}:start`);
  }

  const crisisBlock = between(html, 'crisis');
  if (!hasClass(html, 'crisis')) errors.push('missing crisis block (element with class "crisis")');
  else if (crisisBlock !== null && !hasClass(crisisBlock, 'crisis')) errors.push('crisis block is outside the crisis markers');

  const pageDir = path.posix.dirname(relPath);
  let m = ATTR_RE.exec(html);
  while (m) {
    const raw = (m[3] ?? m[4] ?? '').trim();
    m = ATTR_RE.exec(html);
    if (!raw || SKIP_SCHEMES.test(raw)) continue;
    const noHash = raw.split('#')[0];
    const [urlPath, query] = noHash.split('?');
    if (query) {
      const v = /(?:^|&)v=([^&]*)/.exec(query);
      if (v) {
        if (!/^\d{8}$/.test(v[1])) errors.push(`${raw}: ?v= must be YYYYMMDD`);
        stamps.push(v[1]);
      }
    }
    if (!urlPath) continue;
    links += 1;
    if (urlPath.startsWith('/')) {
      errors.push(`${raw}: site-absolute URL breaks the /well-to-learn/ sub-path; use a relative URL`);
      continue;
    }
    const target = path.posix.normalize(path.posix.join(pageDir, decodeURIComponent(urlPath)));
    if (target.startsWith('..')) {
      errors.push(`${raw}: resolves outside site/`);
      continue;
    }
    const abs = path.join(siteDir, target);
    let stat = null;
    try {
      stat = fs.statSync(abs);
    } catch {
      stat = null;
    }
    if (!stat) errors.push(`${raw}: target not found (${target})`);
    else if (stat.isDirectory()) {
      if (!urlPath.endsWith('/')) errors.push(`${raw}: points at a directory without a trailing slash (relative links inside it will break)`);
      if (!fs.existsSync(path.join(abs, 'index.html'))) errors.push(`${raw}: directory has no index.html (${target}/)`);
    }
  }

  return { errors, stamps, links };
}

export function checkSitemap(siteDir, basePath, pages) {
  const errors = [];
  const file = path.join(siteDir, 'sitemap.xml');
  if (!fs.existsSync(file)) return { errors: ['sitemap.xml: missing'], urls: 0 };
  const xml = fs.readFileSync(file, 'utf8');
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]);
  if (locs.length === 0) errors.push('sitemap.xml: no <loc> entries');
  const listed = new Set();
  for (const loc of locs) {
    let u;
    try {
      u = new URL(loc);
    } catch {
      errors.push(`sitemap.xml: ${loc} is not an absolute URL`);
      continue;
    }
    if (!u.pathname.startsWith(basePath)) {
      errors.push(`sitemap.xml: ${loc} is outside basePath ${basePath}`);
      continue;
    }
    const rel = u.pathname.slice(basePath.length);
    const page = rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
    if (!page.endsWith('.html')) errors.push(`sitemap.xml: ${loc} does not map to a page`);
    else if (!fs.existsSync(path.join(siteDir, page))) errors.push(`sitemap.xml: ${loc} has no matching ${page}`);
    listed.add(page);
  }
  const warnings = pages.filter((p) => p !== '404.html' && !listed.has(p)).map((p) => `sitemap.xml does not list ${p}`);
  return { errors, warnings, urls: locs.length };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  let config = null;
  try {
    config = readJson(L.config);
  } catch {
    config = null;
  }
  const basePath = config?.basePath || '/';

  const pages = walkHtml(L.site);
  if (pages.length === 0) {
    console.error(`check: FAIL: no pages found under ${L.site}`);
    return 1;
  }

  const report = [];
  const stampsByFile = new Map();
  let links = 0;
  for (const relPath of pages) {
    const html = fs.readFileSync(path.join(L.site, relPath), 'utf8');
    const r = checkPage(html, relPath, L.site);
    links += r.links;
    if (r.stamps.length) stampsByFile.set(relPath, [...new Set(r.stamps)]);
    if (r.errors.length) report.push({ file: relPath, errors: r.errors });
  }

  const allStamps = new Set([...stampsByFile.values()].flat());
  const stampErrors = [];
  if (allStamps.size > 1) {
    stampErrors.push(`?v= stamps differ across files: ${[...allStamps].sort().join(', ')}`);
    for (const [file, s] of stampsByFile) stampErrors.push(`  ${file}: ${s.join(', ')}`);
  }
  if (config && allStamps.size === 1 && !allStamps.has(config.version)) {
    stampErrors.push(`?v= stamp ${[...allStamps][0]} differs from tools/site.config.json version ${config.version}; run node tools/stamp.mjs`);
  }
  if (stampErrors.length) report.push({ file: '(stamps)', errors: stampErrors });

  const sm = checkSitemap(L.site, basePath, pages);
  if (sm.errors.length) report.push({ file: 'sitemap.xml', errors: sm.errors });

  if (report.length) {
    console.error('check: FAIL');
    for (const item of report) {
      console.error(`\n${item.file}`);
      for (const e of item.errors) console.error(`  - ${e}`);
    }
    console.error(`\n${report.reduce((n, i) => n + i.errors.length, 0)} problem(s) in ${report.length} place(s).`);
    return 1;
  }

  for (const w of sm.warnings || []) console.log(`warning: ${w}`);
  console.log(`check: OK. ${pages.length} page(s), ${links} local link(s) resolved, stamp ${[...allStamps][0] || '(none)'}, ${sm.urls} sitemap URL(s).`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
