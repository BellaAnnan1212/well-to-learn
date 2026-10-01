# Well to Learn

Well to Learn is a public website by Bella Annan, a high-school senior, about youth mental health, schools and the right to education for disadvantaged young people worldwide. It has four parts. The Atlas is a world map of ten indicators, with a country card for every state and a plain data table that carries the same numbers for anyone who cannot or would rather not use the map: there is no composite score and no ranking, and a country with no data is shown grey, never as zero. Voices holds fifteen anonymous profiles built from interviews Bella conducted. Your rights is a plain-language guide, in nine chapters, to what the Convention on the Rights of the Child and its sister treaties promise a young person at school, where those promises tend to fail, and what to ask for. Take action closes the loop. About and Methodology pages show who made the site, how, and where every number comes from. A crisis-help block sits on every page, because a site about this topic may be read by someone who needs help now.

Live URL, once Pages is enabled on a public repo: https://bellaannan1212.github.io/well-to-learn/

The site is hand-coded HTML, CSS and JavaScript. No framework, no build step, no `node_modules`, no analytics, no cookies, no third-party calls at runtime. Fonts and libraries are served from this repository.

## What is in the repository

Target layout. Files land as the build progresses; the tree below is the contract.

```
.github/workflows/pages.yml      uploads ./site to GitHub Pages on every push to main, no build step
.gitignore
README.md                        this file
LICENSE                          MIT, covers the code
LICENSE-CONTENT.md               CC BY-NC 4.0 for written content; interview profiles all rights reserved
docs/HOW-TO-UPDATE.md            runbooks: fix a word, add a profile, update a number
docs/PROCESS.md                  how the site is being made, with a dated status line
docs/tokens.md                   the design tokens (filled after the design pick)
docs/coverage.md                 per-indicator data coverage (written by the atlas build)
tools/stamp.mjs                  rewrites the nav, crisis and footer blocks in every page, bumps ?v=
tools/build-voices.mjs           site/data/profiles.json -> site/voices/<slug>/index.html
tools/build-rights.mjs           content/rights/ch-NN-<slug>.md -> site/rights/<slug>/index.html, and the contents list
tools/build-methodology.mjs      counts the Atlas data and writes site/methodology/index.html
tools/build-atlas-page.mjs       site/data/*.json -> site/atlas/index.html
tools/check-copy.mjs             the lint for rights chapters: banned words, dashes, quote length, frontmatter
content/rights/                  the APPROVED rights chapters as markdown, plus chapters.json (all nine titles and where each stands)
tools/check.mjs                  the pre-push gate
tools/site.config.json           site-wide settings the tools read
tools/partials/                  nav.html  crisis.html  footer.html
tools/templates/                 profile.html  voices.html  atlas.html  chapter.html  rights.html  methodology.html
tools/atlas/                     the data pipeline: fetch, normalise to ISO3, sanity-check, write JSON
data/raw/                        download cache, gitignored
data/verification/               spot-check CSVs, one per verification run
site/                            everything that is published
  index.html  atlas/  voices/  voices/<slug>/  rights/  methodology/  act/  about/  404.html
  robots.txt  sitemap.xml  .nojekyll  favicon.ico  favicon.svg  apple-touch-icon.png  og-image.png
  assets/                        tokens.css  site.css  site.js  atlas.js  fonts/  avatars/
  vendor/                        d3.v7.min.js  topojson-client.min.js  countries-110m.json  iso-codes.json  LICENSES.md
  data/                          atlas.json  indicators.json  sources.json  profiles.json
```

Every link inside the site is relative. The live site is served under the `/well-to-learn/` sub-path, so nothing may assume it lives at the root of a domain.

## Run it locally

You need Python 3 (already on a Mac) and nothing else.

```
cd site
python3 -m http.server 4173
```

Then open http://localhost:4173/ in a browser. Stop the server with Ctrl+C. Locally the site sits at the root and live it sits under `/well-to-learn/`; relative links make both work.

## The tools

All of them run on Node 24 with no dependencies. There is nothing to install: do not run `npm install`, and never create a `node_modules` folder.

| Tool | What it does | Run it when |
|---|---|---|
| `node tools/stamp.mjs` | Rewrites the nav, crisis block and footer between their HTML markers in every page from `tools/partials/`, and bumps the `?v=YYYYMMDD` cache-buster on the asset links | You changed a partial or `tools/site.config.json`, or added a page |
| `node tools/build-voices.mjs` | Generates `site/voices/<slug>/index.html` for every profile in `site/data/profiles.json` from `tools/templates/profile.html`, plus the Voices roll (`site/voices/index.html`) and `site/data/profiles.public.json` (only what the pages print). It refuses the whole build if any profile is missing its consent date, its approval date, its identifying-details verification date or its safe-messaging verification date, or breaks the quote and wording rules | You added, edited or withdrew a profile |
| `node tools/build-rights.mjs` | Generates `site/rights/<slug>/index.html` for every chapter in `content/rights/`, and the contents list at `site/rights/index.html` from `content/rights/chapters.json`. Only an approved chapter may be in that folder: the tool refuses the whole build if a chapter is not `status: approved`, lacks its approval date or its check date, fails the copy lint, still carries an unverified marker, or uses markdown the renderer cannot draw. A chapter that is not published prints its status line and is not a link | A chapter was approved, corrected or withdrawn, or a status line in `chapters.json` changed |
| `node tools/build-methodology.mjs` | Writes the Methodology page. Every count on it (states with a value, stale values, the ignore list, the last spot check, chapters and profiles published) is counted from the data files in the same run, never typed | The Atlas data was rebuilt, a spot check was filed, or a chapter or profile was published |
| `node tools/check.mjs` | The gate: zero broken links, a viewport meta tag on every page, exactly one `h1`, a skip link, the crisis block, and every `?v=` in sync | Before every push, and after any of the other tools |

The atlas pipeline under `tools/atlas/` is documented in its own README once it lands.

## Licences

- Code: MIT, see `LICENSE`.
- Written content: CC BY-NC 4.0, see `LICENSE-CONTENT.md`.
- Interview profiles (`site/voices/**`, `site/data/profiles*.json`): all rights reserved, see `LICENSE-CONTENT.md`.
- Vendored libraries: their own licences, see `site/vendor/LICENSES.md`.
- Data: each source keeps its own terms, listed on the Methodology page.

## AI assistance

The About page carries this line, in Bella's words:

"I conducted the interviews, chose the questions and the framing, and approved every page. The data pipeline, code and page design were built with AI assistance (Claude), and every number and legal claim was checked against its primary source."

`docs/PROCESS.md` explains how the work is being done, with a dated status line.
