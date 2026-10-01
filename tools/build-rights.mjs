#!/usr/bin/env node
// build-rights.mjs: content/rights/ch-NN-<slug>.md -> site/rights/<slug>/index.html (one per APPROVED
// chapter) and site/rights/index.html (the contents list, all nine, each with a link or a status line).
//
//   node tools/build-rights.mjs [--root <repo>]
//
// WHY THE CHAPTERS LIVE IN THE REPO. Until 2026-10-01 the nine chapters were markdown in a private
// project folder, so a fresh clone could not rebuild the guide and no reader could read a line of it.
// An approved chapter is now copied INTO content/rights/ and generated like a voices page is. A
// chapter that is not approved is not copied here at all: this repository is public, so a draft in
// it would be a published draft. The contents list still names all nine, from chapters.json, and an
// unpublished chapter prints its honest status line instead of a link.
//
// REFUSES the whole build (exit 1, nothing written) when:
//   - a ch-*.md in content/rights/ is not `status: approved`, or lacks `approved_by_bella` or
//     `critic_cleared` as YYYY-MM-DD dates
//   - a chapter's number, slug or title disagrees with chapters.json
//   - check-copy finds a banned phrase, an en or em dash, an over-long quote or missing frontmatter
//   - the chapter still carries an [UNVERIFIED: ...] marker
//   - a **Quote.** line carries no link, or a block lacks one of its six labelled lines
//   - the markdown uses anything this small renderer does not draw (a table, an image, raw HTML, a
//     deeper heading, a link that is not https). Refusing is the point: a construct that is silently
//     skipped is a sentence a reader never sees and nobody notices is gone.
//   - site/rights/ holds a chapter folder that is no longer published (delete it by hand)
// Output is deterministic: run twice, no diff.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  layout, parseArgs, readJson, writeIfChanged, render, escapeHtml,
} from './lib/common.mjs';
import { loadPartials, stampHtml } from './stamp.mjs';
import { checkChapter } from './check-copy.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^ch-(\d\d)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const NOT_SAID = 'What this chapter does not say';
const NUMBER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// The six labelled lines of a block, in the order the drafting brief fixes. `key` names the CSS hook.
export const FIELDS = [
  { label: 'Claim', key: 'claim' },
  { label: 'Instrument', key: 'instrument' },
  { label: 'Quote', key: 'quote' },
  { label: 'What it means for you', key: 'means' },
  { label: 'Where it often fails', key: 'fails' },
  { label: 'What you can ask for', key: 'ask' },
];
const FIELD_BY_LABEL = new Map(FIELDS.map((f) => [f.label, f]));

// ---------- frontmatter ----------

// Scalars (`key: value`) and one level of list (`  - item`). A trailing "# comment" on a scalar is
// dropped; list items are kept whole, because a source URL may legitimately contain a "#".
export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: null, body: text };
  const data = {};
  let listKey = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && listKey) {
      data[listKey].push(item[1].trim().replace(/^"(.*)"$/, '$1'));
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const value = kv[2].replace(/\s+#.*$/, '').trim();
    if (value === '' || value === '[]') {
      data[kv[1]] = [];
      listKey = value === '' ? kv[1] : null;
    } else {
      data[kv[1]] = value;
      listKey = null;
    }
  }
  return { data, body: text.slice(m[0].length) };
}

// ---------- inline markdown ----------

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

