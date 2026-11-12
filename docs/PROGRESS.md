# Burn Rate: progress

The plan is `docs/BURN-RATE-PLAN.md` (stages in section 12). Newest first.

| Stage | Version | State |
| --- | --- | --- |
| 0. Scaffold | 0.1.0.0 | Done |
| 1. Ballistics core | 0.2.0.0 | Done |
| 2. Designer | 0.3.0.0 | Done |
| 3. Static fire and incident report (first playable) | 0.4.0.0 | Next |
| 4. Career and saves | 0.5.0.0 | |
| 5. Advanced grains and effects | 0.6.0.0 | |
| 6. Flight tests | 0.7.0.0 | |
| 7. The test stand in 3D | 0.8.0.0 | |
| 8. Polish and modes | 0.9.0.0 | |
| 9. Release and studio listing | 1.0.0.0 | |

## 0.3.0.0 — Stage 2: designer

- The title's button opens the **design bench** (`app/designer.js`). Sticky top: the motor's designation, the live
  view, a burn scrubber, six key numbers and the warning flags. Below it are the tabs Grain · Nozzle · Case · Igniter,
  with option cards, segmented buttons, steppers and sliders that have − / + nudge buttons.
- The predictor redraws once a frame while a slider moves, using coarse steps (within 2% of the full run, checked in
  `tools/sim-tests/physics.js`), then runs in full on release. Dependent sizes are kept legal (the core stays inside
  the grain, the throat inside the core).
- `BURN_VIS` block (`src/vis/`):
  - the predicted curves, with case-yield and stable-minimum lines and a scrub cursor;
  - the cross-section, drawn to scale with the grain burning back and an end-on view of the port.
- Warning flags open an explanation with a "Go to ..." button that jumps to and rings the control to change.
- Tap any underlined term or number for the glossary (`app/gloss.js`, 33 entries).
- Data sheet: every derived number, plus "start again from a reference motor".
- Designs live in memory for now. Saving arrives with careers in stage 4.

## 0.2.0.0 — Stage 1: ballistics core

- Data tables (`src/data/`): six fictional propellant grades as stat blocks, case materials, liners, throat materials,
  closures, igniters (now five sizes, from a micro igniter for end burners), and every tuning number in `TUNING`.
- Grain geometry (`sim/grain.js`): BATES, tube and end burner, analytic area / volume / port tables per segment.
- Nozzle (`sim/nozzle.js`): isentropic area-Mach, C_F with flow separation and unchoked flow, cone efficiency.
- Motor build (`sim/motor.js`): a design in mm becomes an SI motor with masses, retention, liner rating, case ratings;
  invalid designs return errors naming the field to fix.
- The firing (`sim/ballistics.js`): a lumped chamber stepped with backward Euler (mass closes to rounding), igniter
  delay and flame spread, temperature sensitivity, throat erosion, blowdown tail-off.
- The data sheet (`sim/derive.js`): impulse class and designation, averages and peaks, burn time, Isp, Kn range,
  port-to-throat, mass flux, safety factors, and the live warnings with the field each one points at.
- 15 physics invariant checks in `tools/sim-tests/physics.js`; `--brief` prints the reference motors.
- `?debug=1` bench page: pick a reference motor and a grain temperature, see the predicted curves and numbers.

## 0.1.0.0 — Stage 0: scaffold

- `build.js` (adapted from Scrapline): slice build from `src/manifest.txt`, `--check`, a content-hashed `sw.js` with
  `brn-` caches only.
- Title screen in the "Faded state-range" look: Aqsor Range · Site 41, version, studio logo and credit line.
- Self-hosted fonts (Saira Semi Condensed, Saira Stencil One, Martian Mono), PWA manifest and icons.
- `BURN_SIM` block with the seeded RNG (sfc32 + cyrb128 from The Whip, named streams).
- `tools/sim-test.js` with the banned-call scan; CI on every PR; GitHub Release per version.
- Kelbo's decisions recorded in the plan's section 0.

**Kelbo to do:** in Cloudflare DNS for longlight.games, add `CNAME burnrate → jxstrr0.github.io` (DNS only, like the
other games); in the repo's Settings → Pages, set Source to "Deploy from a branch", `main`, `/ (root)`, and tick
Enforce HTTPS once the certificate is ready.
