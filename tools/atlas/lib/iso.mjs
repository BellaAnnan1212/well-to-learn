// Name -> ISO3 resolution. Nothing is ever guessed: a name that does not resolve is RETURNED as a
// failed join, named in docs/coverage.md, and its row is dropped. A silent guess here would put one
// country's number on another country's card, which is the worst thing this pipeline could do.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ISO_CODES = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'site', 'vendor', 'iso-codes.json'), 'utf8'),
);
const ALIASES = JSON.parse(fs.readFileSync(path.join(HERE, 'iso-aliases.json'), 'utf8'));

export const BY_ALPHA3 = new Map(ISO_CODES.map((c) => [c.alpha3, c]));
export const BY_NUMERIC = new Map(ISO_CODES.map((c) => [c.numeric, c]));

// Fold a display name to a comparison key: lower case, no accents, no punctuation, no "the".
export function nameKey(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// The ISO 3166-1 names alone, before any alias is layered on. The ignore-list guard below checks
// against THIS, not the aliased map: an alias is a name a source happens to print, but a name in
// here is a real state, and a real state must never be ignored.
const BY_NAME_BASE = new Map(ISO_CODES.map((c) => [nameKey(c.name), c.alpha3]));

const BY_NAME = new Map(BY_NAME_BASE);
for (const [alias, alpha3] of Object.entries(ALIASES.names)) BY_NAME.set(nameKey(alias), alpha3);

// Names the sources print that are NOT states with an ISO3 code, and are dropped on purpose rather
// than reported as a failed join (regional aggregates, observers, territories outside ISO 3166-1).
const IGNORED = new Set(ALIASES.ignore.map(nameKey));

// The ignore list is the most dangerous file in this pipeline, because everything on it disappears
// SILENTLY and correctly-looking: no failed join, no warning, just a country with no data. On
// 2026-09-19 Cook Islands and Niue were put here on the assumption they were not ISO 3166-1
// states. They are. Their treaty rows were dropped and their cards read "Not bound" for the CRC,
// which the UN lists both as parties to. Nothing caught it; a chapter drafter reading the UN page
// did. So the list now checks itself against ISO 3166-1 at load, and a real country on it is a
// hard error rather than a quiet omission.
{
  const wrongly = ALIASES.ignore.filter((name) => BY_NAME_BASE.has(nameKey(name)));
  if (wrongly.length) {
    throw new Error(
      `iso-aliases.json: ${wrongly.join(', ')} ${wrongly.length === 1 ? 'is' : 'are'} on the ignore `
      + 'list but IS a state in ISO 3166-1. Ignoring a real country drops its data silently and its '
      + 'card then states something false about it. Remove it from "ignore".',
    );
  }
}

export function resolveName(name) {
  const key = nameKey(name);
  if (!key) return { ok: false, reason: 'empty' };
  if (IGNORED.has(key)) return { ok: false, reason: 'ignored' };
  const alpha3 = BY_NAME.get(key);
  if (alpha3) return { ok: true, iso3: alpha3 };
  return { ok: false, reason: 'unresolved' };
}

export function resolveAlpha3(code) {
  const up = String(code || '').toUpperCase();
  if (BY_ALPHA3.has(up)) return { ok: true, iso3: up };
  const mapped = ALIASES.codes[up];
  if (mapped === null) return { ok: false, reason: 'ignored' };
  if (mapped) return { ok: true, iso3: mapped };
  return { ok: false, reason: 'unresolved' };
}

// Collects failed joins so the build can name every one of them instead of losing them.
export class JoinLog {
  constructor() {
    this.failed = new Map(); // source -> Map(name -> count)
    this.ignored = new Map();
  }

  fail(source, name) {
    if (!this.failed.has(source)) this.failed.set(source, new Map());
    const m = this.failed.get(source);
    m.set(name, (m.get(name) || 0) + 1);
  }

  ignore(source, name) {
    if (!this.ignored.has(source)) this.ignored.set(source, new Map());
    const m = this.ignored.get(source);
    m.set(name, (m.get(name) || 0) + 1);
  }

  // Resolve by name, logging whichever way it goes. Returns an ISO3 or null.
  byName(source, name) {
    const r = resolveName(name);
    if (r.ok) return r.iso3;
    if (r.reason === 'ignored') this.ignore(source, name);
    else this.fail(source, name);
    return null;
  }

  byCode(source, code) {
    const r = resolveAlpha3(code);
    if (r.ok) return r.iso3;
    if (r.reason === 'ignored') this.ignore(source, code);
    else this.fail(source, code);
    return null;
  }

  get totalFailed() {
    let n = 0;
    for (const m of this.failed.values()) for (const c of m.values()) n += c;
    return n;
  }
}
