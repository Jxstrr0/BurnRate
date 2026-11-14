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
| `data/designs.js` | `GRAIN_SHAPES` (with tiers), `GRAIN_DEFAULTS` and `normDesign`, `DEFAULT_DESIGN` and the `REF_DESIGNS` yardstick motors |
| `data/variance.js` | `VARIANCE`: how a real firing differs from the prediction; `SLOTS`: dawn, noon, dusk temperatures and the hut; `HUT`: the hut's range |
| `data/contracts.js` | `GRADING`, `STANDS` (with range fees and load cells), `CONTRACTS`: the work orders (tiers 1 to 3) with pay, days, repeats and a solution design |
| `data/career.js` | `CAREER` (money, prices, pay, reputation, late cut, limits), `FACILITIES` (blockhouse instruments, Stand 2, the conditioning hut, Stand 1) |
| `data/flight.js` | `FLIGHT` (the launch rail, wind, air and drag numbers), `BODIES`, `NOSES`, `FINS`: the rocket parts for flight jobs |
| `data/daily.js` | `DAILY`: the Daily Spec's epoch, kit pool, reference motor ranges, spec band widths, orders and clients |
| `sim/levelset.js` | level-set cross-sections (star, slotted, finocyl fins, moonburner): the port's exact signed distance on a grid, then area, perimeter and port tables against web distance |
| `sim/grain.js` | `buildGrain`: burning area, volume and port against web distance (analytic shapes, or level-set segments) |
| `sim/nozzle.js` | isentropic nozzle, `thrustCoef` with separation, `chokedFrac`, `nozzleEta` |
| `sim/motor.js` | `designErrors`, `motorFromDesign`: a design in mm to an SI motor with masses and ratings |
| `sim/ballistics.js` | `simulate`: the firing, step by step (backward Euler lumped chamber), with erosive burning |
| `sim/derive.js` | `summarize`, `warnings`, `impulseClass`, `predict` (the designer's one call) |
| `sim/fire.js` | `fire`: a static firing with seeded variance, failure detection, the incident report's cause and factors |
| `sim/grade.js` | `SPEC_INFO`, `specCheck`, `grade` (A, B, C or fail; a flight job grades the flown apogee), `preFire` (stand fit, load cell, part tiers) |
| `sim/explain.js` | `explainFiring`: why the real motor differed from the bench, one deviation at a time (1.4) |
| `sim/scatter.js` | the scatter predictor: `scatterPrep`, `scatterOne` (virtual motor i, the real dice), `scatterBand`, `lotOdds` (1.4) |
| `sim/flight.js` | flight tests: `rocketOf`, `defaultAirframe`, `airframeCost`, `fly` (point mass, drag, Mach, wind), `predictFlight`, `preLaunch`, `windOf`, `launch` |
| `sim/career.js` | the career's rules, pure: `newCareer`, `slotTemp`, `buildCost`, `firingCost`, `board`, `takeJob`, `settle`, `buy`, `logFiring`, `fireSeed`, tier 4 lots: `fireLot`, `gradeLot` |
| `sim/daily.js` | the Daily Spec, pure: `dailyNo`, `dailySpec` (kit, order, hidden reference motor, spec, all from the date), `kitCheck`, `inKit` |
| `sim/close.js` | `return SIM;})();` and `module.exports` for node |
| `html/ld-sim.html` | loading bar step |
| `vis/open.js` | opens the drawing `<script>` and `const BURN_VIS=(()=>{` |
| `vis/canvas.js` | `fit` (size a canvas to its CSS width), `tokens` (colours from CSS), `nice` (axis maxima), `divs` (gridlines) |
| `vis/chart.js` | `curves`: predicted pressure and thrust with reference lines and a cursor; `at` (sample at a time) |
| `vis/section.js` | `section`: the motor cut along its axis, grain burned back, and an end-on view |
| `vis/strip.js` | `strip`: the firing's strip chart, measured over predicted, pressure above thrust |
| `vis/stand.js` | `stand`: the 2D test stand placeholder with the plume and the failure effects |
| `vis/flight.js` | `altitude` (height against time, predicted and flown), `sky` (the launch drawn to scale), `pathAt` |
| `vis/glb.js` | `glbScene`: a small reader for `models/range.glb` and `models/kit.glb` (nodes, meshes, UVs, baked AO, materials with a texture key); the shared `textures/` loader (`texGet`, `texMat`, `uvScale`); `swapMats` for the graphics tiers |
| `vis/stand3d.js` | `s3`: the 3D range in three.js: Stand 3 and the launch rail, the motor or rocket built from the design, the plume shader, smoke, failure effects, the set shots and orbit camera, Full/Lite tiers with automatic step-down |
| `vis/close.js` | `return VIS;})();` and closes the `<script>` |
| `sound/synth.js` | the `BURN_SOUND` block (opens and closes its own `<script>`): procedural WebAudio (the motor's roar, crackle and hiss, countdown beeps, the relay click, the logger chirp, a bang) and vibration patterns; `setOn`, `unlock`, `motor.start/set/stop`; Ruslan's voice clips (`voice.lang/preload/ready/say/stop`, `sounds/voice/en/` and `ru/`, tannoy filter for range calls) |
| `app/state.js` | opens the app `<script>`; `VERSION`, settings (`brn-settings`), `toast`, `openSheet` / `closeSheet` |
| `app/pwa.js` | service worker registration and the "New version ready" bar |
| `app/save.js` | `S` (the saved game), `hydrate` (shape checks), `save` (debounced, to `brn-save`), save slots `brn-slot1..3` |
| `app/savecode.js` | Back up / Restore: the `BRN1:` save code (LZW + checksum), the backup file, the reminder bar |
| `app/gloss.js` | `GLOSS`, the tap-to-explain glossary; any `data-g="key"` opens its entry |
| `app/gfx.js` | graphics settings (`brn-settings` `gfx`), `gfxLoad` (fetches `lib/three.min.js`, `models/range.glb` and `models/kit.glb`, builds the 3D range), the Settings sheet |
| `app/designer.js` | the design bench: controls as data, live predict, flags, data sheet, jump-to-control, Undo and Reset (1.5.1); `showScreen` |
| `app/scatter.js` | the bench's Scatter button: runs the virtual motors in chunks after the design settles, the band and the summary line (1.4) |
| `app/game.js` | `GAME` (what's on the bench), taking a job, the bench's bottom bar, pre-fire checks, the slot sheet and bill, `startFiring` (fire, grade, settle, log), `replayFiring` |
| `app/career.js` | the title's buttons, new career, the work orders board, facilities, the logbook, the saves sheet |
| `app/daily.js` | the Daily Spec's app side: today's order sheet, best grade and marks, the streak, sharing, the title button |
| `app/sandbox.js` | the Sandbox: practise any job up to the career's tier with no money or deadlines, its own bench per job |
| `app/firing.js` | the stand screen: countdown (Ruslan's armed call and voiced count when his voice is on, `VOICE_CALLS`), live strip chart and gauges, the Abort button, the 3D or 2D stand, the slow-motion replay |
| `app/report.js` | the range report / incident report: cause, factors, where-to-fix, the bill, Ruslan Abenov's sign-off (read aloud on a fresh report: `rsoClip`) |
| `app/coach.js` | the coach-card tour on the first job: one-off cards that ring what they talk about; switch and "seen" in `brn-settings` |
| `app/share.js` | the motor data sheet: a 1080 × 1350 picture of a passed motor's certificate, shared as a PNG or saved |
| `app/debug.js` | the `?debug=1` bench: reference motors, predicted curves, data sheet |
| `app/boot.js` | `start()`: settings, loads the save, version line, hides the splash; closes the app `<script>` |
| `html/tail.html` | `</body></html>` |

Data tables go in `data/` inside the sim block; charts, the cross-section and later the 3D stand go in `vis/`; procedural audio and vibration in `sound/`.

Outside `src/`: `lib/three.min.js` (three.js, rebuilt by `tools/vendor-three.sh`) `models/range.glb` and `models/kit.glb` (written by `tools/blender-range.py` and `tools/blender-kit.py`) and `textures/` (`tools/blender-textures.py`) are fetched by the page at run time, not built into it. The Blender scripts share `tools/blender_lib.py`.
