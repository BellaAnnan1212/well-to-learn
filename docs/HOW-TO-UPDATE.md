# How to update Well to Learn

Four runbooks. The first needs only a browser. The others need the repository on a computer with Node 24 and git.

Runbooks 1 and 3 last checked: 2026-09-04. Runbook 2 rewritten: 2026-10-05. Runbook 4 written and run: 2026-10-01.

## 1. Fix a word (browser only, about a minute)

1. Open https://github.com/BellaAnnan1212/well-to-learn and click into `site/`, then into the folder of the page (for example `site/about/`), then `index.html`.
2. Click the pencil icon (Edit this file) at the top right of the file view.
3. Change the words. Leave the tags around them (`<p>`, `</p>`, `<a ...>`) exactly as they are.
4. Click the green "Commit changes..." button. Write a short message such as `Fix a typo on About`. Keep "Commit directly to the main branch" selected. Click "Commit changes".
5. Open the Actions tab. A run called "Deploy site to GitHub Pages" appears, first yellow, then green. It takes about a minute.
6. Reload the live page. If the old text sticks, hold Shift while you reload.

Things to know:

- Three pages are generated and must NOT be edited this way, because the next build overwrites them: every page under `site/rights/` (edit the chapter in `content/rights/` and follow runbook 4), `site/methodology/index.html` (edit `tools/templates/methodology.html`), and `site/atlas/index.html` (edit `tools/templates/atlas.html`).
- The nav, the crisis block and the footer on every page are generated. They sit between HTML comment markers, and the stamper rewrites them. To change them, edit `tools/partials/nav.html`, `crisis.html` or `footer.html` and follow runbook 3 instead. An edit made inside the markers is overwritten the next time the stamper runs.
- If the run goes red, open it and read the last lines. The usual cause is a typo in a filename. Fix it with another edit and commit again; nothing goes live until a run goes green.
- Every page keeps the crisis block. Never remove it.

## 2. Add or withdraw a profile (needs the repository on a computer)

Three things never enter this repository, because it is public: the raw interview notes, the approved profile files (markdown), and `profiles.json`, the data file built from them. All three carry how consent was given, and a field that no page prints is still a published field once it is committed. What the repository gets is the finished pages, the drawn avatars and `site/data/profiles.public.json`, which holds only what the pages print.

Adding a profile:

1. The profile file (`pNN-<slug>.md`, outside the repository) has Bella's approval of the exact text and a PASS from both checks on that same text: `approved_by_bella`, `verified_identifying_details` and `verified_safe_messaging` each carry a date (YYYY-MM-DD). The consent date is YYYY-MM, month only. If a word changes after a check, the check is run again.
2. Build the data file, OUTSIDE the repository:
   `node tools/import-profiles.mjs --from <folder of profile files> --out <a path outside the repo>/profiles.json`
   It reads every `pNN-*.md` (or only some, with `--only p01,p02`). It refuses the whole run, and writes nothing, if a section is missing or renamed, a quote line is not `> "..." (verbatim)` or `> "..." (paraphrased)`, the heading disagrees with the header fields, a date is missing, or the output path is inside this repository.
3. Draw the avatars: `node tools/draw-avatars.mjs --profiles <that profiles.json> --modules <folder where the drawing library is installed>`. The library is not part of this repository; the header of the tool says how to install it. Every avatar is drawn from the profile's slug with one rule set for everyone.
4. Build the pages: `node tools/build-voices.mjs --profiles <that profiles.json>`. If any date is missing, a quote runs over 40 words or contains a year, or the text uses a banned phrase (epidemic, crisis, diagnosed, skyrocketing, committed suicide), it refuses the whole build and names the profile and the field. It also rebuilds the Voices roll (`site/voices/index.html`) and `site/data/profiles.public.json`.
5. Run `node tools/build-methodology.mjs` (it counts published profiles) and `node tools/stamp.mjs`.
6. Add each new page to `site/sitemap.xml`: copy one `<url>` line, change the path to `voices/<slug>/`, set `lastmod` to today's date.
7. Run `node tools/check.mjs` and `node tools/test.mjs`. Both must finish clean.
8. Stage by name, never with a blanket add:
   `git add site/data/profiles.public.json site/voices/<slug>/index.html site/voices/index.html site/assets/avatars/pNN.svg site/methodology/index.html site/sitemap.xml`
   then commit and push. Before committing, run `git status` and confirm no `profiles.json` and no `.md` profile is listed.
9. Watch the Actions tab go green, then open the live profile and read it once more as a stranger would.

Withdrawing a profile (a person may withdraw at any time before the content freeze, and their request is honoured after it too):

1. Move the profile file out of the folder the import reads, and run step 2 again.
2. Delete the folder `site/voices/<slug>/` and the avatar `site/assets/avatars/pNN.svg`.
3. Remove its line from `site/sitemap.xml`.
4. Run steps 4, 5 and 7 (the roll and `profiles.public.json` are rebuilt without the withdrawn profile).
5. Stage the changed paths by name (`profiles.public.json`, the deleted folder and avatar, `site/voices/index.html`, `site/methodology/index.html`, the sitemap), commit, push, and confirm the live URL now shows the 404 page.

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

## 4. Publish, correct or withdraw a rights chapter

The nine chapters are written and checked outside this repository. Only an APPROVED chapter is copied in, because this repository is public: a draft in it would be a published draft.

Publishing a chapter:

1. The chapter has been through its legal check with no open row, and Bella has approved the exact text. In its frontmatter set `status: approved`, `approved_by_bella: YYYY-MM-DD` and `critic_cleared: YYYY-MM-DD` (the day the last check came back with nothing refuted), and make sure `unverified: []` is empty.
2. Copy the file into `content/rights/`, keeping its name (`ch-NN-<slug>.md`). The slug and the title must match that chapter's line in `content/rights/chapters.json`.
3. Run `node tools/build-rights.mjs`. It writes `site/rights/<slug>/index.html` and rebuilds the contents list. If it refuses, it names the file and the line; nothing is written until every refusal is fixed.
4. Add the page to `site/sitemap.xml`: copy one `<url>` line, change the path to `rights/<slug>/`, set `lastmod` to today.
5. Run `node tools/build-methodology.mjs` (it counts published chapters), then `node tools/stamp.mjs`, then `node tools/check.mjs` and `node tools/test.mjs`.
6. Stage by name: `git add content/rights/ch-NN-<slug>.md site/rights/<slug>/index.html site/rights/index.html site/methodology/index.html site/sitemap.xml`, then commit and push.

Correcting a published chapter: edit the file in `content/rights/`, have the changed sentence checked against its source, update `critic_cleared`, and run steps 3 to 6. If the change is more than a typo, it needs Bella's approval again and a new `approved_by_bella` date.

Changing the status line of an unpublished chapter: edit its `state` in `content/rights/chapters.json` and run `node tools/build-rights.mjs`.

Withdrawing a chapter: delete its file from `content/rights/`, delete the folder `site/rights/<slug>/`, remove its sitemap line, and run steps 3 to 6. The tool refuses to build while the folder is still there, so a withdrawn chapter cannot go on being served by accident.
