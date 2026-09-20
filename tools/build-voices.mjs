#!/usr/bin/env node
// build-voices.mjs: site/data/profiles.json -> site/voices/<slug>/index.html (one per profile),
// site/voices/index.html (the roll), and site/data/profiles.public.json (only what the pages print).
//
//   node tools/build-voices.mjs [--root <repo>] [--profiles <file>]
//
// REFUSES the whole build (exit 1, nothing written) when any profile:
//   - lacks approved_by_bella, verified_identifying_details, verified_safe_messaging, or consent.date
//   - has fewer than 3 or more than 6 key points, or fewer than 1 or more than 2 quotes
//   - has a quote over 40 words, or a four-digit year-looking number inside a quote
//   - contains, anywhere in its printed text, one of the banned phrases (epidemic, crisis, diagnosed,
//     skyrocketing, committed suicide)
// Every refusal names the profile and the field. Output is deterministic: run twice, no diff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  layout, parseArgs, readJson, writeIfChanged, render, wordCount,
} from './lib/common.mjs';
import { loadPartials, stampHtml } from './stamp.mjs';

export const BANNED_PHRASES = ['epidemic', 'crisis', 'diagnosed', 'skyrocketing', 'committed suicide'];
// The exact strings a withheld profile prints instead of a name (Bella's rulings, 2026-09-19).
export const WITHHELD_NAMES = new Set(['Name withheld', 'Unnamed, by request']);
export const AGE_BANDS = ['12-14', '15-17', '18-19'];
export const MAX_QUOTE_WORDS = 40;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Consent is recorded to the month only. This repo is public, and fifteen exact
// interview days read together are an itinerary; the exact day stays in the private intake.
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const ID_RE = /^p\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Returns a list of problems for one profile (empty when valid).
export function validateProfile(p) {
  const problems = [];
  const need = (field, ok, why) => {
    if (!ok) problems.push(`${field}: ${why}`);
  };

  need('id', isNonEmptyString(p.id) && ID_RE.test(p.id), 'must look like p01..p99');
  need('slug', isNonEmptyString(p.slug) && SLUG_RE.test(p.slug), 'must be lowercase letters, digits, and hyphens');
  need('pseudonym', isNonEmptyString(p.pseudonym), 'missing');
  need('display_name', isNonEmptyString(p.display_name), 'missing');
  need('age_band', AGE_BANDS.includes(p.age_band), `must be one of ${AGE_BANDS.join(', ')}`);
  need('region', isNonEmptyString(p.region), 'missing (UN sub-region)');
  need('show_country', typeof p.show_country === 'boolean', 'must be true or false');
  need('country', p.country === null || isNonEmptyString(p.country), 'must be a string or null');
  if (p.show_country === true) need('country', isNonEmptyString(p.country), 'show_country is true but country is empty');
  need('schooling_status', isNonEmptyString(p.schooling_status), 'missing');

  if (!Array.isArray(p.key_points)) problems.push('key_points: must be an array');
  else {
    need('key_points', p.key_points.length >= 3 && p.key_points.length <= 6, `needs 3 to 6 entries, has ${p.key_points.length}`);
    p.key_points.forEach((k, i) => need(`key_points[${i}]`, isNonEmptyString(k), 'empty'));
  }

  if (!Array.isArray(p.quotes)) problems.push('quotes: must be an array');
  else {
    need('quotes', p.quotes.length >= 1 && p.quotes.length <= 2, `needs 1 to 2 entries, has ${p.quotes.length}`);
    p.quotes.forEach((q, i) => {
      if (!q || !isNonEmptyString(q.text)) {
        problems.push(`quotes[${i}].text: missing`);
        return;
      }
      need(`quotes[${i}].paraphrased`, typeof q.paraphrased === 'boolean', 'must be true or false');
      const words = wordCount(q.text);
      need(`quotes[${i}].text`, words <= MAX_QUOTE_WORDS, `${words} words, limit ${MAX_QUOTE_WORDS}`);
      const year = YEAR_RE.exec(q.text);
      if (year) problems.push(`quotes[${i}].text: contains a year-looking number (${year[0]}); years narrow identity`);
    });
  }

  need('wants_changed', isNonEmptyString(p.wants_changed), 'missing');
  need('avatar', p.avatar && typeof p.avatar === 'object', 'missing {style, seed, file}');
  if (p.avatar && typeof p.avatar === 'object') {
    need('avatar.style', isNonEmptyString(p.avatar.style), 'missing');
    need('avatar.seed', isNonEmptyString(p.avatar.seed), 'missing');
    need('avatar.file', isNonEmptyString(p.avatar.file), 'missing');
    if (isNonEmptyString(p.avatar.file) && isNonEmptyString(p.id)) {
      need('avatar.file', p.avatar.file === `${p.id}.svg`, `must be ${p.id}.svg (pages load assets/avatars/{id}.svg)`);
    }
  }
  need('content_note', p.content_note === null || isNonEmptyString(p.content_note), 'must be one sentence or null');

  // A withheld interviewee's working pseudonym must not survive anywhere in this file.
  // Bella ruled on 2026-09-19 that interviews 04, 07, 08 and 12 print "Name withheld" (never
  // "by request": none of the four asked), and that interview 14 prints "Unnamed, by request"
  // because that one did. Dropping `pseudonym` from publicView stops today's leak; this stops
  // tomorrow's, when somebody restores a working name to the field because it looked empty by
  // mistake. The name lives in the Tier B intake and nowhere else.
  if (isNonEmptyString(p.display_name) && WITHHELD_NAMES.has(p.display_name.trim())) {
    need(
      'pseudonym',
      !isNonEmptyString(p.pseudonym) || p.pseudonym.trim() === p.display_name.trim(),
      `is "${p.pseudonym}" on a profile whose display_name is "${p.display_name}": a withheld interviewee's working name stays in the Tier B intake and never in this file`,
    );
  }

  need('consent', p.consent && typeof p.consent === 'object', 'missing {how, date}');
  if (p.consent && typeof p.consent === 'object') {
    need('consent.how', isNonEmptyString(p.consent.how), 'missing');
    need('consent.date', isNonEmptyString(p.consent.date) && MONTH_RE.test(p.consent.date), 'missing or not YYYY-MM (month only: never publish the exact day)');
  }
  for (const field of ['approved_by_bella', 'verified_identifying_details', 'verified_safe_messaging']) {
    need(field, isNonEmptyString(p[field]) && DATE_RE.test(p[field]), 'missing or not YYYY-MM-DD');
  }

  // Banned phrases: every string the pages print.
  const printed = [
    ['pseudonym', p.pseudonym], ['display_name', p.display_name], ['region', p.region], ['country', p.country],
    ['schooling_status', p.schooling_status], ['wants_changed', p.wants_changed], ['content_note', p.content_note],
    ...(Array.isArray(p.key_points) ? p.key_points.map((k, i) => [`key_points[${i}]`, k]) : []),
    ...(Array.isArray(p.quotes) ? p.quotes.map((q, i) => [`quotes[${i}].text`, q && q.text]) : []),
  ];
  for (const [field, text] of printed) {
    if (typeof text !== 'string') continue;
    for (const phrase of BANNED_PHRASES) {
      const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(text)) problems.push(`${field}: contains banned phrase "${phrase}"`);
    }
  }
  return problems;
}

