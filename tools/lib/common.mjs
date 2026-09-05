// Shared helpers for the Well to Learn tooling. Zero dependencies, Node 24.
// Everything here is pure or filesystem-only; nothing touches the network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo root is two levels above this file (repo/tools/lib/common.mjs).
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Parse "--key value" and "--flag" arguments into an object. Positional args land in `_`.
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// Resolve the working layout for a run. `--root` overrides the repo root (the test uses a temp copy).
export function layout(args) {
  const root = path.resolve(args.root || REPO_ROOT);
  return {
    root,
    site: path.resolve(args.site || path.join(root, 'site')),
    tools: path.join(root, 'tools'),
    config: path.join(root, 'tools', 'site.config.json'),
    partials: path.join(root, 'tools', 'partials'),
    templates: path.join(root, 'tools', 'templates'),
  };
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// Write only when the bytes differ, so a re-run leaves mtimes and git alone. Returns true when written.
export function writeIfChanged(file, content) {
  let current = null;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    current = null;
  }
  if (current === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// Today's date from the system clock, in LOCAL time (never UTC: at 20:00 in New York, UTC is tomorrow).
export function todayParts(date = new Date()) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return { y, m, d };
}
export function todayStamp(date) {
  const { y, m, d } = todayParts(date);
  return `${y}${m}${d}`;
}
export function todayIso(date) {
  const { y, m, d } = todayParts(date);
  return `${y}-${m}-${d}`;
}

// Recursively list files under `dir` whose name matches `pred`, as site-relative POSIX paths, sorted.
export function walk(dir, pred = () => true) {
  const found = [];
  const visit = (abs, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(childAbs, childRel);
      else if (entry.isFile() && pred(childRel)) found.push(childRel);
    }
  };
  visit(dir, '');
  return found.sort();
}

export function walkHtml(siteDir) {
  return walk(siteDir, (rel) => rel.endsWith('.html'));
}

// How many "../" a page needs to reach the site root: site/index.html -> "", site/atlas/index.html -> "../".
export function rootFor(relPath) {
  const depth = relPath.split('/').length - 1;
  return '../'.repeat(depth);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A deliberately small mustache: {{name}} (escaped), {{{name}}} (raw), {{#name}}...{{/name}} (array loop
// or truthy conditional), {{^name}}...{{/name}} (inverted), {{.}} (current item), dotted lookups
// ({{site.siteName}}), and lookups walk up the context stack so {{root}} works inside a loop.
export function render(template, view) {
  return renderWithStack(template, [view]);
}

function lookup(stack, name) {
  if (name === '.') return stack[stack.length - 1];
  const parts = name.split('.');
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    let cur = stack[i];
    let ok = true;
    for (const part of parts) {
      if (cur !== null && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok) return cur;
  }
  return undefined;
}

const SECTION_RE = /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;

function renderWithStack(template, stack) {
  let out = template;
  // Sections first (innermost-first is unnecessary: the lazy match finds the first complete pair).
  let m = SECTION_RE.exec(out);
  while (m) {
    const [whole, kind, name, body] = m;
    const value = lookup(stack, name);
    let replacement = '';
    if (kind === '#') {
      if (Array.isArray(value)) {
        replacement = value.map((item) => renderWithStack(body, [...stack, item])).join('');
      } else if (value) {
        replacement = renderWithStack(body, typeof value === 'object' ? [...stack, value] : stack);
      }
    } else if (kind === '^') {
      const empty = Array.isArray(value) ? value.length === 0 : !value;
      if (empty) replacement = renderWithStack(body, stack);
    }
    out = out.slice(0, m.index) + replacement + out.slice(m.index + whole.length);
    m = SECTION_RE.exec(out);
  }
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, name) => {
    const v = lookup(stack, name);
    return v === undefined || v === null ? '' : String(v);
  });
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name) => {
    const v = lookup(stack, name);
    return v === undefined || v === null ? '' : escapeHtml(v);
  });
  return out;
}

// Count words the way a person would: whitespace-separated tokens.
export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}
