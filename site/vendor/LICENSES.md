# Third-party files vendored in `site/vendor/`

Recorded 2026-09-04 (system clock) for Well to Learn. Every runtime library and the base map are served from this folder by relative URL; the site makes no runtime call to any CDN. Nothing in this folder is edited by hand except this file and `iso-codes.json` (a derived data file, see below). Re-verify any row with the commands at the end.

| File | Package | Exact version | Licence (as declared by the package) | sha256 |
|---|---|---|---|---|
| `d3.v7.min.js` | d3 (npm) | 7.9.0 | ISC | `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539` |
| `topojson-client.min.js` | topojson-client (npm) | 3.1.0 | ISC | `25cd02ae486cc5063e0215a4e4cfb15de83700c87ac48bac4d57dc6aaf3ebb89` |
| `countries-110m.json` | world-atlas (npm) | 2.0.2 | ISC (processing); underlying data Natural Earth, public domain | `2516c915867c7baf18ddec727aec46c315541a07cfb3d79a6559b05d5e94eee8` |
| `iso-codes.json` | derived from lukes/ISO-3166-Countries-with-Regional-Codes (GitHub) | commit `99cdae15c839bb4f94a23db4e47b4a4c590dec61` (2024-06-19), README tag 10.0 | CC BY-SA 4.0 | `2a6c01374f830dd77973b0f8d5851cc04e242afd923a6422c4427f08f7923656` |

How the licence names were established: the three npm packages ship a `LICENSE` file that carries permission text without a title; the name "ISC" comes from the `license` field of each package's `package.json` at the exact version listed (read from the same CDN path on 2026-09-04), and the permission text in each file is the standard ISC wording. The ISO data licence is named inside the repository's own `LICENSE.md`. No licence name below is inferred from memory.

## d3.v7.min.js

- Package: `d3`, version **7.9.0** (resolved from `https://cdn.jsdelivr.net/npm/d3@7/package.json`, `"version": "7.9.0"`, `"license": "ISC"`).
- Source URL: `https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js` (HTTP 200, 279,706 bytes, downloaded 2026-09-04).
- First line of the file (version banner): `// https://d3js.org v7.9.0 Copyright 2010-2023 Mike Bostock`
- sha256: `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539`
- Upstream: https://github.com/d3/d3 · author Mike Bostock · https://d3js.org
- Licence: ISC. Licence file read from `https://cdn.jsdelivr.net/npm/d3@7.9.0/LICENSE` (731 bytes). Text verbatim:

```
Copyright 2010-2023 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## topojson-client.min.js

- Package: `topojson-client`, version **3.1.0** (resolved from `https://cdn.jsdelivr.net/npm/topojson-client@3/package.json`, `"version": "3.1.0"`, `"license": "ISC"`).
- Source URL: `https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js` (HTTP 200, 7,169 bytes, downloaded 2026-09-04).
- First line of the file (version banner): `// https://github.com/topojson/topojson-client v3.1.0 Copyright 2019 Mike Bostock`
- sha256: `25cd02ae486cc5063e0215a4e4cfb15de83700c87ac48bac4d57dc6aaf3ebb89`
- Upstream: https://github.com/topojson/topojson-client · author Mike Bostock
- Licence: ISC. Licence file read from `https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/LICENSE` (734 bytes). Text verbatim:

