# src/: the file map

`node build.js` joins these files, in `manifest.txt` order, into `index.html`. They are slices of one page.

| File | What it holds |
| --- | --- |
| `html/head.html` | `<head>`, the self-hosted fonts, the loading splash (studio logo) and its `__ld` / `__ldDone` hooks; opens the main `<style>` |
| `css/style.css` | the whole look: colour tokens, buttons, cards, the title screen, the sheet, toasts |
| `html/body.html` | closes `<style>`; the page markup (title, work orders, design bench, the stand, the report, sheet, toast) |
| `sim/open.js` | opens the sim `<script>` and `const BURN_SIM=(()=>{` |
| `sim/rng.js` | seeded RNG: `makeRng`, `rngStreams`, `hashStr` |
| `data/tuning.js` | `TUNING`: every physics and warning constant |
| `data/propellants.js` | `PROPELLANTS`: the fictional grades, as stat blocks only |
| `data/materials.js` | `CASES`, `LINERS`, `THROATS`, `CLOSURES`, `IGNITERS` |
| `data/designs.js` | `DEFAULT_DESIGN` and the `REF_DESIGNS` yardstick motors |
| `data/variance.js` | `VARIANCE`: how a real firing differs from the prediction; `SLOTS`: dawn, noon, dusk temperatures |
| `data/contracts.js` | `GRADING`, `STANDS` (with range fees and load cells), `CONTRACTS`: the work orders (tiers 1 and 2) with pay, days, repeats and a solution design |
| `data/career.js` | `CAREER` (money, prices, pay, reputation, late cut, limits), `FACILITIES` (blockhouse instruments, Stand 2 lease) |
| `sim/grain.js` | `buildGrain`: burning area, volume and port against web distance |
| `sim/nozzle.js` | isentropic nozzle, `thrustCoef` with separation, `chokedFrac`, `nozzleEta` |
| `sim/motor.js` | `designErrors`, `motorFromDesign`: a design in mm to an SI motor with masses and ratings |
| `sim/ballistics.js` | `simulate`: the firing, step by step (backward Euler lumped chamber) |
| `sim/derive.js` | `summarize`, `warnings`, `impulseClass`, `predict` (the designer's one call) |
| `sim/fire.js` | `fire`: a static firing with seeded variance, failure detection, the incident report's cause and factors |
| `sim/grade.js` | `SPEC_INFO`, `specCheck`, `grade` (A, B, C or fail), `preFire` (stand fit, load cell, part tiers) |
| `sim/career.js` | the career's rules, pure: `newCareer`, `buildCost`, `firingCost`, `board`, `takeJob`, `settle`, `buy`, `logFiring`, `fireSeed` |
| `sim/close.js` | `return SIM;})();` and `module.exports` for node |
| `html/ld-sim.html` | loading bar step |
| `vis/open.js` | opens the drawing `<script>` and `const BURN_VIS=(()=>{` |
| `vis/canvas.js` | `fit` (size a canvas to its CSS width), `tokens` (colours from CSS), `nice` (axis maxima), `divs` (gridlines) |
| `vis/chart.js` | `curves`: predicted pressure and thrust with reference lines and a cursor; `at` (sample at a time) |
| `vis/section.js` | `section`: the motor cut along its axis, grain burned back, and an end-on view |
| `vis/strip.js` | `strip`: the firing's strip chart, measured over predicted, pressure above thrust |
| `vis/stand.js` | `stand`: the 2D test stand placeholder with the plume and the failure effects |
| `vis/close.js` | `return VIS;})();` and closes the `<script>` |
| `app/state.js` | opens the app `<script>`; `VERSION`, settings (`brn-settings`), `toast`, `openSheet` / `closeSheet` |
| `app/pwa.js` | service worker registration and the "New version ready" bar |
| `app/save.js` | `S` (the saved game), `hydrate` (shape checks), `save` (debounced, to `brn-save`), save slots `brn-slot1..3` |
| `app/savecode.js` | Back up / Restore: the `BRN1:` save code (LZW + checksum), the backup file, the reminder bar |
| `app/gloss.js` | `GLOSS`, the tap-to-explain glossary; any `data-g="key"` opens its entry |
| `app/designer.js` | the design bench: controls as data, live predict, flags, data sheet, jump-to-control; `showScreen` |
| `app/game.js` | `GAME` (what's on the bench), taking a job, the bench's bottom bar, pre-fire checks, the slot sheet and bill, `startFiring` (fire, grade, settle, log), `replayFiring` |
| `app/career.js` | the title's buttons, new career, the work orders board, facilities, the logbook, the saves sheet |
| `app/firing.js` | the stand screen: countdown, live strip chart and gauges, the Abort button |
| `app/report.js` | the range report / incident report: cause, factors, where-to-fix, the bill, Ruslan Abenov's sign-off |
| `app/debug.js` | the `?debug=1` bench: reference motors, predicted curves, data sheet |
| `app/boot.js` | `start()`: settings, loads the save, version line, hides the splash; closes the app `<script>` |
| `html/tail.html` | `</body></html>` |

Data tables go in `data/` inside the sim block; charts, the cross-section and later the 3D stand go in `vis/`; procedural audio in `sound/`.
