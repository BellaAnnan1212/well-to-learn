# Design tokens

Direction C2, "Register, banded and in motion", picked by Bella on 2026-09-19. The values live in `site/assets/tokens.css`; this page says when to use each one. Contrast ratios are WCAG 2 ratios computed by script during the design review.

| Token | Value | When to use |
|---|---|---|
| `--wtl-card` | `#FFFDF8` | ground of the card bands and cards. L* 99.3 |
| `--wtl-ink` | `#2B2118` | body, headings, ramp-5, and the footer band. 15.49:1 on card, 13.02 on wash, 10.75 on kraft |
| `--wtl-muted` | `#6B6158` | source lines, indices, meta, at 15px. 5.94 on card, 4.99 on wash. NEVER on kraft (4.12), never on green or ink |
| `--wtl-green` | `#1F5C46` | links, head rules, buttons, "Here." on light grounds; the ground of at most two bands per page. 7.72 on card, 6.48 on wash, 5.35 on kraft |
| `--wtl-red` | `#A2261B` | stamp, focus ring, selected country, on LIGHT grounds only. 7.30 on card, 6.13 on wash, 5.07 on kraft, 1.06 on green (so never there). Never a link, never a fill |
| `--wtl-kraft` | `#E6D3B3` | help surfaces only, ink on it: the header pill and the help band. One kraft band per page |
| `--wtl-rule` | `rgba(31, 92, 70, .28)` | derived hairline on light grounds, renders #C0D0C6 on card; decorative |
| `--wtl-on-dark` | `#FFFDF8` | type, head rules, outline stamp and "Here." on the green bands and the ink footer. 7.72 on green, 15.49 on ink |
| `--wtl-soft-on-dark` | `#CFDBD2` | meta, source lines, eyebrows and verb labels at 15px on green and ink. 5.50 on green, 11.04 on ink |
| `--wtl-rule-on-dark` | `rgba(255, 253, 248, .32)` | derived hairline on green (renders #67907F) and ink (renders #6F6760); decorative |
| `--wtl-band-wash` | `#EAEAE1` | the pale band under the doors. Same value as ramp-1 today, its own token so the map ramp can move without moving a page ground |
| `--wtl-focus-on-dark` | `3px solid var(--wtl-on-dark)` | the focus ring on green and ink, where red fails |
| `--wtl-ramp-1` | `#EAEAE1` | see the group comment in tokens.css |
| `--wtl-ramp-2` | `#C5C989` | see the group comment in tokens.css |
| `--wtl-ramp-3` | `#999B56` | see the group comment in tokens.css |
| `--wtl-ramp-4` | `#63653E` | see the group comment in tokens.css |
| `--wtl-ramp-5` | `#2B2118` | see the group comment in tokens.css |
| `--wtl-nodata` | `repeating-linear-gradient(45deg, var(--wtl-card) 0 3px, var(--wtl-muted) 3px 4px)` | hatch, never a colour |
| `--wtl-font-display` | `"IBM Plex Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif` | see the group comment in tokens.css |
| `--wtl-font-body` | `"IBM Plex Sans", "Helvetica Neue", Arial, system-ui, sans-serif` | see the group comment in tokens.css |
| `--wtl-font-mono` | `"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace` | see the group comment in tokens.css |
| `--wtl-size-1` | `0.9375rem` | 15: source lines, stamps, meta, eyebrows, verb labels |
| `--wtl-size-2` | `1.0625rem` | 17: body, nav, buttons |
| `--wtl-size-3` | `1.375rem` | 22: h3, lede, quotes, brand, "Here." under 52rem |
| `--wtl-size-4` | `1.875rem` | 30: h2, ledger amounts on desktop (22 under 52rem), "Here." on the green band from 52rem up |
| `--wtl-size-5` | `3rem` | 48: h1; 2.25rem (36) under 40rem |
| `--wtl-lead-body` | `1.45` | see the group comment in tokens.css |
| `--wtl-lead-lede` | `1.35` | see the group comment in tokens.css |
| `--wtl-lead-head` | `1.2` | see the group comment in tokens.css |
| `--wtl-lead-display` | `1.1` | see the group comment in tokens.css |
| `--wtl-lead-note` | `1.6` | see the group comment in tokens.css |
| `--wtl-lead-label` | `1.3` | see the group comment in tokens.css |
| `--wtl-lead-amount` | `1.15` | source lines with links (24px pitch) · one-line labels · one-line amounts |
| `--wtl-measure` | `60ch` | see the group comment in tokens.css |
| `--wtl-measure-mono` | `68ch` | sans and serif columns · mono notes |
| `--wtl-track-caps` | `.08em` | caps only with tracking, mono only |
| `--wtl-space-1` | `.25rem` | see the group comment in tokens.css |
| `--wtl-space-2` | `.5rem` | see the group comment in tokens.css |
| `--wtl-space-3` | `.75rem` | see the group comment in tokens.css |
| `--wtl-space-4` | `1rem` | see the group comment in tokens.css |
| `--wtl-space-5` | `1.5rem` | see the group comment in tokens.css |
| `--wtl-space-6` | `2rem` | see the group comment in tokens.css |
| `--wtl-space-7` | `3rem` | see the group comment in tokens.css |
| `--wtl-space-8` | `4rem` | see the group comment in tokens.css |
| `--wtl-rule-head` | `2px solid var(--wtl-green)` | opens a register |
| `--wtl-rule-row` | `1px solid var(--wtl-rule)` | between rows |
| `--wtl-rule-total` | `3px double var(--wtl-green)` | closes a register |
| `--wtl-rule-help` | `.5rem solid var(--wtl-kraft)` | tops a help door that sits away from the help band (Take action page); not used on home in C2 |
| `--wtl-map-line` | `1px` | see the group comment in tokens.css |
| `--wtl-map-sel` | `2.5px` | see the group comment in tokens.css |
| `--wtl-map-halo` | `7px` | non-scaling strokes; halo shows 2.25px either side of the red |
| `--wtl-stamp-border` | `2px` | see the group comment in tokens.css |
| `--wtl-stamp-tilt` | `-2deg` | see the group comment in tokens.css |
| `--wtl-radius` | `4px` | see the group comment in tokens.css |
| `--wtl-radius-stamp` | `3px` | see the group comment in tokens.css |
| `--wtl-radius-pill` | `999px` | see the group comment in tokens.css |
| `--wtl-target` | `2.75rem` | 44px hit area on every standalone control and link: by min-height on controls, pills, nav and text links; by an ::after on row-title links, which render 29px (a door title takes its whole row, a roll name a 44px strip). Links inside a source note render 27px by .25rem block padding on a 24px line pitch, over the 24px floor |
| `--wtl-focus` | `3px solid var(--wtl-red)` | on every interactive element on card, wash and kraft |
| `--wtl-focus-offset` | `3px` | see the group comment in tokens.css |
| `--wtl-wrap` | `72rem` | see the group comment in tokens.css |
| `--wtl-ease-out` | `cubic-bezier(.2, .7, .2, 1)` | every move but the stamp |
| `--wtl-ease-press` | `cubic-bezier(.34, 1.56, .64, 1)` | the stamp press, the one overshoot on the site |
| `--wtl-dur-draw` | `360ms` | see the group comment in tokens.css |
| `--wtl-wait-rise` | `160ms` | see the group comment in tokens.css |
| `--wtl-dur-rise` | `300ms` | see the group comment in tokens.css |
| `--wtl-step-rise` | `140ms` | load, rule first: the hero rule draws 0 to 360ms, the two lines rise 160 to 460ms and 300 to 600ms |
| `--wtl-wait-lede` | `600ms` | see the group comment in tokens.css |
| `--wtl-dur-lede` | `300ms` | see the group comment in tokens.css |
| `--wtl-wait-observe` | `900ms` | the lede fades 600 to 900ms; the observer wakes at 900ms (the script reads this number), so a first row already on screen is the last beat of the one load sequence |
| `--wtl-dur-rule` | `400ms` | see the group comment in tokens.css |
| `--wtl-step-row` | `80ms` | rule draw, row stagger |
| `--wtl-dur-press` | `260ms` | see the group comment in tokens.css |
| `--wtl-wait-press` | `360ms` | the stamp lands as its rule finishes |
| `--wtl-dur-here` | `300ms` | see the group comment in tokens.css |
| `--wtl-step-roll` | `450ms` | roll call: one answer every 450ms (the script's timer reads the same number) |
| `--wtl-dur-fill` | `300ms` | see the group comment in tokens.css |
| `--wtl-step-band` | `120ms` | home atlas preview only: swatches start at 0, 120, 240, 360, 480ms, shapes at 600, 720, 840, 960, 1080ms, last fill done at 1380ms. dur-fill is also the uniform layer cross-fade in the build |
| `--wtl-dur-nudge` | `160ms` | see the group comment in tokens.css |
| `--wtl-nudge` | `4px` | door arrow |

## Rules

- Red is a stamp, a focus ring and the selected country, on light grounds only. It is never a link and never a fill.
- Kraft means help. One kraft band per page.
- Ledger green is the ground of at most two bands per page. Long reading (profiles, rights chapters) sits on light grounds.
- Numbers never animate. Every motion is off under `prefers-reduced-motion` and everything is visible with JavaScript off.
- The map ramp is one hue and gets darker as the value rises. No data is a hatch, never a colour and never zero. Modelled prevalence is never coloured.
