#!/usr/bin/env node
// stamp.mjs: rewrite the nav, crisis, and footer blocks of every page under site/ from tools/partials,
// resolving {{root}} to the right number of "../" for each page's depth, and bump every ?v=YYYYMMDD on
// local asset URLs to today's date (system clock, local time). Idempotent: a second run changes nothing.
//
//   node tools/stamp.mjs [--root <repo>] [--site <dir>]
//
// Exit 1 when a page lacks a marker pair (the page is named; nothing about it is silently skipped).
// Also exported: stampHtml(html, ctx) so build-voices.mjs can emit fully stamped pages.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  layout, parseArgs, readJson, writeJson, writeIfChanged, walkHtml, rootFor, render, todayStamp,
} from './lib/common.mjs';

export const BLOCKS = ['nav', 'crisis', 'footer'];

// Local asset URLs only: skip anything with a scheme, protocol-relative, mailto, tel, data.
const VERSION_RE = /((?:href|src)=["'])(?!(?:[a-z][a-z0-9+.-]*:|\/\/))([^"'?#]*)\?v=\d{8}/gi;

export function loadPartials(partialsDir) {
  const partials = {};
  for (const name of BLOCKS) {
    partials[name] = fs.readFileSync(path.join(partialsDir, `${name}.html`), 'utf8');
  }
  return partials;
}

function isCurrent(href, relPath) {
  if (href.endsWith('/')) return relPath.startsWith(href);
  return relPath === href;
}

// Build the render context for one page.
export function contextFor(config, relPath, version) {
  return {
    root: rootFor(relPath),
    page: relPath,
    version,
    site: config,
    home: { ...config.home, current: isCurrent(config.home.href, relPath) },
    nav: config.nav.map((item) => ({ ...item, current: isCurrent(item.href, relPath) })),
  };
}

// Replace the content between <!-- name:start --> and <!-- name:end --> with `body`.
// Returns { html, missing: [names] }.
export function replaceBlocks(html, rendered) {
  const missing = [];
  let out = html;
  for (const name of BLOCKS) {
    const start = `<!-- ${name}:start -->`;
    const end = `<!-- ${name}:end -->`;
    const a = out.indexOf(start);
    const b = a === -1 ? -1 : out.indexOf(end, a + start.length);
    if (a === -1 || b === -1) {
      missing.push(name);
      continue;
    }
    const body = rendered[name].replace(/\s+$/, '');
    out = `${out.slice(0, a + start.length)}\n${body}\n${out.slice(b)}`;
  }
  return { html: out, missing };
}

export function bumpVersions(html, version) {
  return html.replace(VERSION_RE, (_, prefix, url) => `${prefix}${url}?v=${version}`);
}

// Stamp one page. ctx = { config, partials, relPath, version }.
export function stampHtml(html, { config, partials, relPath, version }) {
  const view = contextFor(config, relPath, version);
  const rendered = {};
  for (const name of BLOCKS) rendered[name] = render(partials[name], view);
  const { html: replaced, missing } = replaceBlocks(html, rendered);
  return { html: bumpVersions(replaced, version), missing };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  const config = readJson(L.config);
  const partials = loadPartials(L.partials);
  const version = todayStamp();

  // The config carries the same stamp the pages carry, so check.mjs can compare the two.
  if (config.version !== version) {
    config.version = version;
    writeJson(L.config, config);
    console.log(`config: version -> ${version}`);
  }

  const pages = walkHtml(L.site);
  if (pages.length === 0) {
    console.error(`stamp: no pages found under ${L.site}`);
    return 1;
  }

  const problems = [];
  let changed = 0;
  for (const relPath of pages) {
    const abs = path.join(L.site, relPath);
    const before = fs.readFileSync(abs, 'utf8');
    const { html, missing } = stampHtml(before, { config, partials, relPath, version });
    if (missing.length) problems.push(`${relPath}: missing marker pair(s): ${missing.join(', ')}`);
    if (writeIfChanged(abs, html)) {
      changed += 1;
      console.log(`stamped  ${relPath}`);
    }
  }

  console.log(`stamp: ${pages.length} page(s), ${changed} changed, ${pages.length - changed} unchanged, version ${version}`);
  if (problems.length) {
    console.error(`stamp: ${problems.length} page(s) with missing markers:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
