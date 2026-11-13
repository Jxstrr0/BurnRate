# Notes for Claude

Burn Rate is a solid rocket motor design game by Longlight Interactive. You run a two-person rocket startup renting a
stand at **Aqsor Range**, the old state programme's Site 41, a decommissioned Cold War test range on a steppe salt flat
in the 2030s. Clients bring a spec; you design a motor (grain, nozzle, case, igniter), the predictor draws the curve you
expect, then you fire it for real and the real motor never quite matches. Sometimes it nails the spec; sometimes the
pressure climbs past the case rating and **Ruslan Abenov**, the Range Safety Officer, signs the incident report. Phone
first, portrait, free, one self-contained page (`index.html`, built from `src/`), live at https://burnrate.longlight.games/.

**The build plan is `docs/BURN-RATE-PLAN.md`.** Read it before starting any stage. Its section 0 holds Kelbo's decisions
and wins over everything older in it. Work one stage at a time (section 12), tick it off in `docs/PROGRESS.md`.

## Hard content rule

**Propellants are stat blocks, never recipes.** Every propellant is a fictional named grade with performance numbers
(burn rate coefficient, exponent, density, c*, gamma, temperature sensitivity...). No real formulations, ingredients,
ratios, mixing, casting or curing steps, anywhere: not in data, flavour text, tooltips, the glossary, comments or commit
messages. The game teaches motor *design* (geometry, pressure, nozzles, cases). Tier 4 is booster reliability, never
weapons.

## Stack

- Plain HTML, CSS and classic (non-module) JavaScript in a few big `<script>` blocks, the same family as Prairie Engine
  Works, Escapement, Scrapline and Ink. No package.json, no npm, no bundler. Node 16+ for the scripts (22 used).
- Everything is self-hosted: fonts in `fonts/` (OFL), the studio logo in `assets/studio/`, and from stage 7 three.js
  vendored in `lib/`. **No CDN, no analytics, no backend, no accounts, no ads, no API keys.**
- PWA: `manifest.webmanifest`, `icons/`, and the generated `sw.js`. Installed copies work offline.
- Assets: CC0 and CC-BY only (never NC or ND), each with a line in `CREDITS.md`. Generated art (Higgsfield) is credited
  as AI-generated; **never spend Higgsfield or ElevenLabs credits without Kelbo's yes** (quote the cost first).
- Blender: scripted only (`tools/blender-*.py`, run headless with `bpy`), output `.glb` committed.

## Commands (repo root)

```
node build.js              # rebuild index.html and sw.js from src/
node build.js --check      # exit 1 if either is stale, a script block does not compile, or a function is declared twice
node tools/sim-test.js     # sim invariants + banned-call scan (--brief prints the reference motors)
node tools/make-icons.js   # re-render icons/ (Playwright; output committed)
```

CI (`.github/workflows/ci.yml`) runs the first three on every PR (plus `node check-savecode.js` from stage 4). To play a
local copy: `python3 -m http.server` in the repo root. The service worker only registers on a real host (or `?sw=1`).

## Source and build

- **Edit `src/`, never `index.html` or `sw.js`.** `node build.js` concatenates the files in `src/manifest.txt`, byte
  for byte, then writes `sw.js`. Commit `src/`, `index.html` and `sw.js` together.
- `src/README.md` is the file map. `src/` files are slices of one page: a file may open or close a `<script>`.
- A new `src/` file must go into `src/manifest.txt` at the right place, or the build refuses to run.
- Blocks: `BURN_SIM` (sim + data, pure) · `BURN_VIS` (charts, cross-section, the 3D stand) · `BURN_SOUND`
  (procedural audio and vibration) · the app glue (`src/app/`).

## Code conventions

- **The sim is pure** (`src/sim/`, `src/data/`): no DOM, no three.js, no `Math.random`, `Date.now`, `performance.now`,
  `setTimeout` or `localStorage`. `tools/sim-test.js` scans for them. Randomness comes from `rngStreams(seed).get(name)`
  (sfc32 + cyrb128, adapted from The Whip), one named stream per system so adding a feature doesn't reshuffle old firings.
