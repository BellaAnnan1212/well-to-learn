# Atlas data coverage

Written by `node tools/atlas/build-data.mjs` on 2026-09-19 (offline rebuild from the cache). Every number below is counted from the build that wrote `site/data/atlas.json` in the same run, never typed by hand.

States in the table: **249** (every ISO 3166-1 state, so nothing is dropped for having no shape on the map).

## Per indicator

| Indicator | Countries with a value | Year min / median / max | Stale | Reported zeros |
|---|---|---|---|---|
| Suicide rate, ages 10 to 19 | 185 | 2021 / 2021 / 2021 | 0 | ATG, GRD, VCT |
| Age-standardised suicide rate, all ages | 185 | 2021 / 2021 / 2021 | 0 | none |
| Psychiatrists per 100,000 people | 146 | 2013 / 2016 / 2017 | 2 | MHL |
| Out-of-school rate, lower secondary age | 186 | 2015 / 2024 / 2025 | 11 | CYP, JPN, ARE |
| Completion rate, lower secondary | 146 | 2015 / 2021 / 2024 | 42 | none |
| Learning poverty at age 10 | 124 | 2001 / 2019 / 2023 | 29 | none |
| Corporal punishment prohibited in schools | 198 | no year (legal or categorical) | n/a | none |
| Can a young person complain to the UN Committee | 249 | no year (legal or categorical) | n/a | none |
| Profiled in Education under Attack 2026 | 28 | no year (legal or categorical) | n/a | none |
| WHO Mental Health Atlas 2024 country block | 0 | no year (legal or categorical) | n/a | none |

## Failed joins

None. Every name and code every source printed resolved to an ISO 3166-1 state, or was on the deliberate ignore list below.

## Deliberately ignored

| Source | Name | Rows |
|---|---|---|
| corporal | Republic of Kosovo | 1 |
| treaties:crpd | European Union | 1 |
| worldbank | CHI | 1 |
| worldbank | XKX | 3 |

## What each source said in this build

- World Bank: 78 aggregate rows dropped before anything was drawn.
- Convention on the Rights of the Child: 196 parties and 1 signatories that are not yet parties, as the UN grid prints them, status as at 2026-09-19. 197 of 197 rows joined to an ISO 3166-1 state; the rest are participants without one (the European Union, Cook Islands, Niue) and are named under "deliberately ignored".
- International Covenant on Economic, Social and Cultural Rights: 173 parties and 5 signatories that are not yet parties, as the UN grid prints them, status as at 2026-09-19. 178 of 178 rows joined to an ISO 3166-1 state; the rest are participants without one (the European Union, Cook Islands, Niue) and are named under "deliberately ignored".
- Convention on the Rights of Persons with Disabilities: 194 parties and 2 signatories that are not yet parties, as the UN grid prints them, status as at 2026-09-19. 195 of 196 rows joined to an ISO 3166-1 state; the rest are participants without one (the European Union, Cook Islands, Niue) and are named under "deliberately ignored".
- Optional Protocol to the CRC on a communications procedure: 54 parties and 15 signatories that are not yet parties, as the UN grid prints them, status as at 2026-09-19. 69 of 69 rows joined to an ISO 3166-1 state; the rest are participants without one (the European Union, Cook Islands, Niue) and are named under "deliberately ignored".
- End Corporal Punishment: 199 state rows parsed from the table; schools column totals printed by the table itself are 137 fully prohibited and 62 not fully prohibited.
- GCPEA: 28 country cards parsed from Education under Attack 2026; 28 joined to an ISO3.
- WHO Mental Health Atlas 2024: no country profile has been transcribed yet, so no card carries the Atlas block. A missing block means "not read yet", never "no programme".
- Staleness: 84 value(s) are older than the max_age their indicator publishes, and each one is flagged `stale` in atlas.json and marked on the card and in the table. A stale value is not a wrong value; it is an old one, and the reader is told which.

## Hand-transcribed rows

Files read: atlas2024.csv. Rows placed: 0.

## Sanity findings

None. Every value is inside its plausible range, every data year is real and not in the future, and no country count moved more than 10 per cent since the last run.

## What "no data" means here

A country with no value for an indicator is drawn as a grey hatch and written "no data". It is never drawn as zero, never counted as zero in any total, and never read as "none" or "no programme". Where a source genuinely reported a zero, that zero is kept, flagged `reported_zero`, and listed in the table above, because a real zero and a missing number are different facts.
