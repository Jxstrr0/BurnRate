# Burn Rate: progress

The plan is `docs/BURN-RATE-PLAN.md` (stages in section 12). Newest first.

| Stage | Version | State |
| --- | --- | --- |
| 0. Scaffold | 0.1.0.0 | Done |
| 1. Ballistics core | 0.2.0.0 | Next |
| 2. Designer | 0.3.0.0 | |
| 3. Static fire and incident report (first playable) | 0.4.0.0 | |
| 4. Career and saves | 0.5.0.0 | |
| 5. Advanced grains and effects | 0.6.0.0 | |
| 6. Flight tests | 0.7.0.0 | |
| 7. The test stand in 3D | 0.8.0.0 | |
| 8. Polish and modes | 0.9.0.0 | |
| 9. Release and studio listing | 1.0.0.0 | |

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