```
Copyright 2012-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## countries-110m.json

- Package: `world-atlas`, version **2.0.2** (resolved from `https://cdn.jsdelivr.net/npm/world-atlas@2/package.json`, `"version": "2.0.2"`, `"license": "ISC"`).
- Source URL: `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json` (HTTP 200, 107,761 bytes, downloaded 2026-09-04).
- sha256: `2516c915867c7baf18ddec727aec46c315541a07cfb3d79a6559b05d5e94eee8`
- Upstream: https://github.com/topojson/world-atlas · author Mike Bostock
- What it is: a TopoJSON `Topology` with two geometry collections, `countries` (177 geometries; 174 carry a three-digit ISO 3166-1 numeric code as a string in `id`, 3 carry no `id`, see "Known join gaps") and `land`. Quantized, unprojected, spherical coordinates in decimal degrees. Each country geometry has `properties.name` (a short display name, not the ISO name).
- Underlying data: **Natural Earth**, Admin 0 country boundaries at 1:110m, version 4.1.0 (stated in the world-atlas README at `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/README.md`). Natural Earth's terms of use (`https://www.naturalearthdata.com/about/terms-of-use/`, opened 2026-09-04) state that all versions of its raster and vector map data are in the public domain and that "No permission is needed to use Natural Earth." Crediting is optional; the Methodology page should still credit Natural Earth and world-atlas.
- Processing licence: ISC, covering world-atlas's conversion of the Natural Earth shapefiles to TopoJSON. Licence file read from `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/LICENSE` (734 bytes). Text verbatim:

```
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## iso-codes.json

This file was **built**, not downloaded verbatim. It is a JSON array of 249 objects, one per ISO 3166-1 country or territory, sorted by numeric code:

```
{ "numeric": "404", "alpha3": "KEN", "alpha2": "KE", "name": "Kenya", "region": "Africa", "sub_region": "Sub-Saharan Africa" }
```

- Source: `https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json` (HTTP 200, 65,317 bytes, downloaded 2026-09-04; sha256 of the source file `e1434e42786484b1841082a0a16cf27208691443dc6440d125ad81d49007ea42`). Repository: https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes.
- Pinned revision: the latest commit touching `all/all.json` is `99cdae15c839bb4f94a23db4e47b4a4c590dec61` (committed 2024-06-19, message "updated 2024-06-19"); the file at that commit is byte-identical to the master download (same sha256). Master HEAD at download time was `145f1ad3caff212ed25f42b0ee2c8b92a75af895` (2024-06-29). The README lists this as tag 10.0 (30 June 2024). The upstream author retrieved the UN M49 data and the Wikipedia ISO 3166-1 table on 19 June 2024 (README "Timestamp").
- Upstream provenance (README): country names and codes merged from the Wikipedia ISO 3166-1 article and the UN Statistics Division M49 "Standard country or area codes for statistical use". The README says the data are not authoritative and should be checked independently before use. The atlas builder's spot-check covers this.
- Transformation applied here (in `tools/atlas/` terms this is a fixed vendored input, regenerate only by repeating these steps): keys renamed `country-code` to `numeric`, `alpha-3` to `alpha3`, `alpha-2` to `alpha2`, `sub-region` to `sub_region`; `name` and `region` kept verbatim; empty strings replaced by `null` (Antarctica `ATA` and Taiwan `TWN` have no M49 region or sub-region in the source); the fields `iso_3166-2`, `intermediate-region`, `region-code`, `sub-region-code`, `intermediate-region-code` were dropped; entries sorted by `numeric`. Names are the upstream's names verbatim (for example `Türkiye`, `Netherlands, Kingdom of the`, `Korea, Democratic People's Republic of`); display names are the atlas builder's concern, never this file's.
- Checks run on the built file: 249 entries; every `numeric` is exactly three digits, every `alpha3` three capitals, every `alpha2` two capitals; no duplicate `numeric` or `alpha3`; the numeric ids 404 (Kenya), 076 (Brazil), 792 (Türkiye), 332 (Haiti), 608 (Philippines) are present. 17 distinct UN M49 sub-regions appear.
- sha256 of the built file: `2a6c01374f830dd77973b0f8d5851cc04e242afd923a6422c4427f08f7923656`
- Licence: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**, read from the repository's `LICENSE.md` (`https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/LICENSE.md`, 214 bytes). Text verbatim (a markdown badge line followed by the notice):

```
![license](https://i.creativecommons.org/l/by-sa/4.0/88x31.png)  
This work is licensed under a [Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/).
```

  Note for the record: GitHub's automatic licence detector reports this repository as "Other / NOASSERTION" because the file is a one-line notice rather than a licence template; the notice itself names CC BY-SA 4.0 and that is what governs. Consequence for this site: `iso-codes.json` is a derived work and is redistributed under CC BY-SA 4.0 with attribution to the upstream repository (this file is that attribution; the Methodology page must repeat it). Any file that merges these codes with other data inherits the ShareAlike condition, which matches the plan's rule that derived JSON is licensed to match its strictest source (UNESCO UIS is also CC BY-SA 4.0).

