# How to update Well to Learn

Three runbooks. The first needs only a browser. The other two need the repository on a computer with Node 24 and git.

Last checked: 2026-09-04.

## 1. Fix a word (browser only, about a minute)

1. Open https://github.com/BellaAnnan1212/well-to-learn and click into `site/`, then into the folder of the page (for example `site/about/`), then `index.html`.
2. Click the pencil icon (Edit this file) at the top right of the file view.
3. Change the words. Leave the tags around them (`<p>`, `</p>`, `<a ...>`) exactly as they are.
4. Click the green "Commit changes..." button. Write a short message such as `Fix a typo on About`. Keep "Commit directly to the main branch" selected. Click "Commit changes".
5. Open the Actions tab. A run called "Deploy site to GitHub Pages" appears, first yellow, then green. It takes about a minute.
6. Reload the live page. If the old text sticks, hold Shift while you reload.

Things to know:

- The nav, the crisis block and the footer on every page are generated. They sit between HTML comment markers, and the stamper rewrites them. To change them, edit `tools/partials/nav.html`, `crisis.html` or `footer.html` and follow runbook 3 instead. An edit made inside the markers is overwritten the next time the stamper runs.
- If the run goes red, open it and read the last lines. The usual cause is a typo in a filename. Fix it with another edit and commit again; nothing goes live until a run goes green.
- Every page keeps the crisis block. Never remove it.

## 2. Add or withdraw a profile (needs the repository on a computer)

Adding a profile:

1. Keep the raw interview notes OUTSIDE the repository. They are never committed anywhere.
2. Open `site/data/profiles.json` and add one entry with every field, copying the shape from `tools/fixtures/profiles.sample.json`: `id` (p01 to p15), `slug`, `pseudonym`, `display_name`, `age_band` (12-14, 15-17 or 18-19), `region` (a UN sub-region), `country` (null unless the person agreed to it) with `show_country`, `schooling_status`, `key_points` (three to six), `quotes` (one or two, each with `text` and a `paraphrased` flag, under 40 words, no years), `wants_changed`, `avatar` (style, seed, file), `content_note` (null or one sentence), `consent` (how, date), then three more dates: `approved_by_bella`, `verified_identifying_details` and `verified_safe_messaging`. Every date is YYYY-MM-DD, except the consent date, which is YYYY-MM: month only, because this repository is public and the exact interview day stays in the private intake notes. The tool refuses a consent date that names a day.
3. Run `node tools/build-voices.mjs`. If any of the four dates is missing, a quote runs over 40 words or contains a year, or the text uses one of the banned phrases (epidemic, crisis, diagnosed, skyrocketing, committed suicide), the tool refuses the whole build, writes nothing, and names the profile and the field. That is on purpose: no profile goes live without consent, approval, a check that nothing in it identifies the person, and a safe-messaging check. The tool also rebuilds the Voices roll (`site/voices/index.html`) and `site/data/profiles.public.json`.
4. Run `node tools/stamp.mjs` so the new page gets its nav, crisis block, footer and cache-buster.
5. Add the new page to `site/sitemap.xml`: copy one `<url>` line, change the path to `voices/<slug>/`, set `lastmod` to today's date.
6. Run `node tools/check.mjs`. It must finish with no errors.
7. Stage by name, never with a blanket add:
   `git add site/data/profiles.json site/data/profiles.public.json site/voices/<slug>/index.html site/voices/index.html site/sitemap.xml`
   (add the avatar file under `site/assets/avatars/` if it is new), then commit and push.
8. Watch the Actions tab go green, then open the live profile and read it once more as a stranger would.

Withdrawing a profile (a person may withdraw at any time before the content freeze, and their request is honoured after it too):

1. Remove the entry from `site/data/profiles.json`.
2. Delete the folder `site/voices/<slug>/`.
3. Remove its line from `site/sitemap.xml`.
4. Run `node tools/build-voices.mjs` (it rebuilds the roll without the withdrawn profile), then `node tools/stamp.mjs`, then `node tools/check.mjs`.
5. Stage the changed paths by name (`profiles.json`, `profiles.public.json`, the deleted folder, `site/voices/index.html`, the sitemap), commit, push, and confirm the live URL now shows the 404 page.

## 3. Update a number

Numbers live in two places. Work out which one first.

A number on the Atlas (map, country card or table):

1. It comes from `site/data/atlas.json`, which the pipeline under `tools/atlas/` writes. Do not edit that JSON by hand.
2. For a machine-readable source, re-run the pipeline for that source only, for example `node tools/atlas/build-data.mjs --only worldbank`, then run it again with `--offline` and confirm the output does not change.
3. For a hand-transcribed value, edit the matching CSV in `tools/atlas/manual/` (columns: iso3, indicator, value, year, source_url, page, transcriber, date), then run the pipeline.
4. Read the diff of `docs/coverage.md`. A count that moves by more than a tenth is a warning, not a result.
5. Open the source page for at least one changed country and log it in `data/verification/spotcheck-<today>.csv`.
6. Run `node tools/check.mjs`, stage the changed paths by name, commit, push.

A number written into page text (a headline fact on the home page, a figure in a rights chapter):

1. Edit the page under `site/`. Change the number, the year and the source line together: a new number with an old year or an old link is worse than the old number.
2. Open the primary source and confirm the number, the population it covers and the year, before saving.
3. Run `node tools/check.mjs`, stage the page by name, commit, push.

Rules that apply to every number on the site: no composite score, no ranking of countries, no data means grey and "no data" (never zero), and any rate that concerns suicide is shown next to the crisis block and the uncertainty note.