// Escape first, then draw the two inline constructs the chapters use: a link and bold.
// Returns { html, problems }.
export function inline(text) {
  const problems = [];
  if (/[<>]/.test(text)) problems.push(`raw "<" or ">" in: ${text.slice(0, 60)}`);
  if (/!\[/.test(text)) problems.push(`an image in: ${text.slice(0, 60)}`);
  if (/`/.test(text)) problems.push(`a code span in: ${text.slice(0, 60)}`);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    out += escapeHtml(text.slice(last, m.index));
    if (!/^https:\/\//.test(m[2])) problems.push(`link is not https: ${m[2]}`);
    out += `<a href="${escapeHtml(m[2])}" rel="noopener">${escapeHtml(m[1])}</a>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  if (/\]\(|\*\*/.test(out)) problems.push(`markdown left undrawn in: ${text.slice(0, 60)}`);
  return { html: out, problems };
}

// ---------- block parser ----------

// Returns { title, number, intro: [html], sections: [{ heading, fields: [{label,key,html}], body: [html] }],
// notSaid: [html], problems: [] }.
export function parseChapter(body) {
  const problems = [];
  const use = (text, where) => {
    const r = inline(text);
    for (const p of r.problems) problems.push(`${where}: ${p}`);
    return r.html;
  };
  const out = { title: null, number: null, intro: [], sections: [], notSaid: [] };
  let section = null; // null = before the first ##
  let list = null; // { type: 'ul' | 'ol', items: [] }
  const sink = () => (section ? section.body : out.intro);
  const closeList = () => {
    if (!list) return;
    const items = list.items.map((i) => `<li>${i}</li>`).join('\n');
    if (section && section.heading === NOT_SAID && list.type === 'ul') out.notSaid.push(...list.items);
    else sink().push(`<${list.type}>\n${items}\n</${list.type}>`);
    list = null;
  };

  body.split('\n').forEach((raw, i) => {
    const where = `body line ${i + 1}`;
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      return;
    }
    const h1 = /^# (\d+)\. (.+)$/.exec(line);
    if (h1) {
      closeList();
      if (out.title !== null) problems.push(`${where}: a second "# N. Title" heading`);
      out.number = Number(h1[1]);
      out.title = h1[2].trim();
      return;
    }
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      closeList();
      section = { heading: h2[1].trim(), fields: [], body: [] };
      out.sections.push(section);
      return;
    }
    if (/^#/.test(line)) {
      problems.push(`${where}: a heading this renderer does not draw: ${line.slice(0, 40)}`);
      return;
    }
    if (/^\s*(\||>|```|---|\*\*\*)/.test(line)) {
      problems.push(`${where}: a construct this renderer does not draw: ${line.slice(0, 40)}`);
      return;
    }
    const field = /^\*\*([^*]+)\.\*\*\s+(.+)$/.exec(line);
    if (field && section && FIELD_BY_LABEL.has(field[1])) {
      closeList();
      const f = FIELD_BY_LABEL.get(field[1]);
      if (f.key === 'quote' && !LINK_RE.test(field[2])) problems.push(`${where}: a Quote line with no link to its source`);
      LINK_RE.lastIndex = 0;
      section.fields.push({ label: f.label, key: f.key, html: use(field[2], where) });
      return;
    }
    const ul = /^- (.+)$/.exec(line);
    const ol = /^\d+\. (.+)$/.exec(line);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (list && list.type !== type) closeList();
      if (!list) list = { type, items: [] };
      list.items.push(use((ul || ol)[1], where));
      return;
    }
    if (/^\s/.test(raw)) {
      problems.push(`${where}: an indented line this renderer does not draw: ${line.trim().slice(0, 40)}`);
      return;
    }
    closeList();
    sink().push(`<p>${use(line, where)}</p>`);
  });
  closeList();

  if (out.title === null) problems.push('no "# N. Title" heading');
  if (out.intro.length === 0) problems.push('no opening paragraph before the first block');
  for (const s of out.sections) {
    if (s.heading === NOT_SAID) {
      if (s.fields.length || s.body.length) problems.push(`"${NOT_SAID}" must be a plain list and nothing else`);
      continue;
    }
    // A block either carries all six labelled lines, in order, or none (a plain section).
    if (s.fields.length === 0) continue;
    const got = s.fields.map((f) => f.label).join(' | ');
    const want = FIELDS.map((f) => f.label).join(' | ');
    if (got !== want) problems.push(`"${s.heading}": labelled lines are [${got}], expected [${want}]`);
  }
  if (out.notSaid.length === 0) problems.push(`no "${NOT_SAID}" list`);
  return { ...out, problems };
}

// ---------- rendering ----------

function sectionHtml(s, idx) {
  const id = `s${idx + 1}`;
  const parts = [`      <section class="entry" aria-labelledby="${id}">`, `        <h2 id="${id}">${escapeHtml(s.heading)}</h2>`];
  if (s.fields.length) {
    // Free text between the labelled lines (a numbered list of steps, say) sits above the register.
    if (s.body.length) parts.push(`        <div class="entry-body">\n${s.body.map((b) => `          ${b}`).join('\n')}\n        </div>`);
    parts.push('        <dl class="kyr">');
    for (const f of s.fields) {
      parts.push(`          <div class="kyr-row kyr-${f.key}"><dt>${escapeHtml(f.label)}</dt><dd>${f.html}</dd></div>`);
    }
    parts.push('        </dl>');
  } else {
    parts.push(`        <div class="entry-body">\n${s.body.map((b) => `          ${b}`).join('\n')}\n        </div>`);
  }
  parts.push('      </section>');
  return parts.join('\n');
}

function sourceItem(line) {
  const at = line.lastIndexOf(': https://');
  if (at === -1) return null;
  return { name: line.slice(0, at).trim(), url: line.slice(at + 2).trim() };
}

// ---------- main ----------

export function loadChapters(contentDir) {
  const refusals = [];
  const manifestFile = path.join(contentDir, 'chapters.json');
  let manifest;
  try {
    manifest = readJson(manifestFile);
  } catch (err) {
    return { refusals: [`cannot read ${manifestFile}: ${err.message}`], manifest: [], published: new Map() };
  }
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return { refusals: ['chapters.json: must be a non-empty array'], manifest: [], published: new Map() };
  }
  manifest.forEach((c, i) => {
    if (c.n !== i + 1) refusals.push(`chapters.json[${i}]: n must be ${i + 1}`);
    if (typeof c.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) refusals.push(`chapters.json[${i}]: bad slug`);
    if (typeof c.title !== 'string' || !c.title.trim()) refusals.push(`chapters.json[${i}]: missing title`);
    if (typeof c.state !== 'string' || !c.state.trim()) refusals.push(`chapters.json[${i}]: missing state (the status line printed while the chapter is not published)`);
  });

  const published = new Map();
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md')).sort();
  for (const file of files) {
    const fm = FILE_RE.exec(file);
    if (!fm) {
      refusals.push(`${file}: not named ch-NN-<slug>.md`);
      continue;
    }
    const n = Number(fm[1]);
    const entry = manifest[n - 1];
    const text = fs.readFileSync(path.join(contentDir, file), 'utf8');
    const { data, body } = parseFrontmatter(text);
    const bad = (why) => refusals.push(`REFUSED ${file}: ${why}`);
    if (!data) {
      bad('no frontmatter');
      continue;
    }
    if (!entry) bad(`chapter ${n} is not in chapters.json`);
    else {
      if (entry.slug !== fm[2]) bad(`slug "${fm[2]}" is not chapters.json's "${entry.slug}"`);
      if (entry.title !== data.title) bad(`title "${data.title}" is not chapters.json's "${entry.title}"`);
    }
    if (Number(data.chapter) !== n) bad(`frontmatter chapter ${data.chapter} is not ${n}`);
    if (data.status !== 'approved') bad(`status is "${data.status}", not "approved". An unapproved chapter does not belong in this public repository at all`);
    for (const key of ['approved_by_bella', 'critic_cleared']) {
      if (typeof data[key] !== 'string' || !DATE_RE.test(data[key])) bad(`${key}: missing or not YYYY-MM-DD`);
    }
    if (!Array.isArray(data.sources) || data.sources.length === 0) bad('sources: empty');
    else data.sources.forEach((s) => { if (!sourceItem(s)) bad(`sources: "${s.slice(0, 50)}" is not "name: https://..."`); });
    if (!Array.isArray(data.unverified) || data.unverified.length) bad('unverified: must be an empty list on a published chapter');

    const lint = checkChapter(text, file);
    for (const p of lint.problems) bad(p);
    if (lint.unverified) bad(`${lint.unverified} [UNVERIFIED: ...] marker(s) still in the text`);

    const parsed = parseChapter(body);
    for (const p of parsed.problems) bad(p);
    if (parsed.title !== null && parsed.title !== data.title) bad(`heading "${parsed.title}" is not the frontmatter title`);
    if (parsed.number !== null && parsed.number !== n) bad(`heading number ${parsed.number} is not ${n}`);
    published.set(n, { file, data, parsed });
  }
  return { refusals, manifest, published };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  const contentDir = path.join(L.root, 'content', 'rights');
  if (!fs.existsSync(contentDir)) {
    console.error(`build-rights: no ${contentDir}`);
    return 1;
  }

  const { refusals, manifest, published } = loadChapters(contentDir);

  // A folder under site/rights/ for a chapter that is no longer published is a page still being served.
  const rightsDir = path.join(L.site, 'rights');
  const liveSlugs = new Set([...published.keys()].map((n) => manifest[n - 1] && manifest[n - 1].slug));
  if (fs.existsSync(rightsDir)) {
    for (const entry of fs.readdirSync(rightsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !liveSlugs.has(entry.name)) {
        refusals.push(`site/rights/${entry.name}/ exists but that chapter is not published; delete the folder by hand`);
      }
    }
  }

  if (refusals.length) {
    console.error(`build-rights: refusing to build; ${refusals.length} problem(s), nothing written.`);
    for (const r of refusals) console.error(`  ${r}`);
    return 1;
  }

  const config = readJson(L.config);
  const partials = loadPartials(L.partials);
  const version = config.version;
  const chapterTpl = fs.readFileSync(path.join(L.templates, 'chapter.html'), 'utf8');
  const contentsTpl = fs.readFileSync(path.join(L.templates, 'rights.html'), 'utf8');
  const total = manifest.length;
  let written = 0;
  const outputs = [];

  for (const [n, ch] of published) {
    const entry = manifest[n - 1];
    const relPath = `rights/${entry.slug}/index.html`;
    const blocks = ch.parsed.sections.filter((s) => s.heading !== NOT_SAID);
    const view = {
      site: config,
      version,
      root: '../../',
      n,
      total,
      title: entry.title,
      lede: ch.parsed.intro[0].replace(/^<p>|<\/p>$/g, ''),
      intro_rest: ch.parsed.intro.slice(1).join('\n        '),
      has_intro_rest: ch.parsed.intro.length > 1,
      description: ch.parsed.intro[0].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'),
      sections: blocks.map(sectionHtml).join('\n\n'),
      not_said: ch.parsed.notSaid,
      sources: ch.data.sources.map(sourceItem),
      approved_by_bella: ch.data.approved_by_bella,
      critic_cleared: ch.data.critic_cleared,
    };
    const { html, missing } = stampHtml(render(chapterTpl, view), { config, partials, relPath, version });
    if (missing.length) {
      console.error(`build-rights: template chapter.html lacks marker pair(s): ${missing.join(', ')}`);
      return 1;
    }
    if (writeIfChanged(path.join(L.site, relPath), html)) written += 1;
    outputs.push(relPath);
  }

  const count = published.size;
  const contentsView = {
    site: config,
    version,
    root: '../',
    total,
    count,
    none: count === 0,
    some: count > 0,
    count_words: count === 1 ? 'One chapter is' : `${cap(NUMBER_WORDS[count] || String(count))} chapters are`,
    rest_words: total - count === 1 ? 'one is' : `${NUMBER_WORDS[total - count] || total - count} are`,
    all: count === total,
    chapters: manifest.map((c) => ({
      title: c.title,
      href: `${c.slug}/`,
      published: published.has(c.n),
      state: c.state,
    })),
  };
  const contentsPath = 'rights/index.html';
  const contents = stampHtml(render(contentsTpl, contentsView), { config, partials, relPath: contentsPath, version });
  if (contents.missing.length) {
    console.error(`build-rights: template rights.html lacks marker pair(s): ${contents.missing.join(', ')}`);
    return 1;
  }
  if (writeIfChanged(path.join(L.site, contentsPath), contents.html)) written += 1;
  outputs.push(contentsPath);

  console.log(`build-rights: ${count} of ${total} chapter(s) published, ${outputs.length} output(s), ${written} written, ${outputs.length - written} unchanged.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
