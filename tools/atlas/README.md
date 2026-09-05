# tools/atlas: the Atlas data pipeline (contract, no code yet)

This directory holds the pipeline that turns the ten v1 indicators into `site/data/atlas.json`, `site/data/indicators.json`, `site/data/sources.json`, and `docs/coverage.md`. Written 2026-09-04 from the B3 section of the project plan (`05_Projects/well-to-learn/plan.md`) so the next session builds against a fixed contract. Nothing below exists yet except this file.

## Constraints (same as the rest of the repo)

- Zero-dependency Node 24, ESM (`.mjs`), native `fetch`, imports only from `node:` (fs, path, url, crypto, child_process for `pdftotext`). No `node_modules`, no `npm install`, ever.
- Deterministic output: `node tools/atlas/build-data.mjs --offline` must reproduce the JSON byte for byte from the cache in `data/raw/`. Sort keys, sort countries by ISO3, fixed number formatting, no timestamps inside the JSON other than the dated `extracted` fields that come from the cache file names.
- No data is `null`, never `0`. A source-reported zero is stored, flagged `reported_zero: true`, and listed in coverage.
- Every field carries `value`, `year`, `source` (id into `sources.json`), `tier`, `verified` (date or null).
- No composite score, no ranking. Tiers per indicator with thresholds published in `indicators.json` and printed in the map legend.
- Licences and attribution per source live in `sources.json` and are shown on Methodology. The derived JSON is licensed to match the strictest source it contains.

## Layout

```
tools/atlas/build-data.mjs         entry point: fetch -> ISO3 normalise -> sanity -> JSON + coverage.md
tools/atlas/lib/fetch.mjs          cached fetch: writes data/raw/<source>/<indicator>.<date>.{json,csv,pdf,txt}; browser User-Agent; --offline reads cache only
tools/atlas/lib/iso.mjs            name -> ISO3 resolution using iso-aliases.json; every failed join is named, never guessed
tools/atlas/lib/sanity.mjs         ranges, year within max_age, duplicates, count deltas over 10% vs the last run, treaty-party counts inside bands
tools/atlas/lib/pdf.mjs            pdftotext -layout wrapper (child_process), output cached as .txt beside the .pdf
tools/atlas/lib/iso-aliases.json   hand-maintained aliases (UN Treaty Collection names, WHO names, UIS geoUnits, World Bank codes)
tools/atlas/fetchers/who-gho.mjs   SDGSUICIDE (ages 10-19), MH_12 (age-standardised with Low/High), MH_6 (psychiatrists per 100,000, 2013-2017)
tools/atlas/fetchers/uis.mjs       ROFST.2.CP (out-of-school, lower secondary), CR.2 (completion, lower secondary)
tools/atlas/fetchers/worldbank.mjs SE.LPV.PRIM (learning poverty) plus income group and GDP per capita context; drop the 78 aggregates
tools/atlas/fetchers/treaties.mjs  UN Treaty Collection IV-11 (CRC), IV-3 (ICESCR), IV-15 (CRPD), IV-11-d (OP3-CRC); server-rendered rows; "status as at DATE"
tools/atlas/fetchers/corporal.mjs  End Corporal Punishment global table (PDF, March 2025) via pdftotext, rows not totals; YES / NO / SOME
tools/atlas/fetchers/gcpea.mjs     Education under Attack profiled countries (boolean plus link, never ranked); needs a browser User-Agent
tools/atlas/fetchers/unhcr.mjs     v2: refugees hosted (UNHCR population API)
tools/atlas/fetchers/atlas2024.mjs reads tools/atlas/manual/atlas2024.csv (hand-transcribed WHO Mental Health Atlas 2024 country profiles)
tools/atlas/fetchers/manual.mjs    generic reader for every tools/atlas/manual/*.csv
tools/atlas/manual/*.csv           columns: iso3,indicator,value,year,source_url,page,transcriber,date
data/raw/<source>/<indicator>.<date>.{json,csv,pdf,txt}   gitignored cache; .txt is pdftotext output
```

## Flags

- `--offline`: never call the network; read only `data/raw/`. Fails loudly, naming the missing cache file, when something is absent. This is the reproducibility gate: the build must succeed offline before any push.
- `--only <ids>`: comma-separated fetcher ids (`who-gho,uis,worldbank,treaties,corporal,gcpea,unhcr,atlas2024,manual`) to run a subset; every other indicator is read from the last run's output unchanged.
- Fetch order is fixed and the run is single-threaded per source so cache file names are stable.

## Outputs

- `site/data/atlas.json`: one object per state (every state, from the source lists, not from map geometry, so microstates are never dropped), keyed by ISO3, with the ten indicators plus context fields (income group, GDP per capita and year).
- `site/data/indicators.json`: id, label, unit, kind (`measured` / `modelled` / `self-reported` / `legal`), source id, latest year, `max_age`, tier thresholds and legend text, safe-messaging note for the suicide indicators (always shown with help resources and the uncertainty note).
- `site/data/sources.json`: id, name, licence (with the ShareAlike and NonCommercial flags), attribution text, URL opened, extraction date, notes on what may and may not be republished (the corporal-punishment table: facts with attribution and link, never the table itself).
- `docs/coverage.md`: per indicator, countries with a value, year min / median / max, stale count, missing ISO3s named, failed joins named, reported zeros, out-of-range values. Regenerated on every run.

## Verification hooks

- Spot-check five countries (Norway, United States, Brazil, Philippines, Ethiopia) on every indicator against the source's own page, logged to `data/verification/spotcheck-<date>.csv` (columns in `data/verification/README.md`).
- A fresh-context Critic returns `Country | Indicator | Site value | Source value | Verdict`; REFUTED or CANNOT VERIFY greys the field until fixed.
- `node tools/check.mjs` still gates the pages; the pipeline's own gate is the offline byte-for-byte rebuild plus the sanity report with zero unexplained failures.

## Source facts already verified on this machine (2026-09-03, plan.md)

WHO GHO OData answers, but its Mental Health Atlas series end in 2017 and carry no child or adolescent fields; the Atlas 2024 profiles (about 90 PDFs) must be hand-transcribed with page cites. UNESCO UIS API answers (about 180 geoUnits, 2021-2023, CC BY-SA 4.0). World Bank API answers (CC BY 4.0). UNHCR population API answers. UN Treaty Collection pages are server-rendered (OP3-CRC has 54 parties). The End Corporal Punishment table parses with `pdftotext -layout`. GCPEA needs a browser User-Agent. UNICEF SDMX holds no mental-disorder or suicide indicator; GBD/IHME prevalence carries a non-commercial licence, so v1 has no modelled prevalence layer. Every one of these must be re-opened by the session that builds the fetcher; a fact from the plan is not a fact from the source.
