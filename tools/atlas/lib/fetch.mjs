// Cached fetch for the atlas pipeline. Zero dependencies, Node 24, native fetch.
//
// Every network read lands in data/raw/<source>/<name>.<YYYY-MM-DD>.<ext> and is read back from
// there. `--offline` never touches the network: it reads the NEWEST cache file for a name and fails
// loudly, naming the file it wanted, when there is none. That is the reproducibility gate: the whole
// build must succeed offline and produce the same bytes before anything is pushed.

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, todayIso } from '../../lib/common.mjs';

export const RAW = path.join(REPO_ROOT, 'data', 'raw');

// A browser User-Agent: GCPEA and the End Corporal Punishment host refuse the default one.
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function cacheDir(source) {
  return path.join(RAW, source);
}

// Every cache file for one logical name, newest date first. The date is in the file name, never in
// the file, so the cache is self-describing and the extraction date survives a copy.
export function cacheEntries(source, name, ext) {
  const dir = cacheDir(source);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d{4}-\\d{2}-\\d{2})\\.${ext}$`);
  return entries
    .map((file) => {
      const m = re.exec(file);
      return m ? { file: path.join(dir, file), date: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function newestCache(source, name, ext) {
  return cacheEntries(source, name, ext)[0] || null;
}

// Read a URL through the cache. Returns { body, date, file, fromCache }.
// `date` is the extraction date the JSON will print: it comes from the cache file name.
export async function cachedFetch({ source, name, ext = 'json', url, offline, refresh = false, binary = false, headers = {} }) {
  const today = todayIso();
  const todayFile = path.join(cacheDir(source), `${name}.${today}.${ext}`);

  if (!refresh) {
    const hit = offline ? newestCache(source, name, ext) : (fs.existsSync(todayFile) ? { file: todayFile, date: today } : null);
    if (hit) {
      return {
        body: binary ? fs.readFileSync(hit.file) : fs.readFileSync(hit.file, 'utf8'),
        date: hit.date,
        file: hit.file,
        fromCache: true,
      };
    }
  }

  if (offline) {
    throw new Error(
      `--offline: no cache for ${source}/${name}.*.${ext}. Run without --offline once to write `
      + `${path.relative(REPO_ROOT, todayFile)}, then the offline rebuild will reproduce it.`,
    );
  }

  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${source}/${name}: HTTP ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`${source}/${name}: empty body from ${url}`);
  fs.mkdirSync(cacheDir(source), { recursive: true });
  fs.writeFileSync(todayFile, buf);
  return { body: binary ? buf : buf.toString('utf8'), date: today, file: todayFile, fromCache: false };
}

export async function cachedJson(opts) {
  const r = await cachedFetch({ ...opts, ext: opts.ext || 'json' });
  try {
    return { ...r, data: JSON.parse(r.body) };
  } catch (err) {
    throw new Error(`${opts.source}/${opts.name}: cache file ${r.file} is not JSON (${err.message})`);
  }
}
