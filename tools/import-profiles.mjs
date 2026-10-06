#!/usr/bin/env node
// import-profiles.mjs: approved profile files (markdown, kept OUTSIDE this repository) -> one
// profiles.json in the shape build-voices.mjs reads.
//
//   node tools/import-profiles.mjs --from <folder of pNN-*.md> --out <file> [--only p01,p02]
//
// The profile files and the file this writes both carry the consent block, so NEITHER belongs in
// this repository: it is public, and a field nothing prints is still a published field. Write the
// output outside the repo and hand it to the generator with
//   node tools/build-voices.mjs --profiles <file>
// This tool refuses an --out path inside the repository for that reason.
//
// REFUSES the whole import (exit 1, nothing written) when any selected profile:
//   - has a section missing, out of order or renamed, or a quote line it cannot read
//   - has an H1 that does not match its own frontmatter, or a seed that is not its slug
//   - carries an em or en dash, or a consent date that names a day
//   - fails any check build-voices.mjs makes (dates, quote length, banned phrases, withheld names)
// A construct this parser skipped silently would be a sentence nobody notices is gone.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, parseArgs } from './lib/common.mjs';
import { validateAll } from './build-voices.mjs';

export const SECTIONS = [
  'At a glance',
  'In their words',
  'What they want changed',
  'How this profile was made',
  'Help, if this is close to home',
];
const QUOTE_RE = /^> "(.*)" \((verbatim|paraphrased)\)$/;
const FILE_RE = /^p\d{2}-[a-z0-9-]+\.md$/;

