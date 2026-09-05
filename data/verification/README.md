# data/verification

Spot-check logs for the Atlas. One CSV per verification pass, named `spotcheck-<date>.csv` with the date from the system clock (for example `spotcheck-2026-09-14.csv`). These files are committed; they are the evidence that the numbers on the map were read back against their sources by a person or a fresh-context Critic.

## What a pass covers

Five countries across income groups (Norway, United States, Brazil, Philippines, Ethiopia), every indicator in `site/data/indicators.json`, each value compared with the source's own page or API response, never with our cached copy in `data/raw/`. A REFUTED or CANNOT VERIFY verdict greys that field on the site until it is fixed (no data is never coerced to zero).

## Columns

| Column | Meaning |
|---|---|
| `country` | ISO3 code, then the display name in brackets, for example `NOR (Norway)` |
| `indicator` | the indicator id from `site/data/indicators.json` |
| `site value` | the value as printed on the country card or table, with its year, for example `12.4 (2021)`; `no data` when the field is grey |
| `source value` | the value as read on the source page or API, with its year |
| `source url` | the exact URL opened (API query or page), not the source's home page |
| `verdict` | one of `CONFIRMED`, `REFUTED`, `CANNOT VERIFY`; default to `REFUTED` when in doubt or when the page could not be opened |
| `checked by` | `Bella`, `reviewer` (any other person), or `Critic (agent)` |
| `date` | the day of the check, `YYYY-MM-DD`, from the system clock |

Header row, comma-separated, UTF-8, one row per country and indicator. Quote any field containing a comma.

Example row:

```
country,indicator,site value,source value,source url,verdict,checked by,date
NOR (Norway),suicide_10_19,"4.1 (2021)","4.1 (2021)",https://ghoapi.azureedge.net/api/SDGSUICIDE?$filter=SpatialDim%20eq%20%27NOR%27,CONFIRMED,Critic (agent),2026-09-14
```

## Rules

- Recheck against the live source, never against `data/raw/`.
- One file per pass; never edit an older pass, add a new dated file.
- Every REFUTED row needs a matching fix (a manual override in `tools/atlas/manual/`, a fetcher fix, or the field greyed) before the next push, and the fix is re-checked in the next pass.
- Rows about a country that is also a Voices region stay at country level; the verification file never mentions an interviewee.