export function validateAll(profiles) {
  const refusals = [];
  if (!Array.isArray(profiles)) return ['profiles.json: top level must be an array'];
  const ids = new Map();
  const slugs = new Map();
  profiles.forEach((p, i) => {
    const label = `${p && p.id ? p.id : `#${i}`}${p && p.slug ? ` (${p.slug})` : ''}`;
    for (const problem of validateProfile(p || {})) refusals.push(`REFUSED ${label}: ${problem}`);
    if (p && p.id) {
      if (ids.has(p.id)) refusals.push(`REFUSED ${label}: duplicate id (also #${ids.get(p.id)})`);
      ids.set(p.id, i);
    }
    if (p && p.slug) {
      if (slugs.has(p.slug)) refusals.push(`REFUSED ${label}: duplicate slug (also #${slugs.get(p.slug)})`);
      slugs.set(p.slug, i);
    }
  });
  return refusals;
}

// The fields a page prints, and nothing else. Never consent, never an intake path.
export function publicView(p) {
  return {
    id: p.id,
    slug: p.slug,
    // `pseudonym` is deliberately NOT carried. It is the working name in Bella's private notes;
    // `display_name` is the only name any page prints. It used to be copied here, into
    // site/data/profiles.public.json, which is a PUBLISHED file. No template rendered it, so
    // nothing would ever have looked wrong: the working name of a withheld interviewee would
    // simply have been served as JSON to anyone who asked for the file. A field that nothing
    // displays is the easiest place for an anonymity leak to survive every review.
    // (Found by the p07 round-4 fidelity critic, 2026-09-19.)
    display_name: p.display_name,
    age_band: p.age_band,
    region: p.region,
    country: p.show_country ? p.country : null,
    show_country: p.show_country,
    schooling_status: p.schooling_status,
    key_points: [...p.key_points],
    quotes: p.quotes.map((q) => ({ text: q.text, paraphrased: q.paraphrased })),
    wants_changed: p.wants_changed,
    avatar: { file: `${p.id}.svg` },
    content_note: p.content_note,
    approved_by_bella: p.approved_by_bella,
    verified_identifying_details: p.verified_identifying_details,
    verified_safe_messaging: p.verified_safe_messaging,
  };
}

