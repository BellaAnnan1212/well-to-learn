#!/usr/bin/env node
// test.mjs: exercises stamp.mjs, check.mjs, build-voices.mjs, import-profiles.mjs, build-rights.mjs and build-methodology.mjs against temporary copies under os.tmpdir().
// Never touches site/ in the repo. Exit 0 when every assertion holds.
//
//   node tools/test.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, todayStamp, walk } from './lib/common.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const TODAY = todayStamp();
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${msg}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${msg}`);
  }
}

function run(tool, args) {
  const r = spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function copyTools(root) {
  for (const sub of ['partials', 'templates']) {
    fs.cpSync(path.join(TOOLS, sub), path.join(root, 'tools', sub), { recursive: true });
  }
  fs.copyFileSync(path.join(TOOLS, 'site.config.json'), path.join(root, 'tools', 'site.config.json'));
}

function page(title, depth) {
  const root = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="${root}assets/site.css?v=20200101">
</head>
<body>
<!-- nav:start -->
<!-- nav:end -->
<main id="main">
  <h1>${title}</h1>
  <p>Hello.</p>
</main>
<!-- crisis:start -->
<!-- crisis:end -->
<!-- footer:start -->
<!-- footer:end -->
</body>
</html>
`;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function sitemap(paths) {
  const urls = paths.map((p) => `  <url><loc>https://example.test/well-to-learn/${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function snapshot(dir) {
  const out = {};
  for (const rel of walk(dir)) {
    out[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
  }
  return out;
}

function sameSnapshot(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wtl-test-'));
console.log(`temp root: ${tmp}`);

try {
  // ---------- stamp + check on a two-page site ----------
  console.log('\nstamp + check: two-page site');
  const A = path.join(tmp, 'a');
  copyTools(A);
  const site = path.join(A, 'site');
  write(path.join(site, 'index.html'), page('Home', 0));
  write(path.join(site, 'atlas', 'index.html'), page('Atlas', 1));
  write(path.join(site, 'assets', 'site.css'), 'body{}\n');
  write(path.join(site, 'sitemap.xml'), sitemap(['', 'atlas/']));

  let r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 0, `stamp exits 0 on a well-formed site (got ${r.code})`);
  const snap1 = snapshot(site);
  r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 0 && sameSnapshot(snap1, snapshot(site)), 'stamp is idempotent (second run, no diff)');
  assert(/2 page\(s\), 0 changed/.test(r.out), 'stamp summary reports 0 changed on the second run');

  const home = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const atlas = fs.readFileSync(path.join(site, 'atlas', 'index.html'), 'utf8');
  assert(home.includes('href="atlas/"') && home.includes('class="skip-link"'), 'home page nav resolves {{root}} to "" and carries the skip link');
  assert(atlas.includes('href="../atlas/" aria-current="page"'), 'atlas page nav resolves {{root}} to "../" and marks itself current');
  assert(home.includes('href="index.html" aria-current="page"'), 'home link is current only on the home page');
  assert(!atlas.includes('href="../index.html" aria-current'), 'home link is not current on the atlas page');
  assert(home.includes(`site.css?v=${TODAY}`) && atlas.includes(`site.css?v=${TODAY}`), `?v= bumped to today (${TODAY})`);
  // The crisis strings are the plan's Safety and editorial rules, word for word; a drift here fails the test.
  assert(home.includes('class="crisis"') && home.includes('988 call or text (US)'), 'crisis block stamped from config with the 988 line verbatim');
  assert(home.includes('Crisis Text Line (text HOME to 741741, US)'), 'crisis text line present verbatim');
  assert(home.includes('findahelpline.com (international)'), 'crisis international line present verbatim');
  assert(home.includes('if you are in danger now call local emergency services'), 'crisis danger line present verbatim');
  assert(home.includes('this site is not a crisis service'), 'crisis not-a-crisis-service line present verbatim');
  assert(home.includes('Information, not medical or legal advice'), 'crisis advice line present verbatim, as its own paragraph');
  assert(home.includes('class="band band-ink site-footer"') && home.includes('CC BY-NC 4.0'), 'footer stamped with the licence line');
  assert(!/\{\{[^}]*\}\}/.test(home) && !/\{\{[^}]*\}\}/.test(atlas), 'no unresolved {{placeholders}} remain');
  const cfg = JSON.parse(fs.readFileSync(path.join(A, 'tools', 'site.config.json'), 'utf8'));
  assert(cfg.version === TODAY, 'config version stamp updated to today');

  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1, `check exits 1 while nav targets are missing (got ${r.code})`);
  assert(r.out.includes('voices/') && r.out.includes('methodology/'), 'check names the missing nav targets');

  // Fill in the remaining sections; the site becomes clean.
  for (const sec of ['voices', 'rights', 'act', 'about', 'methodology']) {
    write(path.join(site, sec, 'index.html'), page(sec, 1));
  }
  write(path.join(site, 'sitemap.xml'), sitemap(['', 'atlas/', 'voices/', 'rights/', 'act/', 'about/', 'methodology/']));
  r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 0, 'stamp exits 0 after adding the section pages');
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 0, `check exits 0 on the clean seven-page site (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  assert(/check: OK\. 7 page\(s\)/.test(r.out), 'check prints counts when clean');

  // ---------- negative cases for stamp and check ----------
  console.log('\nnegative cases');
  const broken = page('Broken', 1)
    .replace('<!-- crisis:start -->\n<!-- crisis:end -->\n', '')
    .replace('<meta name="viewport" content="width=device-width, initial-scale=1">\n', '')
    .replace('<h1>Broken</h1>', '<h1>Broken</h1><h1>Twice</h1>')
    .replace('<p>Hello.</p>', '<p><a href="nowhere.html">gone</a> <a href="/well-to-learn/atlas/">absolute</a></p>');
  write(path.join(site, 'broken', 'index.html'), broken);
  r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 1 && r.out.includes('broken/index.html') && r.out.includes('crisis'), 'stamp reports the page missing a marker pair by path and exits 1');
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1, 'check exits 1 on the broken page');
  assert(r.out.includes('viewport'), 'check reports the missing viewport meta');
  assert(r.out.includes('exactly one <h1>, found 2'), 'check reports the h1 count');
  assert(r.out.includes('nowhere.html'), 'check reports the dangling link');
  assert(r.out.includes('site-absolute'), 'check reports the site-absolute URL');
  assert(r.out.includes('crisis'), 'check reports the missing crisis block');
  assert(r.out.includes('sitemap.xml does not list') === false, 'warnings are not printed on failure');
  fs.rmSync(path.join(site, 'broken'), { recursive: true });

  // Stamp drift across files.
  const driftFile = path.join(site, 'about', 'index.html');
  const drifted = fs.readFileSync(driftFile, 'utf8').replace(`site.css?v=${TODAY}`, 'site.css?v=20200101');
  fs.writeFileSync(driftFile, drifted);
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1 && r.out.includes('stamps differ'), 'check reports ?v= drift across files');
  r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 0, 'stamp repairs the drift');

  // Sitemap pointing at a page that does not exist.
  write(path.join(site, 'sitemap.xml'), sitemap(['', 'atlas/', 'voices/', 'rights/', 'act/', 'about/', 'methodology/', 'ghost/']));
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1 && r.out.includes('ghost/'), 'check reports a sitemap URL with no matching page');
  write(path.join(site, 'sitemap.xml'), sitemap(['', 'atlas/', 'voices/', 'rights/', 'act/', 'about/', 'methodology/']));

  // Empty site.
  const E = path.join(tmp, 'e');
  copyTools(E);
  fs.mkdirSync(path.join(E, 'site'), { recursive: true });
  r = run('check.mjs', ['--root', E]);
  assert(r.code === 1 && r.out.includes('no pages found'), 'check fails on zero pages');
  r = run('stamp.mjs', ['--root', E]);
  assert(r.code === 1 && r.out.includes('no pages found'), 'stamp fails on zero pages');

  // ---------- build-voices ----------
  console.log('\nbuild-voices: refusal');
  const fixture = JSON.parse(fs.readFileSync(path.join(TOOLS, 'fixtures', 'profiles.sample.json'), 'utf8'));
  const profilesPath = path.join(site, 'data', 'profiles.json');
  write(profilesPath, JSON.stringify(fixture, null, 2));
  r = run('build-voices.mjs', ['--root', A]);
  assert(r.code === 1, `build-voices refuses the fixture with the invalid profile (got ${r.code})`);
  assert(r.out.includes('REFUSED p03 (sorrel): approved_by_bella'), 'refusal names the profile and the missing field');
  assert(!fs.existsSync(path.join(site, 'voices', 'marigold')), 'nothing was written on refusal');
  assert(!fs.existsSync(path.join(site, 'data', 'profiles.public.json')), 'no public json on refusal');

  const valid = fixture.slice(0, 2);
  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(valid));
    fn(copy[0]);
    write(profilesPath, JSON.stringify(copy, null, 2));
    return run('build-voices.mjs', ['--root', A]);
  };
  r = mutate((p) => { p.key_points = p.key_points.slice(0, 2); });
  assert(r.code === 1 && r.out.includes('key_points: needs 3 to 6'), 'refuses fewer than 3 key points');
  r = mutate((p) => { p.key_points = [...p.key_points, 'a', 'b', 'c']; });
  assert(r.code === 1 && r.out.includes('key_points: needs 3 to 6'), 'refuses more than 6 key points');
  r = mutate((p) => { p.quotes[0].text = Array.from({ length: 41 }, (_, i) => `w${i}`).join(' '); });
  assert(r.code === 1 && r.out.includes('41 words, limit 40'), 'refuses a quote over 40 words');
  r = mutate((p) => { p.quotes[0].text = 'Back in 2019 everything changed at school.'; });
  assert(r.code === 1 && r.out.includes('year-looking number (2019)'), 'refuses a year inside a quote');
  r = mutate((p) => { p.key_points[0] = 'There is an epidemic of sadness here.'; });
  assert(r.code === 1 && r.out.includes('banned phrase "epidemic"'), 'refuses "epidemic"');
  r = mutate((p) => { p.wants_changed = 'A Crisis team at school.'; });
  assert(r.code === 1 && r.out.includes('banned phrase "crisis"'), 'refuses "crisis" case-insensitively');
  r = mutate((p) => { p.content_note = 'She was diagnosed last year.'; });
  assert(r.code === 1 && r.out.includes('banned phrase "diagnosed"'), 'refuses "diagnosed"');
  r = mutate((p) => { p.quotes[0].text = 'Numbers are skyrocketing.'; });
  assert(r.code === 1 && r.out.includes('banned phrase "skyrocketing"'), 'refuses "skyrocketing"');
  r = mutate((p) => { p.quotes[0].text = 'A cousin committed  suicide.'; });
  assert(r.code === 1 && r.out.includes('banned phrase "committed suicide"'), 'refuses "committed suicide" across extra whitespace');
  r = mutate((p) => { delete p.verified_safe_messaging; });
  assert(r.code === 1 && r.out.includes('verified_safe_messaging: missing'), 'refuses a missing verified_safe_messaging');
  r = mutate((p) => { delete p.verified_identifying_details; });
  assert(r.code === 1 && r.out.includes('verified_identifying_details: missing'), 'refuses a missing verified_identifying_details');
  r = mutate((p) => { delete p.consent.date; });
  assert(r.code === 1 && r.out.includes('consent.date: missing'), 'refuses a missing consent.date');
  r = mutate((p) => { p.consent.date = '2026-08-30'; });
  assert(r.code === 1 && r.out.includes('consent.date: missing or not YYYY-MM'), 'refuses an exact consent day (month only)');
  r = mutate((p) => { p.quotes[0].text = 'He said <b>"no"</b> & left.'; });
  assert(r.code === 0, 'a quote with markup characters is accepted (and escaped below)');

  // A withheld interviewee's working name must not survive in the profile file at all.
  // Bella ruled 2026-09-19 that 04, 07, 08 and 12 print "Name withheld" and 14 prints
  // "Unnamed, by request". The leak this guards is quiet: profiles.public.json is published,
  // and no template renders `pseudonym`, so a restored working name would look like nothing.
  r = mutate((p) => { p.display_name = 'Name withheld'; p.pseudonym = 'Thandiwe'; });
  assert(r.code === 1 && r.out.includes('withheld interviewee'), 'refuses a working pseudonym on a "Name withheld" profile');
  r = mutate((p) => { p.display_name = 'Unnamed, by request'; p.pseudonym = 'Marigold'; });
  assert(r.code === 1 && r.out.includes('withheld interviewee'), 'refuses a working pseudonym on an "Unnamed, by request" profile');
  r = mutate((p) => { p.display_name = 'Name withheld'; p.pseudonym = 'Name withheld'; });
  assert(r.code === 0, 'accepts a withheld profile whose pseudonym matches its display name');

  console.log('\nbuild-voices: valid build');
  write(profilesPath, JSON.stringify(valid, null, 2));
  for (const p of valid) write(path.join(site, 'assets', 'avatars', `${p.id}.svg`), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(path.join(site, 'assets', 'tokens.css'), ':root{}\n');
  // A generated page carries the same head as a hand-written one: tokens, stylesheet, script, icons.
  write(path.join(site, 'assets', 'site.js'), '/* stub */\n');
  write(path.join(site, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(path.join(site, 'favicon.ico'), 'stub\n');
  write(path.join(site, 'apple-touch-icon.png'), 'stub\n');
  r = run('build-voices.mjs', ['--root', A]);
  assert(r.code === 0, `build-voices exits 0 on two valid profiles (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  const snapV1 = snapshot(site);
  r = run('build-voices.mjs', ['--root', A]);
  assert(r.code === 0 && sameSnapshot(snapV1, snapshot(site)), 'build-voices is deterministic (second run, no diff)');
  assert(/4 output\(s\), 0 written/.test(r.out), 'build-voices reports 0 written on the second run (2 profiles, roll, public json)');

  const prof = fs.readFileSync(path.join(site, 'voices', 'marigold', 'index.html'), 'utf8');
  const prof2 = fs.readFileSync(path.join(site, 'voices', 'juniper', 'index.html'), 'utf8');
  assert(prof.includes('<h1 class="voice-name">Marigold</h1>'), 'profile page prints the display name as the h1');
  assert(prof.includes('src="../../assets/avatars/p01.svg"') && prof.includes('alt="Drawn avatar for Marigold'), 'avatar path and alt');
  assert(!prof.includes('<dt>Country</dt>') && prof2.includes('<dt>Country</dt><dd>Philippines</dd>'), 'country printed only when show_country');
  assert(prof.includes('(verbatim)') && prof.includes('(paraphrased)'), 'quotes carry verbatim and paraphrased tags');
  assert(!prof.includes('content-note') && prof2.indexOf('content-note') < prof2.indexOf('glance-heading'), 'content note only when present, and before the story');
  assert(prof.includes('href="../../atlas/"') && prof.includes('href="../../voices/" aria-current="page"'), 'profile nav resolved at depth 2 and Voices is current');
  assert(!prof.includes('2026-08') && !prof.includes('intake note'), 'profile page never prints consent date or how');
  assert(prof.includes('<time datetime="2026-09-03">'), 'profile page prints the verification dates');
  assert(prof.includes(`site.css?v=${TODAY}`), 'profile page carries today\'s ?v= stamp');
  const roll = fs.readFileSync(path.join(site, 'voices', 'index.html'), 'utf8');
  assert(roll.includes('href="marigold/"') && roll.includes('href="juniper/"') && roll.indexOf('marigold/') < roll.indexOf('juniper/'), 'roll lists both profiles in id order');
  assert(roll.includes('src="../assets/avatars/p02.svg"'), 'roll avatar path resolved at depth 1');
  const pub = JSON.parse(fs.readFileSync(path.join(site, 'data', 'profiles.public.json'), 'utf8'));
  assert(pub.length === 2 && pub.every((p) => !('consent' in p) && !('intake' in p)), 'public json omits consent and intake');
  // profiles.public.json is served to anyone who asks for it. The working pseudonym is not a
  // field any page prints, which is exactly why it could sit there unnoticed.
  assert(pub.every((p) => !('pseudonym' in p)), 'public json omits the working pseudonym entirely');
  assert(pub[0].country === null && pub[1].country === 'Philippines', 'public json hides the country unless show_country');

  // Escaping: rebuild with markup in a quote and confirm it is escaped.
  const escaped = JSON.parse(JSON.stringify(valid));
  escaped[0].quotes[0].text = 'He said <b>"no"</b> & left.';
  write(profilesPath, JSON.stringify(escaped, null, 2));
  r = run('build-voices.mjs', ['--root', A]);
  const profEsc = fs.readFileSync(path.join(site, 'voices', 'marigold', 'index.html'), 'utf8');
  assert(r.code === 0 && profEsc.includes('&lt;b&gt;&quot;no&quot;&lt;/b&gt; &amp; left.'), 'HTML in profile text is escaped');
  write(profilesPath, JSON.stringify(valid, null, 2));
  run('build-voices.mjs', ['--root', A]);

  // The whole generated site passes check.
  write(path.join(site, 'sitemap.xml'), sitemap(['', 'atlas/', 'voices/', 'voices/marigold/', 'voices/juniper/', 'rights/', 'act/', 'about/', 'methodology/']));
  r = run('stamp.mjs', ['--root', A]);
  const snapS = snapshot(site);
  assert(r.code === 0 && /0 changed/.test(r.out), 'stamp finds nothing to change on generated profile pages');
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 0, `check exits 0 on the site with generated voices (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  assert(sameSnapshot(snapS, snapshot(site)), 'check never writes');

  // ---------- import-profiles ----------
  console.log('\nimport-profiles');
  const mdDir = path.join(tmp, 'private-profiles');
  const md = (over = {}) => {
    const o = {
      pseudonym: 'Marigold', display: 'Marigold', h1: 'Marigold · 15-17 · Eastern Africa · in school',
      quote: '> "Nobody at school is trained for this." (verbatim)', date: '2026-08', verified: '2026-09-03', ...over,
    };
    return `---
type: voice-profile
id: p01
slug: p01-marigold
pseudonym: ${o.pseudonym}
display_name: ${o.display}            # what the site prints
age_band: 15-17
region: Eastern Africa
country: null
show_country: no
schooling_status: in school
content_note: null
sensitive: no
avatar:
  style: open-peeps
  seed: p01-marigold
  file: assets/avatars/p01.svg
consent:
  how: verbal, recorded in the intake note
  date: ${o.date}                 # month only
  public_anonymous_withdrawable: yes
approved_by_bella: 2026-09-03
verified_identifying_details: ${o.verified}
verified_safe_messaging: ${o.verified}
intake: somewhere/private/intake-01.md
status: draft
---

# ${o.h1}

<!-- a comment the page never prints -->

## At a glance
- Walks a long way to school.
- Told a teacher she felt low.
- Wants a quiet room.

## In their words
${o.quote}

## What they want changed
One trained adult per school whose job it is to listen.

## How this profile was made
Anonymised. Consent: verbal, August 2026.

## Help, if this is close to home
<!-- crisis-block -->
`;
  };
  const importOut = path.join(tmp, 'private-out', 'profiles.json');
  const tryImport = (over) => {
    fs.rmSync(mdDir, { recursive: true, force: true });
    fs.rmSync(importOut, { force: true });
    write(path.join(mdDir, 'p01-marigold.md'), md(over));
    write(path.join(mdDir, '_template.md'), 'not a profile\n');
    return run('import-profiles.mjs', ['--from', mdDir, '--out', importOut]);
  };
  r = tryImport();
  assert(r.code === 0 && fs.existsSync(importOut), `import-profiles writes one valid profile (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  const imported = JSON.parse(fs.readFileSync(importOut, 'utf8'));
  assert(imported.length === 1 && imported[0].key_points.length === 3 && imported[0].quotes[0].paraphrased === false, 'three points and one verbatim quote are read');
  assert(imported[0].display_name === 'Marigold' && imported[0].avatar.file === 'p01.svg' && imported[0].show_country === false, 'trailing comments are stripped, the avatar file is the bare name, no becomes false');
  assert(!JSON.stringify(imported).includes('intake-01') && !('intake' in imported[0]), 'the intake path never reaches the output');
  r = tryImport({ h1: 'Marigold · 12-14 · Eastern Africa · in school' });
  assert(r.code === 1 && r.out.includes('H1 is') && !fs.existsSync(importOut), 'refuses an H1 that disagrees with the frontmatter, and writes nothing');
  r = tryImport({ quote: '> "Nobody at school is trained for this." (verbatim, about a teacher)' });
  assert(r.code === 1 && r.out.includes('In their words'), 'refuses a quote line it cannot read instead of dropping it');
  r = tryImport({ quote: '> "Nobody at school – nobody – is trained." (verbatim)' });
  assert(r.code === 1 && r.out.includes('em or en dash'), 'refuses an en dash');
  r = tryImport({ date: '2026-08-14' });
  assert(r.code === 1 && r.out.includes('consent.date'), 'refuses a consent date that names a day');
  r = tryImport({ verified: 'null' });
  assert(r.code === 1 && r.out.includes('verified_safe_messaging'), 'refuses a profile whose critic dates are null');
  r = tryImport({ pseudonym: 'withheld (by the review)', display: 'Name withheld', h1: 'Name withheld · 15-17 · Eastern Africa · in school' });
  assert(r.code === 0 && JSON.parse(fs.readFileSync(importOut, 'utf8'))[0].pseudonym === 'Name withheld', 'a withheld profile carries its display name in the pseudonym field, never a working name');
  write(path.join(mdDir, 'p01-marigold.md'), md());
  r = run('import-profiles.mjs', ['--from', mdDir, '--out', path.join(REPO_ROOT, 'site', 'data', 'profiles.json')]);
  assert(r.code === 1 && r.out.includes('public') && !fs.existsSync(path.join(REPO_ROOT, 'site', 'data', 'profiles.json')), 'refuses to write the consent-carrying file anywhere inside the repository');

  // ---------- 404.html: the one page written from the site root ----------
  // GitHub Pages serves it for any missing path, so relative URLs on it resolve against a directory
  // that does not exist. The exemption is one named file and one prefix: everything else still refuses.
  console.log('\n404.html: root-absolute, and nothing else is');
  const notFound = page('Not found', 0)
    .replace('href="assets/site.css?v=20200101"', 'href="/well-to-learn/assets/site.css?v=20200101"');
  write(path.join(site, '404.html'), notFound);
  r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 0, `stamp exits 0 with 404.html present (got ${r.code})`);
  const nf = fs.readFileSync(path.join(site, '404.html'), 'utf8');
  assert(nf.includes('href="/well-to-learn/atlas/"') && nf.includes('href="/well-to-learn/about/"'), '404.html nav and footer are stamped from the site root');
  assert(nf.includes('href="/well-to-learn/index.html"'), '404.html home link is written from the site root');
  assert(nf.includes(`/well-to-learn/assets/site.css?v=${TODAY}`), '404.html root-absolute asset still gets its ?v= bumped');
  const homeRel = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  assert(homeRel.includes('href="atlas/"') && !homeRel.includes('href="/well-to-learn/atlas/"'), 'every other page still gets relative nav links');
  r = run('stamp.mjs', ['--root', A]);
  assert(r.code === 0 && /0 changed/.test(r.out), 'stamp is idempotent with 404.html present');
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 0, `check accepts basePath URLs on 404.html (got ${r.code})\n${r.code === 0 ? '' : r.out}`);

  write(path.join(site, 'stray', 'index.html'), page('Stray', 1).replace('<p>Hello.</p>', '<p><a href="/well-to-learn/atlas/">absolute</a></p>'));
  run('stamp.mjs', ['--root', A]);
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1 && r.out.includes('site-absolute'), 'a site-absolute URL on any page other than 404.html is still refused');
  fs.rmSync(path.join(site, 'stray'), { recursive: true });

  fs.writeFileSync(path.join(site, '404.html'), nf.replace('/well-to-learn/assets/site.css', '/assets/site.css'));
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1 && r.out.includes('must start with the basePath'), '404.html refuses a site-absolute URL outside the basePath');
  fs.writeFileSync(path.join(site, '404.html'), nf.replace('/well-to-learn/assets/site.css', '/well-to-learn/assets/gone.css'));
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 1 && r.out.includes('target not found'), '404.html root-absolute URLs are still resolved against a real file');
  fs.writeFileSync(path.join(site, '404.html'), nf);
  r = run('check.mjs', ['--root', A]);
  assert(r.code === 0, `check is clean again once 404.html is restored (got ${r.code})\n${r.code === 0 ? '' : r.out}`);

  // ---------- build-rights ----------
  // The fixture chapter is invented test text about an invented instrument. It is never published.
  console.log('\nbuild-rights: valid build');
  const C = path.join(tmp, 'c');
  copyTools(C);
  const csite = path.join(C, 'site');
  const ccontent = path.join(C, 'content', 'rights');
  write(path.join(csite, 'index.html'), page('Home', 0));
  for (const dir of ['atlas', 'voices', 'act', 'about', 'methodology']) write(path.join(csite, dir, 'index.html'), page(dir, 1));
  write(path.join(csite, 'assets', 'site.css'), 'body{}\n');
  write(path.join(csite, 'assets', 'tokens.css'), ':root{}\n');
  write(path.join(csite, 'assets', 'site.js'), '\n');
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) write(path.join(csite, f), '');
  write(path.join(csite, 'sitemap.xml'), sitemap(['', 'atlas/', 'voices/', 'act/', 'about/', 'methodology/', 'rights/', 'rights/fixture-one/']));
  const manifest = [
    { n: 1, slug: 'fixture-one', title: 'Fixture one', state: 'unused while published' },
    { n: 2, slug: 'fixture-two', title: 'Fixture two', state: 'checked; waiting for approval' },
  ];
  write(path.join(ccontent, 'chapters.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const chapter = (over = {}) => {
    const o = {
      status: 'approved', approved: 'approved_by_bella: 2026-01-02\n', cleared: 'critic_cleared: 2026-01-01\n', title: 'Fixture one',
      quote: '"an exact fixture phrase" ([Fixture Treaty](https://example.test/treaty.pdf)).', means: 'Plain words & an ampersand, with **bold** and a [link](https://example.test/gc?a=1&b=2).', extra: '', unverified: 'unverified: []', ...over,
    };
    return `---\ntype: rights-chapter\nproject: well-to-learn\nchapter: 1\ntitle: ${o.title}\nstatus: ${o.status}\n${o.approved}${o.cleared}drafted: 2026-01-01\nsources:\n  - Fixture Treaty: https://example.test/treaty.pdf\n${o.unverified}\n---\n\n# 1. ${o.title}\n\nThe opening paragraph of the fixture.\n\n## A fixture block\n\n**Claim.** The fixture claims one thing.\n**Instrument.** Fixture Treaty, article 1.\n**Quote.** ${o.quote}\n**What it means for you.** ${o.means}\n**Where it often fails.** It fails in fixtures.\n**What you can ask for.** Ask for a fixture.\n${o.extra}\n## What this chapter does not say\n\n- **A fixture is not a treaty.** It binds nobody.\n`;
  };
  const chFile = path.join(ccontent, 'ch-01-fixture-one.md');
  write(chFile, chapter());
  run('stamp.mjs', ['--root', C]);
  r = run('build-rights.mjs', ['--root', C]);
  assert(r.code === 0 && /1 of 2 chapter\(s\) published/.test(r.out), `build-rights builds one approved chapter of two (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  const chPage = path.join(csite, 'rights', 'fixture-one', 'index.html');
  const chHtml = fs.existsSync(chPage) ? fs.readFileSync(chPage, 'utf8') : '';
  const contentsHtml = fs.readFileSync(path.join(csite, 'rights', 'index.html'), 'utf8');
  assert((chHtml.match(/class="kyr-row /g) || []).length === 6, 'the chapter page carries all six labelled lines of the block');
  assert(chHtml.includes('<a href="https://example.test/treaty.pdf" rel="noopener">Fixture Treaty</a>'), 'a source link is drawn as a link, with rel="noopener"');
  assert(chHtml.includes('Plain words &amp; an ampersand') && chHtml.includes('<strong>bold</strong>') && chHtml.includes('gc?a=1&amp;b=2'), 'text and URLs are HTML-escaped, bold is drawn');
  assert(chHtml.includes('<time datetime="2026-01-02">') && chHtml.includes('<time datetime="2026-01-01">'), 'the page prints the approval date and the check date');
  assert(chHtml.includes('<strong>A fixture is not a treaty.</strong>'), 'the "does not say" list is carried onto the page');
  assert(chHtml.includes('class="crisis"') && !/\{\{[^}]*\}\}/.test(chHtml), 'the chapter page is stamped with the help block and has no unresolved placeholders');
  assert(contentsHtml.includes('<a class="ch-title" href="fixture-one/">Fixture one</a>'), 'the contents list links the published chapter');
  assert(contentsHtml.includes('<span class="ch-title">Fixture two</span><span class="ch-state">checked; waiting for approval</span>') && !contentsHtml.includes('fixture-two/'), 'an unpublished chapter prints its status line and is not a link');
  assert(contentsHtml.includes('1 of 2 published'), 'the contents page counts what is published');
  const rsnap = snapshot(csite);
  r = run('build-rights.mjs', ['--root', C]);
  assert(r.code === 0 && sameSnapshot(rsnap, snapshot(csite)), 'build-rights is deterministic (second run, no diff)');
  r = run('check.mjs', ['--root', C]);
  assert(r.code === 0, `check passes on the generated chapter and contents pages (got ${r.code})\n${r.code === 0 ? '' : r.out}`);

  console.log('\nbuild-rights: refusal');
  const refuses = (label, over, needle) => {
    write(chFile, chapter(over));
    const before = snapshot(csite);
    const rr = run('build-rights.mjs', ['--root', C]);
    assert(rr.code === 1 && rr.out.includes(needle) && sameSnapshot(before, snapshot(csite)), `refuses ${label}, names it, writes nothing`);
  };
  refuses('a chapter that is not approved', { status: 'draft' }, 'not "approved"');
  refuses('a chapter with no approval date', { approved: '' }, 'approved_by_bella');
  refuses('a chapter with no check date', { cleared: '' }, 'critic_cleared');
  refuses('a title that disagrees with chapters.json', { title: 'Another title' }, 'chapters.json');
  refuses('a Quote line with no link', { quote: '"an exact fixture phrase" (Fixture Treaty).' }, 'no link');
  refuses('a quote of 15 words or more', { quote: '"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen" ([T](https://example.test/t)).' }, 'limit is under 15');
  refuses('an em dash', { means: 'A sentence — with a dash.' }, 'en or em dash');
  refuses('a banned phrase', { means: 'There is an epidemic of fixtures.' }, 'banned phrase');
  refuses('a link that is not https', { means: 'See [this](http://example.test/x).' }, 'not https');
  refuses('raw HTML', { means: 'A <b>tag</b>.' }, 'raw "<"');
  refuses('a table, which it cannot draw', { extra: '\n| a | b |\n|---|---|\n' }, 'does not draw');
  refuses('a deeper heading, which it cannot draw', { extra: '\n### Deeper\n' }, 'does not draw');
  refuses('an [UNVERIFIED] marker', { means: 'A claim [UNVERIFIED: could not open https://example.test/x].' }, 'UNVERIFIED');
  refuses('a non-empty unverified list', { unverified: 'unverified:\n  - "one open item"' }, 'unverified');
  write(chFile, chapter());
  write(path.join(csite, 'rights', 'withdrawn', 'index.html'), page('Withdrawn', 2));
  r = run('build-rights.mjs', ['--root', C]);
  assert(r.code === 1 && r.out.includes('site/rights/withdrawn/'), 'refuses while a folder for an unpublished chapter is still being served');
  fs.rmSync(path.join(csite, 'rights', 'withdrawn'), { recursive: true });
  r = run('build-rights.mjs', ['--root', C]);
  assert(r.code === 0, `builds again once the fixture is restored (got ${r.code})`);

  // ---------- build-methodology ----------
  // Invented fixture data: three states, two indicators. The page must print what it COUNTS.
  console.log('\nbuild-methodology: counts come from the data');
  const field = (o) => ({ value: null, year: null, source: 'fx', ...o });
  const fxAtlas = {
    built: '2026-01-03',
    countries: {
      AAA: { iso3: 'AAA', name: 'Aland', indicators: { rate: field({ value: 1.5, year: 2010, stale: true, age: 16 }), law: field({ value: 'YES' }) } },
      BBB: { iso3: 'BBB', name: 'Bland', indicators: { rate: field({ value: 0, year: 2020, reported_zero: true, qualifier: 'NAT_EST' }), law: field({ value: 'NO', confirmed: false }) } },
      CCC: { iso3: 'CCC', name: 'Cland', indicators: { rate: field({ value: null }) } },
    },
  };
  const fxIndicators = { indicators: [
    { id: 'rate', label: 'Fixture rate', short: 'Rate', kind: 'modelled', source: 'fx', layer: true, max_age: 5, note: 'A fixture note.' },
    { id: 'law', label: 'Fixture law', short: 'Law', kind: 'legal', source: 'fx', layer: false, max_age: null, note: 'Another fixture note.' },
  ] };
  const fxSources = { sources: [{ id: 'fx', name: 'Fixture source', url: 'https://example.test/src', publisher: 'Fixture Office', licence: 'CC BY 4.0', attribution: 'Fixture Office, read 2026-01-03.', may_not: null, extracted: '2026-01-03' }] };
  const fxCoverage = (failed) => `# Atlas data coverage\n\n## Failed joins\n\n${failed}\n\n## Deliberately ignored\n\n| Source | Name | Rows |\n|---|---|---|\n| fx | Nowhere Union | 2 |\n\n## Sanity findings\n\nNone.\n`;
  write(path.join(csite, 'data', 'atlas.json'), JSON.stringify(fxAtlas));
  write(path.join(csite, 'data', 'indicators.json'), JSON.stringify(fxIndicators));
  write(path.join(csite, 'data', 'sources.json'), JSON.stringify(fxSources));
  write(path.join(C, 'docs', 'coverage.md'), fxCoverage('None. Every name resolved.'));
  write(path.join(C, 'data', 'verification', 'spotcheck-2026-01-04.csv'), 'country,indicator,site value,source value,source url,verdict,checked by,date\nAAA (Aland),rate,1.5,1.5,https://example.test/a,CONFIRMED,Critic,2026-01-04\n"BBB (Bland)",law,NO,,"https://example.test/b,c",CANNOT VERIFY,Critic,2026-01-04\n');
  r = run('build-methodology.mjs', ['--root', C]);
  assert(r.code === 0, `build-methodology builds from fixture data (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  const mHtml = fs.readFileSync(path.join(csite, 'methodology', 'index.html'), 'utf8');
  assert(mHtml.includes('<td class="n">2</td><td>2010 to 2020</td><td>5 years</td><td class="n">1</td>'), 'the indicator row prints states with a value, the year range, the limit and the stale count it counted');
  assert(mHtml.includes('<td class="n">2</td><td>no year: a legal or yes-or-no fact</td><td>none</td><td class="n">not applicable</td>'), 'a legal indicator prints no year and no stale count');
  assert(mHtml.includes('1 values carry that mark') && mHtml.includes('1 values are a country') && mHtml.includes('1 entries are ones'), 'stale, national-estimate and unconfirmed totals are counted, not typed');
  assert(mHtml.includes('Bland (Rate)'), 'a reported zero is named with its country');
  assert(mHtml.includes('Nowhere Union, in the source "fx" (2 rows): it has no ISO 3166-1 code.'), 'the ignore list is read out of coverage.md and printed by name');
  assert(mHtml.includes('4 January 2026') && mHtml.includes('<dt>Confirmed</dt><dd>1</dd>') && mHtml.includes('<dt>Could not be verified</dt><dd>1</dd>'), 'the newest spot check is counted from its CSV, with its date');
  assert(mHtml.includes('two countries') && mHtml.includes('Aland and Bland'), 'the spot-check countries are listed from the CSV');
  assert(mHtml.includes('Of the 2 chapters, one is published so far') && mHtml.includes('No profile is published yet'), 'published chapters and profiles are counted from the repository');
  assert(mHtml.includes('class="crisis"') && !/\{\{[^}]*\}\}/.test(mHtml), 'the page is stamped and has no unresolved placeholders');
  const msnap = snapshot(csite);
  r = run('build-methodology.mjs', ['--root', C]);
  assert(r.code === 0 && sameSnapshot(msnap, snapshot(csite)), 'build-methodology is deterministic (second run, no diff)');
  r = run('check.mjs', ['--root', C]);
  assert(r.code === 0, `check passes on the generated methodology page (got ${r.code})\n${r.code === 0 ? '' : r.out}`);
  write(path.join(C, 'docs', 'coverage.md'), fxCoverage('| Source | Name |\n|---|---|\n| fx | Atlantis |'));
  r = run('build-methodology.mjs', ['--root', C]);
  assert(r.code === 1 && r.out.includes('Failed joins') && sameSnapshot(msnap, snapshot(csite)), 'refuses to claim "no failed joins" when coverage.md lists one, and writes nothing');
  write(path.join(C, 'docs', 'coverage.md'), fxCoverage('None.'));
  fs.rmSync(path.join(C, 'data', 'verification'), { recursive: true });
  r = run('build-methodology.mjs', ['--root', C]);
  assert(r.code === 1 && r.out.includes('spotcheck'), 'refuses when there is no spot-check file to count from');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
