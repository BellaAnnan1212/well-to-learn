#!/usr/bin/env node
// draw-avatars.mjs: one static SVG per profile, drawn from its seed, into site/assets/avatars/.
//
//   node tools/draw-avatars.mjs --profiles <profiles.json> --modules <folder holding node_modules>
//
// The drawing library is NOT part of this repository (the site ships no dependency). Install it
// once, anywhere outside the repo:  npm install @dicebear/core@9.4.3 @dicebear/open-peeps@9.4.2
// and pass that folder as --modules. Versions and licences: site/vendor/LICENSES.md.
//
// The seed is the profile's slug, and the options below are THE SAME FOR EVERY PROFILE. Nothing
// here looks at who the person is, so a drawing is never chosen to resemble anyone:
//   - one fill for every face (the card colour) on one disc (ramp-1), drawn in ink: no skin tone
//   - no facial hair, no glasses, no eyepatch, no mask
//   - four calm faces only: a seed must never hand a young person's story a mocking face
//   - no religious head covering and no grey hair, because a random one would say something
//     about a person that nobody chose to say
// Output is deterministic: the same seed and versions give the same bytes.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { layout, parseArgs, readJson, writeIfChanged } from './lib/common.mjs';

export const FACES = ['calm', 'serious', 'smile', 'solemn'];
export const HEADS_EXCLUDED = ['hijab', 'turban', 'grayBun', 'grayMedium', 'grayShort', 'bear'];
const DISC = 'EAEAE1'; // --wtl-ramp-1
const FACE_FILL = 'FFFDF8'; // --wtl-card
const INK = '2B2118'; // --wtl-ink

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const L = layout(args);
  if (!args.profiles || !args.modules) {
    console.error('draw-avatars: usage: --profiles <profiles.json> --modules <folder holding node_modules>');
    return 1;
  }
  const require = createRequire(path.join(path.resolve(args.modules), 'noop.js'));
  let core;
  let style;
  try {
    core = await import(pathToFileURL(require.resolve('@dicebear/core')).href);
    style = await import(pathToFileURL(require.resolve('@dicebear/open-peeps')).href);
  } catch (err) {
    console.error(`draw-avatars: cannot load @dicebear/core and @dicebear/open-peeps from ${args.modules}: ${err.message}`);
    return 1;
  }
  const heads = style.schema.properties.head.items.enum.filter((h) => !HEADS_EXCLUDED.includes(h));
  const profiles = readJson(path.resolve(args.profiles));
  let written = 0;
  for (const p of profiles) {
    if (!p.avatar || p.avatar.seed !== p.slug) {
      console.error(`draw-avatars: ${p.id}: avatar.seed must equal the slug`);
      return 1;
    }
    const svg = core.createAvatar(style, {
      seed: p.avatar.seed,
      size: 160,
      radius: 50,
      backgroundColor: [DISC],
      skinColor: [FACE_FILL],
      clothingColor: [FACE_FILL],
      headContrastColor: [INK],
      face: FACES,
      head: heads,
      facialHairProbability: 0,
      accessoriesProbability: 0,
      maskProbability: 0,
    }).toString();
    if (writeIfChanged(path.join(L.site, 'assets', 'avatars', `${p.id}.svg`), `${svg}\n`)) written += 1;
  }
  console.log(`draw-avatars: ${profiles.length} avatar(s), ${written} written, ${profiles.length - written} unchanged.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
