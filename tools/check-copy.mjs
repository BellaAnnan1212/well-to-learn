#!/usr/bin/env node
// check-copy.mjs: the gate for Know Your Rights chapter markdown.
//
//   node tools/check-copy.mjs --dir <folder of ch-*.md>
//
// WHY THIS EXISTS. Two legal critics, working independently on 2026-09-19, found the same hole:
// `BANNED_PHRASES` lives in build-voices.mjs and is applied ONLY to voices profile fields. No
// build step ever read a rights chapter. Chapters 2 to 9 were clean of banned words, en dashes
// and over-long quotes, but they were clean by the drafters' discipline, not because anything
// checked. A convention every writer must remember is a habit; the same convention checked on
// every run is a control. This is the control.
//
// It checks the things that are mechanically checkable, and deliberately nothing else. Whether a
// General Comment is being passed off as treaty text is a judgment a person or a critic makes;
// this file counts words and matches strings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, parseArgs, wordCount } from './lib/common.mjs';

// The same list build-voices.mjs enforces on profiles, so the two surfaces cannot drift apart.
// "crisis" is here because chapter 9 is titled "Help lines everywhere" for exactly this reason.
export const BANNED = ['epidemic', 'crisis', 'diagnosed', 'skyrocketing', 'committed suicide'];

// Strings that legitimately contain a banned word: a service's own proper name, and the site's
// own standing disclaimer, which ships from tools/site.config.json on every page. Each is allowed
// ONLY as this exact string, so "crisis" cannot arrive inside some new sentence unnoticed.
export const ALLOWED_IN_FULL = [
  'Crisis Text Line',
  '988 Suicide and Crisis Lifeline',
  'this site is not a crisis service',
  'crisis-centres-helplines', // the live IASP directory URL
];

export const MAX_QUOTE_WORDS = 15;

// Case-insensitive on purpose. site.config.json stores the disclaimer lowercase ("this site is
// not a crisis service") and the stylesheet draws the capital with ::first-letter, so the stored
// wording and the printed wording stay identical; in prose the same sentence starts with a
// capital T. Matching case-sensitively would refuse the site's own standing line.
function stripAllowed(text) {
  let out = text;
  for (const ok of ALLOWED_IN_FULL) {
    out = out.replace(new RegExp(ok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  return out;
}

// Pull the quoted fragments out of a **Quote.** line: anything inside straight double quotes.
export function quotesIn(line) {
  return [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export function checkChapter(text, file) {
  const problems = [];
  const lines = text.split('\n');

  const scannable = stripAllowed(text);
  for (const phrase of BANNED) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const hits = [...scannable.matchAll(re)];
    for (const h of hits) {
      const upto = scannable.slice(0, h.index).split('\n').length;
      problems.push(`line ~${upto}: banned phrase "${h[0]}"`);
    }
  }

  // The site rule: ranges are written "10 to 19". An en or em dash anywhere is a defect.
  lines.forEach((line, i) => {
    if (/[–—]/.test(line)) problems.push(`line ${i + 1}: contains an en or em dash; ranges are written "10 to 19"`);
  });

  // Every quoted fragment on a **Quote.** line must be under 15 words.
  lines.forEach((line, i) => {
    if (!/^\*\*Quote\.\*\*/.test(line.trim())) return;
    for (const q of quotesIn(line)) {
      const n = wordCount(q);
      if (n >= MAX_QUOTE_WORDS) problems.push(`line ${i + 1}: quote is ${n} words, limit is under ${MAX_QUOTE_WORDS}: "${q.slice(0, 60)}..."`);
    }
  });

  // Frontmatter the brief requires, so a chapter cannot ship without saying what it could not verify.
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!fm) problems.push('no frontmatter block');
  else {
    for (const key of ['type', 'project', 'chapter', 'title', 'status', 'drafted', 'sources', 'unverified']) {
      if (!new RegExp(`^${key}:`, 'm').test(fm[1])) problems.push(`frontmatter: missing \`${key}:\``);
    }
  }

  // A claim the drafter could not confirm must be visible, not softened away.
  const unverified = [...text.matchAll(/\[UNVERIFIED:[^\]]*\]/g)];
  return { problems, unverified: unverified.length, file };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dir = path.resolve(args.dir || path.join(REPO_ROOT, 'content', 'rights'));
  if (!fs.existsSync(dir)) {
    console.log(`check-copy: no copy directory at ${dir}; nothing to check.`);
    return 0;
  }
  const files = fs.readdirSync(dir).filter((f) => /^ch-\d\d-.*\.md$/.test(f)).sort();
  if (files.length === 0) {
    console.log(`check-copy: no ch-NN-*.md files in ${dir}; nothing to check.`);
    return 0;
  }

  const report = [];
  let unverified = 0;
  for (const f of files) {
    const r = checkChapter(fs.readFileSync(path.join(dir, f), 'utf8'), f);
    unverified += r.unverified;
    if (r.problems.length) report.push(r);
  }

  if (report.length) {
    console.error('check-copy: FAIL');
    for (const r of report) {
      console.error(`\n${r.file}`);
      for (const p of r.problems) console.error(`  - ${p}`);
    }
    console.error(`\n${report.reduce((n, r) => n + r.problems.length, 0)} problem(s) in ${report.length} file(s).`);
    return 1;
  }
  console.log(`check-copy: OK. ${files.length} chapter(s) clean${unverified ? `, ${unverified} claim(s) still marked UNVERIFIED` : ''}.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