- **Units:** SI inside the sim (m, kg, s, Pa, N). The UI converts for display (mm, MPa, kN, N·s).
- **Tuning numbers live in `src/data/` tables**, never inline. Physics is textbook quasi-steady internal ballistics
  (plan section 6); physics bugs are the worst kind here because the game teaches, so every change to the model comes
  with an invariant test in `tools/sim-tests/`.
- Each sim file ends by adding its exports to `SIM` (`Object.assign(SIM,{...})`).
- Comments in plain English at the top of each file say what it holds.
- Copied code carries `// Adapted from <Repo> <path> (<date>)` at the top. Never import or hotlink across repos.

## Storage (plan section 11.3)

- localStorage keys all start `brn-`: `brn-settings` (this phone), and from stage 4 `brn-save`, `brn-slot1..3`.
  **Stop and ask before adding a key.** All access in try/catch.
- Caches all start `brn-`; the service worker only ever deletes `brn-` caches. Never `localStorage.clear()`, never touch
  another prefix.
- Save code (stage 4): `BRN1:` + LZW-compressed JSON + checksum, the Scrapline/PEW shape. Players' codes are their
  personal data: decode locally only, never send or commit them.

## Look ("Faded state-range", plan section 9.1)

Light-first. Concrete greys, faded state green, stencil red, hazard amber, Cyrillic-style stencils from the old
programme; the startup's own controls in graphite and cobalt. Measured traces red `#C8341E`, predicted blue `#1F5FA8`.
Every colour is a token in `src/css/style.css`. Fonts: Saira Semi Condensed (UI), Saira Stencil One (signage), Martian
Mono (readouts). Respect `prefers-reduced-motion`. Every text colour at least 4.5:1.

## Deploy

GitHub Pages serves the repo root from `main` (`.nojekyll`, `CNAME` = `burnrate.longlight.games`). Merging into `main`
is the deploy. `.github/workflows/publish-release.yml` publishes a GitHub Release for each new `VERSION` (the studio site
reads it).

## Versions

- `const VERSION="x.y.z.w";` in `src/app/state.js`, shown on the title screen; the build folds it into the cache name.
- Each plan stage bumps the **second** number (stage 1 = 0.2.0.0 ... stage 9 = 1.0.0.0); a PR inside a stage bumps the
  third; a fix bumps the fourth. The merge commit into `main` is titled `x.y.z.w: summary`.

## How Kelbo works

- Beginner-plus coder who tests on his phone on the live site. End every task with a plain-language summary and how to
  test it on a phone.
- One `claude/...` branch and PR per stage (or a few per stage), into `main`. Once CI is green, merge it yourself
  (squash is fine; standing permission, 12 November 2026). Never push straight to `main`.
- Commit subject: `Area: what changed`, the why in the body. Commits are authored as `Jxstrr0`
  (`322161611+Jxstrr0@users.noreply.github.com`) with the Claude co-author trailer.
- **Real design decisions get asked, not guessed:** ask as question popups in the chat with a recommended default, then
  record the answer in the plan's section 0.
- The name Kelbo only, never a real name. Studio: always "Longlight Interactive". Credit line:
  `© 2026 Kelbo / Longlight Interactive`.

## Longlight brand (studio pieces only)

The studio logo applies only to studio pieces: the loading splash, the credit line, the about block, links to
https://longlight.games/. Use the official files in `assets/studio/` (copied from `Jxstrr0/Kelbo.Website`
`assets/press/`); never redraw or recolour them. Game screens keep Burn Rate's own look.

## Studio catalogue

`docs/LONGLIGHT-STUDIO.md` covers every Longlight game: looks, names already taken, storage prefixes, a reuse map. Read
it before naming anything or building a system another game may have. This file wins where they disagree. Don't edit
the copy here; the master is `.github/LONGLIGHT-STUDIO.md` in `Jxstrr0/Kelbo.Website`.

## Current status

See `docs/PROGRESS.md`.