function avatarAlt(p) {
  return `Drawn avatar for ${p.display_name}, generated from a seed, not a likeness`;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  const profilesFile = path.resolve(args.profiles || path.join(L.site, 'data', 'profiles.json'));

  let profiles;
  try {
    profiles = readJson(profilesFile);
  } catch (err) {
    console.error(`build-voices: cannot read ${profilesFile}: ${err.message}`);
    return 1;
  }

  const refusals = validateAll(profiles);
  if (refusals.length) {
    console.error(`build-voices: refusing to build; ${refusals.length} problem(s), nothing written.`);
    for (const r of refusals) console.error(`  ${r}`);
    return 1;
  }

  const config = readJson(L.config);
  const partials = loadPartials(L.partials);
  const version = config.version;
  const profileTpl = fs.readFileSync(path.join(L.templates, 'profile.html'), 'utf8');
  const rollTpl = fs.readFileSync(path.join(L.templates, 'voices.html'), 'utf8');

  const sorted = [...profiles].map(publicView).sort((a, b) => a.id.localeCompare(b.id));
  let written = 0;
  const outputs = [];

  for (const p of sorted) {
    const relPath = `voices/${p.slug}/index.html`;
    const view = {
      ...p,
      site: config,
      version,
      root: '../../',
      avatar_src: `../../assets/avatars/${p.id}.svg`,
      avatar_alt: avatarAlt(p),
    };
    const { html, missing } = stampHtml(render(profileTpl, view), { config, partials, relPath, version });
    if (missing.length) {
      console.error(`build-voices: template profile.html lacks marker pair(s): ${missing.join(', ')}`);
      return 1;
    }
    const abs = path.join(L.site, relPath);
    if (writeIfChanged(abs, html)) written += 1;
    outputs.push(relPath);
  }

  const rollView = {
    site: config,
    version,
    root: '../',
    count: sorted.length,
    profiles: sorted.map((p) => ({
      ...p,
      href: `${p.slug}/`,
      avatar_src: `../assets/avatars/${p.id}.svg`,
      avatar_alt: avatarAlt(p),
      lead: p.key_points[0],
    })),
  };
  const rollPath = 'voices/index.html';
  const roll = stampHtml(render(rollTpl, rollView), { config, partials, relPath: rollPath, version });
  if (roll.missing.length) {
    console.error(`build-voices: template voices.html lacks marker pair(s): ${roll.missing.join(', ')}`);
    return 1;
  }
  if (writeIfChanged(path.join(L.site, rollPath), roll.html)) written += 1;
  outputs.push(rollPath);

  const publicPath = path.join(L.site, 'data', 'profiles.public.json');
  if (writeIfChanged(publicPath, `${JSON.stringify(sorted, null, 2)}\n`)) written += 1;
  outputs.push('data/profiles.public.json');

  console.log(`build-voices: ${sorted.length} profile(s), ${outputs.length} output(s), ${written} written, ${outputs.length - written} unchanged.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
