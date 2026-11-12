# src/: the file map

`node build.js` joins these files, in `manifest.txt` order, into `index.html`. They are slices of one page.

| File | What it holds |
| --- | --- |
| `html/head.html` | `<head>`, the self-hosted fonts, the loading splash (studio logo) and its `__ld` / `__ldDone` hooks; opens the main `<style>` |
| `css/style.css` | the whole look: colour tokens, buttons, cards, the title screen, the sheet, toasts |
| `html/body.html` | closes `<style>`; the page markup (title screen, sheet, toast) |
| `sim/open.js` | opens the sim `<script>` and `const BURN_SIM=(()=>{` |
| `sim/rng.js` | seeded RNG: `makeRng`, `rngStreams`, `hashStr` |
| `sim/close.js` | `return SIM;})();` and `module.exports` for node |
| `html/ld-sim.html` | loading bar step |
| `app/state.js` | opens the app `<script>`; `VERSION`, settings (`brn-settings`), `toast`, `openSheet` / `closeSheet` |
| `app/pwa.js` | service worker registration and the "New version ready" bar |
| `app/boot.js` | `start()`: settings, version line, hides the splash; closes the app `<script>` |
| `html/tail.html` | `</body></html>` |

Data tables go in `data/` inside the sim block; charts and the 3D stand go in `vis/`; procedural audio in `sound/`.