function scalar(raw) {
  // A trailing comment starts at whitespace + '#'. No profile value contains that sequence.
  const v = raw.replace(/\s+#.*$/, '').trim();
  if (v === 'null' || v === '') return null;
  return v;
}

// The small YAML subset the profile template uses: `key: value` and one level of nesting.
export function parseFrontmatter(text) {
  const out = {};
  let parent = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^(\s*)([A-Za-z_]+):(.*)$/.exec(line);
    if (!m) throw new Error(`frontmatter line not understood: "${line}"`);
    const [, indent, key, rest] = m;
    if (indent.length === 0) {
      const v = scalar(rest);
      if (v === null && rest.replace(/\s+#.*$/, '').trim() === '') {
        out[key] = {};
        parent = key;
      } else {
        out[key] = v;
        parent = null;
      }
    } else {
      if (!parent) throw new Error(`indented line with no parent key: "${line}"`);
      out[parent][key] = scalar(rest);
    }
  }
  return out;
}

// Returns { profile, problems }. `profile` is in the build-voices shape.
export function parseProfile(source, name = 'profile') {
  const problems = [];
  const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, '\n'));
  if (!fm) return { profile: null, problems: [`${name}: no frontmatter block`] };
  let meta;
  try {
    meta = parseFrontmatter(fm[1]);
  } catch (err) {
    return { profile: null, problems: [`${name}: ${err.message}`] };
  }
  const body = fm[2].replace(/<!--[\s\S]*?-->/g, '');
  if (/[–—]/.test(fm[2])) problems.push(`${name}: contains an em or en dash`);

  const h1 = /^# (.+)$/m.exec(body);
  const expectedH1 = [meta.display_name, meta.age_band, meta.region, meta.schooling_status].join(' · ');
  if (!h1) problems.push(`${name}: no H1 line`);
  else if (h1[1].trim() !== expectedH1) problems.push(`${name}: H1 is "${h1[1].trim()}" but the frontmatter says "${expectedH1}"`);

  const found = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  if (found.join('|') !== SECTIONS.join('|')) {
    problems.push(`${name}: sections are [${found.join(' / ')}], expected [${SECTIONS.join(' / ')}]`);
    return { profile: null, problems };
  }
  const section = (title) => {
    const start = body.indexOf(`## ${title}`) + title.length + 3;
    const next = body.indexOf('\n## ', start);
    return body.slice(start, next === -1 ? undefined : next).trim();
  };
  const lines = (title) => section(title).split('\n').map((l) => l.trim()).filter(Boolean);

  const keyPoints = [];
  for (const l of lines('At a glance')) {
    if (l.startsWith('- ') && l.length > 2) keyPoints.push(l.slice(2).trim());
    else problems.push(`${name}: "At a glance" has a line that is not a bullet: "${l}"`);
  }
  const quotes = [];
  for (const l of lines('In their words')) {
    const q = QUOTE_RE.exec(l);
    if (q) quotes.push({ text: q[1], paraphrased: q[2] === 'paraphrased' });
    else problems.push(`${name}: "In their words" has a line that is not > "..." (verbatim|paraphrased): "${l}"`);
  }
  const wants = lines('What they want changed');
  if (wants.length !== 1) problems.push(`${name}: "What they want changed" must be one paragraph, has ${wants.length}`);

  if (meta.avatar && meta.avatar.seed !== meta.slug) problems.push(`${name}: avatar.seed "${meta.avatar && meta.avatar.seed}" is not the slug "${meta.slug}"`);
  if (meta.slug && meta.id && !String(meta.slug).startsWith(`${meta.id}-`)) problems.push(`${name}: slug "${meta.slug}" does not start with "${meta.id}-"`);
  for (const [k, v] of [['show_country', meta.show_country], ['sensitive', meta.sensitive]]) {
    if (v !== 'yes' && v !== 'no') problems.push(`${name}: ${k} must be yes or no, is "${v}"`);
  }
  if (meta.sensitive === 'yes' && !meta.content_note) problems.push(`${name}: sensitive is yes but content_note is empty`);
  if (meta.sensitive === 'no' && meta.content_note) problems.push(`${name}: content_note is set but sensitive is no`);

  const withheld = typeof meta.pseudonym === 'string' && /^withheld\b/i.test(meta.pseudonym);
  const profile = {
    id: meta.id,
    slug: meta.slug,
    // A withheld interviewee's working name never enters this file: the field repeats the display name.
    pseudonym: withheld ? meta.display_name : meta.pseudonym,
    display_name: meta.display_name,
    age_band: meta.age_band,
    region: meta.region,
    country: meta.show_country === 'yes' ? meta.country : null,
    show_country: meta.show_country === 'yes',
    schooling_status: meta.schooling_status,
    key_points: keyPoints,
    quotes,
    wants_changed: wants[0] || '',
    avatar: {
      style: meta.avatar && meta.avatar.style,
      seed: meta.avatar && meta.avatar.seed,
      file: meta.avatar && meta.avatar.file ? path.basename(meta.avatar.file) : null,
    },
    content_note: meta.content_note,
    consent: { how: meta.consent && meta.consent.how, date: meta.consent && meta.consent.date },
    approved_by_bella: meta.approved_by_bella,
    verified_identifying_details: meta.verified_identifying_details,
    verified_safe_messaging: meta.verified_safe_messaging,
  };
  return { profile, problems };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.from || !args.out) {
    console.error('import-profiles: usage: --from <folder> --out <file> [--only p01,p02]');
    return 1;
  }
  const from = path.resolve(args.from);
  const out = path.resolve(args.out);
  const rel = path.relative(REPO_ROOT, out);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    console.error(`import-profiles: refusing to write ${rel}: this repository is public and the file carries the consent block. Write it outside the repo.`);
    return 1;
  }
  const only = typeof args.only === 'string' ? new Set(args.only.split(',').map((s) => s.trim())) : null;
  const files = fs.readdirSync(from).filter((f) => FILE_RE.test(f)).sort();
  const profiles = [];
  const problems = [];
  for (const f of files) {
    if (only && !only.has(f.slice(0, 3))) continue;
    const { profile, problems: p } = parseProfile(fs.readFileSync(path.join(from, f), 'utf8'), f);
    problems.push(...p);
    if (profile) {
      if (f !== `${profile.slug}.md`) problems.push(`${f}: file name is not the slug "${profile.slug}"`);
      profiles.push(profile);
    }
  }
  if (only) for (const id of only) if (!profiles.some((p) => p.id === id)) problems.push(`${id}: no profile file found in ${from}`);
  if (!problems.length) problems.push(...validateAll(profiles));
  if (problems.length) {
    console.error(`import-profiles: refusing; ${problems.length} problem(s), nothing written.`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(profiles, null, 2)}\n`);
  console.log(`import-profiles: ${profiles.length} profile(s) written to ${out}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
