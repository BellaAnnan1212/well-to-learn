#!/usr/bin/env node
// test.mjs: exercises stamp.mjs, check.mjs, and build-voices.mjs against temporary copies under os.tmpdir().
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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
