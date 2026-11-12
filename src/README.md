# src/: the file map

`node build.js` joins these files, in `manifest.txt` order, into `index.html`. They are slices of one page.

| File | What it holds |
| --- | --- |
| `html/head.html` | `<head>`, the self-hosted fonts, the loading splash (studio logo) and its `__ld` / `__ldDone` hooks; opens the main `<style>` |
| `css/style.css` | the whole look: colour tokens, buttons, cards, the title screen, the sheet, toasts |
| `html/body.html` | closes `<style>`; the page markup (title screen, design bench, sheet, toast) |
| `sim/open.js` | opens the sim `<script>` and `const BURN_SIM=(()=>{` |
| `sim/rng.js` | seeded RNG: `makeRng`, `rngStreams`, `hashStr` |
| `data/tuning.js` | `TUNING`: every physics and warning constant |
| `data/propellants.js` | `PROPELLANTS`: the fictional grades, as stat blocks only |
| `data/materials.js` | `CASES`, `LINERS`, `THROATS`, `CLOSURES`, `IGNITERS` |
| `data/designs.js` | `DEFAULT_DESIGN` and the `REF_DESIGNS` yardstick motors |
| `sim/grain.js` | `buildGrain`: burning area, volume and port against web distance |
| `sim/nozzle.js` | isentropic nozzle, `thrustCoef` with separation, `chokedFrac`, `nozzleEta` |
| `sim/motor.js` | `designErrors`, `motorFromDesign`: a design in mm to an SI motor with masses and ratings |
| `sim/ballistics.js` | `simulate`: the firing, step by step (backward Euler lumped chamber) |
| `sim/derive.js` | `summarize`, `warnings`, `impulseClass`, `predict` (the designer's one call) |
| `sim/close.js` | `return SIM;})();` and `module.exports` for node |
| `html/ld-sim.html` | loading bar step |
| `vis/open.js` | opens the drawing `<script>` and `const BURN_VIS=(()=>{` |
| `vis/canvas.js` | `fit` (size a canvas to its CSS width), `tokens` (colours from CSS), `nice` (axis maxima) |
| `vis/chart.js` | `curves`: predicted pressure and thrust with reference lines and a cursor; `at` (sample at a time) |
| `vis/section.js` | `section`: the motor cut along its axis, grain burned back, and an end-on view |
| `vis/close.js` | `return VIS;})();` and closes the `<script>` |
| `app/state.js` | opens the app `<script>`; `VERSION`, settings (`brn-settings`), `toast`, `openSheet` / `closeSheet` |
| `app/pwa.js` | service worker registration and the "New version ready" bar |
| `app/gloss.js` | `GLOSS`, the tap-to-explain glossary; any `data-g="key"` opens its entry |
| `app/designer.js` | the design bench: controls as data, live predict, flags, data sheet, jump-to-control |
| `app/debug.js` | the `?debug=1` bench: reference motors, predicted curves, data sheet |
| `app/boot.js` | `start()`: settings, version line, hides the splash; closes the app `<script>` |
| `html/tail.html` | `</body></html>` |

Data tables go in `data/` inside the sim block; charts, the cross-section and later the 3D stand go in `vis/`; procedural audio in `sound/`.