## Known join gaps

Join performed 2026-09-04: every geometry in `countries-110m.json` (`objects.countries.geometries`) matched by its string `id` against `numeric` in `iso-codes.json`. Result: **177 geometries, 174 matched, 3 unmatched, 0 duplicate ids.** The atlas builder (`tools/atlas/`) inherits this list and must treat the three as "no data, no ISO code" rather than failing the build or coercing anything to zero.

| Geometry `properties.name` | `id` in TopoJSON | Why it does not join | What the atlas builder should do |
|---|---|---|---|
| `N. Cyprus` | none (`id` absent) | Not an ISO 3166-1 country; no numeric code exists | Draw as no-data grey hatch; exclude from the table twin; never label as a country in the card |
| `Somaliland` | none (`id` absent) | Not an ISO 3166-1 country; no numeric code exists | Same as above |
| `Kosovo` | none (`id` absent) | No ISO 3166-1 numeric code; agencies use user-assigned codes instead (World Bank `XKX`, some datasets `XK`), which this base map does not carry. world-atlas 2.0.2 leaves the id absent rather than using the `-99` placeholder of older editions | Draw as grey hatch by default. If an indicator source publishes a Kosovo value under `XKX`, the builder may map it onto this geometry by `properties.name` only through an explicit alias in `tools/atlas/lib/iso-aliases.json`, never by a generic name match |

Two further facts the builder should know:

1. **75 entries in `iso-codes.json` have no geometry at 1:110m** (microstates and dependent territories such as Singapore, Malta, Bahrain, the Caribbean island states, Pacific islands). This is why the plan lists the table twin from `site/data/atlas.json`, never from the geometry, so no state is dropped.
2. **The TopoJSON `properties.name` differs from the ISO name on 29 of the 174 matched ids.** The join is by numeric id, never by name. The 29 are: 834 `Tanzania`, 732 `W. Sahara`, 180 `Dem. Rep. Congo`, 214 `Dominican Rep.`, 643 `Russia`, 238 `Falkland Is.`, 260 `Fr. S. Antarctic Lands`, 068 `Bolivia`, 862 `Venezuela`, 140 `Central African Rep.`, 226 `Eq. Guinea`, 748 `eSwatini`, 275 `Palestine`, 418 `Laos`, 704 `Vietnam`, 408 `North Korea`, 410 `South Korea`, 364 `Iran`, 760 `Syria`, 498 `Moldova`, 792 `Turkey`, 528 `Netherlands`, 090 `Solomon Is.`, 158 `Taiwan`, 826 `United Kingdom`, 096 `Brunei`, 070 `Bosnia and Herz.`, 807 `Macedonia`, 728 `S. Sudan`. Display names on the site come from the atlas builder's own name table, not from either source verbatim.

## How to re-verify (from the repo root)

```sh
cd site/vendor
shasum -a 256 d3.v7.min.js topojson-client.min.js countries-110m.json iso-codes.json
head -1 d3.v7.min.js            # expect: // https://d3js.org v7.9.0 Copyright 2010-2023 Mike Bostock
head -1 topojson-client.min.js  # expect: // https://github.com/topojson/topojson-client v3.1.0 Copyright 2019 Mike Bostock
node -e 'const t=require("./countries-110m.json");const g=t.objects.countries.geometries;console.log(g.length, g.filter(x=>x.id==null).map(x=>x.properties.name))'
node -e 'const a=require("./iso-codes.json");console.log(a.length, ["404","076","792","332","608"].map(n=>a.find(x=>x.numeric===n).alpha3))'
```

Expected: the four sha256 values in the table above; `177 [ 'N. Cyprus', 'Somaliland', 'Kosovo' ]`; `249 [ 'KEN', 'BRA', 'TUR', 'HTI', 'PHL' ]`.
