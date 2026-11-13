# Burn Rate: design and build plan

> **For the Claude Code session that builds this game.** Read this whole file,
> then `docs/LONGLIGHT-STUDIO.md` (the studio catalogue) before writing code.
> Inside this repo, this plan and the repo's own `CLAUDE.md` win over the
> catalogue. Kelbo decides real design questions; section 14 lists the open
> ones with a default you can build on until he answers.

- **Game:** Burn Rate, a solid rocket motor design game
- **Studio:** Longlight Interactive (always the full name)
- **Repo:** `Jxstrr0/BurnRate` (public)
- **Live:** https://burnrate.longlight.games/ via GitHub Pages (Kelbo, 12 November 2026; was jxstrr0.github.io/BurnRate)
- **Listed on:** the studio site (`Jxstrr0/Kelbo.Website`), stage 9
- **Plan date:** 12 November 2026

---

## 0. Kelbo's decisions (newest first)

Answers to open questions. They win over anything older in this file; the
sections below are updated to match.

| Date | Question | Answer |
| --- | --- | --- |
| 13 Nov 2026 | Flight tests | **Launch replaces stand**: flight jobs are their own work orders. You design the motor, pick an airframe (body tube, nose, fins), then launch instead of firing on a stand. The motor fires with its usual real-vs-predicted variance and the rocket flies on the measured curve. Graded on apogee. A motor that bursts loses the rocket |
| 13 Nov 2026 | Wind on launch day | **Light seeded wind** (0.5 to 7 m/s, most days calm). The rocket weathercocks into it, so it leans upwind, flies a curved path and loses a little height. The predictor assumes still air |
| 12 Nov 2026 | Country | **Altyn Steppe Republic** ("altyn" = gold), the invented post-Soviet steppe country Aqsor Range is in |
| 12 Nov 2026 | Money | **Plain credits**, shown as `cr` (e.g. `48 000 cr`). No flavour currency |
| 12 Nov 2026 | Missed deadlines | **Late pay cut**: a contract can still be delivered after its deadline, but the payout drops for each range day late |
| 12 Nov 2026 | Where it lives | `burnrate.longlight.games` (a `CNAME` file in the repo; Kelbo adds the DNS record) |
| 12 Nov 2026 | Branches and merging | `main` starts from the scaffold. Every stage is a PR into `main`; Claude merges (squash is fine) once CI is green |
| 12 Nov 2026 | Era | Modern, slightly in the future (the 2030s). Drop the 1959 to 1975 retro look |
| 12 Nov 2026 | Setting | A decommissioned Cold War state test range on a steppe salt flat, in an invented post-Soviet country, now leased out to small private rocket startups. The player starts as a two-person startup renting a stand |
| 12 Nov 2026 | Range Safety Officer | **Ruslan Abenov**, steppe-born, a holdover from the old state programme; signs reports "R. Abenov, RSO" |
| 12 Nov 2026 | Look | **"Faded state-range"**: light-first; worn concrete greys, faded state paint and Cyrillic-style stencils from the old programme, with clean new startup gear on top |
| 12 Nov 2026 | Studio site | Listed on Kelbo.Website as **hidden** for now (like Quench) |

---

## 1. The pitch

You run a small propulsion outfit at a desert test range. Clients bring a spec
(total impulse, thrust curve, burn time, pressure limit, size and mass). You
design a motor to meet it: grain shape, nozzle, case. The predictor draws the
curve you expect. Then you bolt it to the stand and fire it for real, and the
real motor never quite matches the prediction. Sometimes it nails the spec.
Sometimes the pressure trace climbs past the case limit and the motor comes
apart, and the incident report shows exactly why.

**The hook, in Kelbo's words:** tuning numbers until they're perfect, and
watching a build break and learning why. The physics core is real, textbook
internal ballistics, simple enough to run on a phone and honest enough that
the lessons transfer.

**The money moment:** the strip chart. Pressure and thrust traces draw live
during a firing, the predicted curve ghosted underneath. When they diverge,
you feel it before the stand does.

---

## 2. How Burn Rate differs from the other craft games

The catalogue (section 9) notes that every Longlight craft career shares a
weekly clock, a growing workshop and rival shops, and asks a new craft game to
change at least two. Burn Rate changes two:

| Studio habit | Burn Rate |
| --- | --- |
| Weekly clock ("act, then Close week") | **No weekly clock.** Time moves one range day per firing. Design and predict as long as you like for free; only testing costs time. |
| Rival shops | **No rivals.** The opponent is the spec, the physics and the Range Safety Officer. |
| Growing workshop | Kept, as test stands and facilities (bigger stands unlock bigger motors). |

It also breaks two studio-wide habits:

- **Light-first look.** A bright, daytime desert range and engineering paper,
  not another dark slate UI.
- **A daily seeded mode.** One shared spec per day (stage 8), after The Whip's
  pattern.

---

## 3. Setting and tone

**Decided (Kelbo, 12 November 2026):** the 2030s. **Aqsor Range** (working
name), the old state programme's **Site 41**, a salt flat on the steppe of an
invented post-Soviet country. The state programme is long gone; the range
authority now leases its concrete stands, blockhouses and instrumentation
bunkers to small private rocket startups. The player starts as a two-person
startup renting the smallest stand and grows into a booster contractor.

- The look comes from that history: Soviet-era concrete, faded state paint,
  Cyrillic-style stencils and hazard stripes, with the startups' clean new
  data loggers, laptops and test hardware bolted on top.
- Tone: dry, competent, a little wry. Engineers writing incident reports, not
  action heroes.
- **Ruslan Abenov**, the Range Safety Officer, was born on the steppe and has
  watched state boosters burn here since he was a boy. He signs every report
  "R. Abenov, RSO", with a dry sign-off line.
- Desert days matter to the physics: a cold dawn firing and a hot afternoon
  firing of the same motor give different curves (temperature sensitivity,
  section 6.6). The steppe has hard cold mornings and hot afternoons.

**Names:** check the catalogue's section 8 before naming anything. Avoid
Kestrel, Kessel, Harbourline, Hollis, anything starting with V for a country,
"Prairie", and Lombard and Ink's Mostograd names. The country and its money
are decided: the **Altyn Steppe Republic**, money in plain **credits** (`cr`). The player names their startup at
career start.

**Hard content rule: propellants are stat blocks, never recipes.** Every
propellant in the game is a fictional named grade with performance numbers
(section 6.1). No real formulations, ingredient lists, ratios, mixing, casting
or curing steps, anywhere: not in data, flavour text, tooltips, the glossary
or commit messages. The game teaches motor *design* (geometry, pressure,
nozzles, cases); manufacturing chemistry is out of scope. This is also a clean
design choice: the interesting decisions are geometric.

---

## 4. Core loop

```
Contract board ──► Design (free, unlimited) ──► Static fire (costs a range day,
      ▲               grain · nozzle · case          money, materials)
      │               live predicted curves               │
      │               warnings                            ▼
      │                                         Pass: grade, payout, data
      └──────── Incident report ◄──────────── Fail: CATO, burn-through,
                where-to-fix jump                  chuffing, nozzle loss…
```

1. **Pick a contract.** Each has a spec with tolerance bands, a payout, a
   deadline in range days, and a test stand size.
2. **Design.** Edit grain, nozzle, case and igniter. The predictor redraws
   Kn, pressure and thrust curves instantly as you drag. Warnings flag risky
   numbers (section 6.8). Designing is free and never advances time.
3. **Static fire.** Pick a firing slot (dawn, noon or dusk, which sets
   propellant temperature). Countdown, then the live strip chart. The real
   motor differs from the prediction by seeded variance (section 7).
4. **Result.**
   - *Pass:* graded against the spec (A, B, C), paid, the measured curve
     saved to the motor's data sheet.
   - *Fail:* an incident report overlays predicted and measured traces,
     marks the moment it went wrong, names the root cause and offers a
     "where to fix it" jump straight to the control to change.
5. **Some contracts add a flight test** (stage 6): the certified motor goes on
   a rocket and has to reach an apogee with a payload.

---

## 5. Progression

Four tiers. Each unlocks propellant grades, grain shapes, case materials,
nozzle materials and a bigger test stand.

| Tier | Work | Unlocks |
| --- | --- | --- |
| 1. Society | Certify small motors to impulse classes (letter classes A to G), simple club contracts | Tube and BATES grains, end burner, steel and phenolic cases, graphite throat |
| 2. Research | Sounding rocket motors with apogee targets, curve-shape specs (neutral, progressive, regressive) | Star and slotted grains, flight tests, temperature-conditioned firings |
| 3. Booster | Large segmented motors, boost-sustain curves, mass-fraction targets | Finocyl and moonburner grains, composite cases, throat inserts, big stand |
| 4. Range tenders | Government booster tenders with strict reliability terms (several motors from one design must all pass) | Lot testing, reliability scoring |

Tier 4 is about qualification and reliability, not weapons. Keep it at the
level of "a booster motor that must pass five out of five firings."

**Money and materials:** each firing costs money (range fee plus the motor's
build cost) and the materials in it. Failed firings still cost. A run of
failures can push the outfit into debt; going broke ends the career with an
option to restart the tier.

**Facilities:** test stands (load cell rating, max motor size), a
conditioning hut (choose propellant temperature), a bigger blockhouse
(better instrumentation: more channels, higher sample rate, which shows more
detail in the incident report).

---

## 6. The physics model

Everything here is standard, published solid-motor internal ballistics.
Keep every tuning number in `src/data/` tables, not inline.

### 6.1 Propellant grades (fictional)

Each grade is a row:

| Field | Meaning | Plausible range |
| --- | --- | --- |
| `a` | burn rate coefficient (SI: m/s at Pa^n) | pick so r is ~2 to 15 mm/s at working pressure |
| `n` | pressure exponent | 0.2 to 0.7 |
| `rho` | density, kg/m³ | 1600 to 1850 |
| `cStar` | characteristic velocity, m/s | 1200 to 1600 |
| `gamma` | ratio of specific heats | 1.13 to 1.25 |
| `sigmaP` | temperature sensitivity, per °C | 0.001 to 0.004 |
| `pMin` | below this pressure the burn is unstable (chuffing), Pa | grade-specific |
| `aVar` | batch-to-batch burn rate spread, fraction | 0.01 to 0.05 |
| `cost` | per kg | |

Give each grade a name and a one-line character ("forgiving, low exponent",
"fast and touchy"). Five or six grades across the tiers are plenty. Higher-n
grades are faster and more pressure-sensitive: a key tension.

### 6.2 Grain geometry

The grain is one or more segments in a cylindrical case. Each segment has a
2D port cross-section, a length, and inhibited or uninhibited ends.

- **Tier 1 shapes, analytic:** tube (core), BATES (tube segments, both ends
  burning), end burner. Burning area as a function of web distance `x` has a
  closed form; use it.
- **Tier 2+ shapes, level set:** star, slotted, finocyl, moonburner, and any
  custom shape. Rasterize the port cross-section on a grid (start at 256×256
  for the grain's diameter; make it a tuning number), compute a distance map
  from the port surface, and the regressed surface at web `x` is the contour
  where distance = x. Perimeter at each `x` times segment length gives side
  burning area; regressing ends add their own area. Precompute the
  area-vs-x table once per design change (in a worker if it gets slow), then
  the ballistics step just interpolates.
- The cross-section editor shows the port and lets the player scrub web
  regression to watch the burning surface grow. This view is half the
  teaching.

### 6.3 Chamber pressure (quasi-steady)

Step by **web distance**, not time. For each step:

```
Kn  = A_b(x) / A_t                      // burning area over throat area
P_c = (Kn · a · rho · cStar) ^ (1 / (1 − n))
r   = a · P_c ^ n
dt  = dx / r
mdot = P_c · A_t / cStar
```

This is stable for any n < 1 and needs no ODE solver. Add:

- **Ignition:** a short pressure ramp set by the igniter (a tuning number per
  igniter size). Undersized igniter means a slow start or a hang fire.
- **Tail-off:** after web burnout (or for slivers left by star grains),
  exponential blowdown with a time constant from chamber free volume over
  throat area: `tau = V_free / (A_t · cStar · Gamma²)`, where Gamma is the
  usual function of gamma.

### 6.4 Nozzle and thrust

- Supersonic exit Mach from the expansion ratio `eps = A_e / A_t` by solving
  the area-Mach relation (bisection or Newton, fixed iteration count for
  determinism).
- Exit pressure ratio `P_e / P_c = (1 + (γ−1)/2 · M²) ^ (−γ/(γ−1))`.
- Thrust coefficient:
  `C_F = sqrt( 2γ²/(γ−1) · (2/(γ+1))^((γ+1)/(γ−1)) · (1 − (P_e/P_c)^((γ−1)/γ)) ) + (P_e − P_a)/P_c · eps`
- Thrust `F = eta · C_F · P_c · A_t`, where `eta` is a nozzle efficiency
  (divergence angle, throat finish) from the nozzle table.
- **Flow separation** (over-expanded at sea level): if `P_e` falls below
  roughly 0.4 · `P_a` (a tuning number), thrust drops and the run is flagged.
- **Throat erosion:** throat radius grows over the burn at a rate set by
  nozzle material and pressure, so Kn sags late in the burn. Graphite erodes
  little, cheap materials a lot.

### 6.5 Erosive burning

High mass flux past the grain in a narrow port raises the burn rate locally.
Simple model, per segment:

```
G   = mdot_upstream / A_port
r_e = r · (1 + kE · max(0, G − G_threshold))
```

`kE` and `G_threshold` live in the propellant table. Erosive burning makes
the start of a burn spike in narrow-port designs. Track port-to-throat ratio
`A_port / A_t` and warn below about 2 (tuning number).

### 6.6 Temperature

`a_effective = a · exp(sigmaP · (T_grain − T_ref))`. Dawn firings run slow
and low; afternoon firings run fast and high. A design with a thin pressure
margin can pass at dawn and burst at 3 pm. The conditioning hut (facility)
lets the player pick the temperature.

### 6.7 Case and structure

- Hoop stress `sigma = P_c · r_inner / t_wall`.
- Case material table: yield and ultimate strength, density, cost, max wall
  temperature, and a variance on strength.
- Safety factor shown live: `SF = yield / sigma_at_peak_pressure`.
- Liner/insulation thickness against burn time: too thin for a long burn
  means a case burn-through near the end.
- Forward closure and nozzle retention have a rated load; exceeding it ejects
  the nozzle or the closure.

### 6.8 Live warnings in the designer

Show as small flags with a tap-to-explain glossary entry (section 10):

- Peak pressure vs case rating (safety factor under 1.5)
- Pressure below the grade's `pMin` (chuffing risk)
- Port-to-throat ratio low (erosive spike)
- Peak mass flux high
- Burn time vs liner rating
- Over-expanded nozzle at sea level
- Motor exceeds stand rating

### 6.9 Derived numbers on the data sheet

Total impulse (∫F dt), impulse class letter, average and peak thrust, burn
time, peak and average pressure, delivered Isp (`I_total / (m_prop · g0)`),
propellant mass fraction, Kn range, peak mass flux.

### 6.10 Flight test (stage 6)

Point-mass flight: `m · dv/dt = F(t) − m·g − ½ · rho_air(h) · |v_air|² · C_d(M) · A`,
exponential atmosphere, a drag rise near Mach 1, mass dropping with the
impulse spent, coast to apogee. The airframe is a simple pick list (body tube,
nose, fins → `C_d`, dry mass, and the longest rocket each fin set keeps
straight). On the 3 m rail the rocket only climbs; off it, it points into the
air flowing past (weathercocking), so the day's seeded wind (decided 13 Nov
2026) leans it upwind. With no wind this is exactly the vertical 1D flight.
Flight jobs replace the stand with the launch rail and are graded on apogee
(`data/flight.js`, `sim/flight.js`).

---

## 7. Reality vs prediction: the variance model

The predictor is the ideal. The firing is the predictor plus seeded,
explainable deviations. Every deviation must be something the incident report
can name.

| Source | Effect | Player lever |
| --- | --- | --- |
| Batch burn rate (`aVar`) | whole curve higher or lower | better grades, margin |
| Grain temperature | as section 6.6 | firing slot, conditioning hut |
| Casting voids (chance rises with grain size, falls with build quality tier) | sudden area jump, pressure spike | build quality upgrade, smaller segments |
| Grain crack (chance rises with cold, high pressure rise rate) | larger area spike, often CATO | warmer slot, gentler ignition, softer grade |
| Case strength variance | burst threshold moves | safety factor |
| Throat erosion variance | late-burn sag | throat material |
| Igniter variance | slow start or hang fire | igniter size |

All randomness comes from one seeded RNG with saveable state, copied from The
Whip `src/sim/rng.js` (sfc32 + cyrb128), split into named streams per system
(Frontier Lab pattern) so adding a feature doesn't reshuffle old results. A
given save and design always fires the same way.

---

## 8. Failure modes and the incident report

| Failure | Trigger | What the player sees |
| --- | --- | --- |
| CATO (case burst) | hoop stress past ultimate | trace spikes past the red line, stand flash, debris, report |
| Nozzle ejection | retention load exceeded | thrust collapses, pressure drops to zero |
| Burn-through | liner too thin for burn time | late hot spot, side jet, trace wobble |
| Chuffing | pressure under `pMin` | pulsing trace, puffs, no grade (not destructive) |
| Hang fire | igniter too weak | delay, then late start or nothing |
| Erosive spike | narrow port | early overshoot, may tip into CATO |
| Flow separation | over-expanded | thrust shortfall, rough plume |

**The incident report** is the "learn why" moment. It always shows:

1. Predicted vs measured traces on one chart, with the failure moment marked.
2. The root cause in one plain sentence, with the number that crossed the
   line ("Peak pressure reached 7.9 MPa; the case was rated for 6.8 MPa. A
   casting void at 1.2 s added 14% burning area.").
3. Contributing factors ranked (temperature, variance, design margin).
4. **Where to fix it:** buttons that jump to the exact control and ring it.
   Copy Escapement's `CERT_FIX` / `goFix` pattern from `src/app/test.js`.

Printed as a range report form (old state template, new data), with Ruslan Abenov's dry sign-off line. Reports
are kept in a logbook per motor design.

---

## 9. Look, sound and rendering

### 9.1 Look: "Faded state-range" (Kelbo, 12 November 2026)

Light-first and daytime: the old state range showing through, new startup
gear on top. (The plan's retro "Range Data Sheet" paper look was dropped.)

- **Palette** (tokens in `src/css/style.css`): sun-bleached concrete
  `#E6E3DC` ground, panel `#F2F0EB`, card `#FBFAF7`, graphite ink `#23262A`,
  faded state green `#5E7F6E`, stencil red `#A8322A`, hazard amber `#E0A526`,
  measured trace red `#C8341E`, predicted trace blue `#1F5FA8`, startup cobalt
  `#2A55C9` for the player's controls. A "night shift" dark theme later.
- **Fonts** (unused elsewhere in the studio, self-hosted `.woff2`, OFL): Saira
  Semi Condensed for headings and UI, Saira Stencil One for range signage,
  Martian Mono for readouts and stencils (it has Cyrillic). No font CDN.
- Studio pieces (splash, credit line, about block) follow the catalogue's
  section 3 exactly: official logo files copied from Kelbo.Website, credit
  line `© 2026 Kelbo / Longlight Interactive`.

### 9.2 Screens (portrait, phone first)

- **Contract board:** cards like typed work orders.
- **Designer:** top half is the live view (cross-section with a regression
  scrubber, or the predicted curves, swipe to switch); bottom sheet has tabs
  Grain · Nozzle · Case · Igniter. Sliders and steppers sized for thumbs.
- **Firing:** a 3D test stand at the top, the strip chart below, gauges
  (pressure, thrust, time) along the edge. Big "Abort" does nothing once lit
  (that's the joke, and it's true).
- **Result / incident report**, **data sheet**, **logbook**, **facilities**.

### 9.3 Rendering

- **Charts:** Canvas 2D, hand-rolled (no chart library). The strip chart is
  the hero; make it beautiful and smooth on a mid phone.
- **Cross-section:** Canvas 2D from the level-set grid.
- **Test stand:** three.js (vendored, not a CDN), graphics tiers Lite / Full
  copied from PEW `src/app/perf.js` with auto step-down. Shader exhaust
  plume whose length and brightness follow thrust; shock diamonds when
  under-expanded; heat shimmer on Full. Failures: flash, flying parts and
  camera shake adapted from Scrapline `src/vis/fx.js`, then a slow-motion
  replay.
- **Models:** the stand, blockhouse, motor case and nozzle via scripted
  Blender (no Blender UI), committed as `.glb`. Copy the pattern from
  Escapement `tools/blender/` or Scrapline `tools/blender-*.py`. Kelbo's PC
  can't stay on, so run Blender in the session or headless in GitHub Actions
  (Lombard's `bake.yml` pattern). CC0 or CC BY assets are fine if credited in
  `CREDITS.md`.

### 9.4 Sound

- Procedural motor roar driven by the live thrust value (adapt PEW
  `src/sound/` or Outpost `src/audio/synth.js`): rumble scales with thrust,
  crackle with pressure roughness, chuffing pulses for real.
- Countdown beeps, relay clicks, the data logger's chirp.
- Haptics on ignition and failure (The Whip `src/haptics.js` table).
- **Voice lines** (Range Safety Officer countdown and sign-offs) are optional
  and would use ElevenLabs. **Never generate without quoting the credit cost
  to Kelbo and getting a yes first.**

### 9.5 Generated art

Key art, the store card image and marketing shots may use Higgsfield.
**Free Higgsfield generations are fine at your discretion; never spend
credits without Kelbo's direct approval.**

---

## 10. Teaching without a manual

- **Coach-card tour** for the first contract (Escapement `src/app/help.js`,
  `TUT` / `GLOSS` / `data-g`). The first contract is designed so the default
  motor fails in an instructive way and the tour walks the player through the
  report and the fix.
- **Tap-to-explain glossary** for every term: Kn, web, port-to-throat, mass
  flux, C_F, expansion ratio, CATO, chuffing, Isp, impulse class.
- **Sandbox mode** (unlocked after tier 1): no money, no deadlines, every
  unlocked part, unlimited firings.

---

## 11. Technical plan

### 11.1 Stack

Classic JS with a zero-dependency slice build, the same family as PEW,
Escapement, Scrapline and Ink, so the most systems can be copied straight
across. Copy and adapt (with the `// Adapted from …` header):

| Need | From |
| --- | --- |
| Slice build, `--check`, manifest, service worker with hashed cache | Scrapline `build.js` + `src/manifest.txt` (change the prefix to `brn-`) |
| Seeded RNG | The Whip `src/sim/rng.js` |
| Sim test harness | Escapement `tools/sim-test.js` |
| Save code, backup, persist, reminder | Scrapline / Escapement `src/app/savecode.js` + `check-savecode.js` |
| Graphics tiers, PWA update bar | PEW `src/app/perf.js`, `src/app/pwa.js` |
| Sheets closed by the Back button | Escapement `openSheet` / `sheetHist` |
| Share a canvas | Escapement `src/app/share.js` |
| Headless balance bot | Scrapline `tools/fight-test.js` as a model |

Read the source repos read-only (shallow clone to `/tmp`). Never push to them.

### 11.2 Layout

```
src/sim/       pure sim: grain, ballistics, nozzle, case, variance, flight,
               career, contracts. No DOM, no three.js, no Math.random,
               no Date.now.
src/data/      propellants, materials, nozzles, igniters, contracts,
               tiers, facilities, tuning.
src/app/       UI, input, sheets, save, help, share
src/vis/       charts, cross-section, three.js stand, fx
src/sound/     procedural audio
tools/         sim tests, balance bot, blender scripts, icon maker
docs/          this plan, LONGLIGHT-STUDIO.md, PROGRESS.md
```

### 11.3 Shared-origin storage (catalogue section 5)

- localStorage: `brn-save`, `brn-slot1..3`, settings `brn-settings`
- Caches: `brn-` prefix only; the service worker deletes only `brn-` caches
- Save code: `BRN1:` + compressed JSON + checksum
- Never `localStorage.clear()`, never touch another prefix

### 11.4 Rules (studio section 4, restated)

- Phone first, portrait, touch works before a feature is done.
- Four-number versions `Major.Minor.Patch.Build`, shown on the title screen.
- Branch, PR, merge on green; never push to `main`. Small PRs Kelbo can read
  on a phone. Merging to `main` deploys.
- CI on every PR: `node build.js --check` and the sim tests.
- No backend, accounts, analytics, ads or API keys.
- Use the name Kelbo only, never a real name.
- End every task with a plain summary and how to test it on a phone.

### 11.5 Sim correctness tests

Physics bugs are the worst kind here because the game teaches. Test
invariants, not just snapshots:

- Mass conservation: ∫ mdot dt equals propellant mass (within 0.5%).
- Impulse consistency: total impulse ≈ delivered Isp · m_prop · g0.
- Monotonicity: raising Kn raises pressure; raising n raises pressure
  sensitivity; a larger throat lowers pressure.
- Analytic shapes vs level set: a tube grain run through the level-set path
  matches the analytic path within a set tolerance.
- C_F against values computed independently in the test for a few gamma and
  expansion ratio pairs.
- Determinism: same seed and design → identical firing, byte for byte.
- No banned calls in `src/sim/` (scan for `Math.random`, `Date.now`, DOM).

---

## 12. Build stages (one PR or a few per stage)

Version numbers are targets; adjust as needed.

**Stage 0: Scaffold (0.1.0.0)**
`CLAUDE.md` written from this plan, build script, manifest, empty title screen
with the studio splash and credit line, service worker with `brn-` prefix, CI
workflow, Pages live. `docs/PROGRESS.md` started.

**Stage 1: Ballistics core (0.2.0.0)**
Propellant and material tables, analytic grains (tube, BATES, end burner),
quasi-steady solver, nozzle and C_F, case stress, derived numbers, all with
tests. A debug page that prints a motor's curves is enough UI.

**Stage 2: Designer (0.3.0.0)**
Phone designer: grain, nozzle, case, igniter tabs; live predicted curves;
cross-section with regression scrubber; warnings with glossary entries.

**Stage 3: Static fire and incident report (0.4.0.0)**
Variance model, failure model, animated strip chart, a 2D stand placeholder,
pass grading, incident report with where-to-fix. **First playable**: a fixed
set of contracts, no career yet.

**Stage 4: Career and saves (0.5.0.0)**
Contract board, money, materials, range days, firing slots, facilities, tier
1 and 2 content, logbook. Save slots, `BRN1:` code, backup file, persist,
14-day backup reminder.

**Stage 5: Advanced grains and effects (0.6.0.0)**
Level-set geometry (star, slotted, finocyl, moonburner), erosive burning,
throat erosion, temperature sensitivity and the conditioning hut, tier 3.

**Stage 6: Flight tests (0.7.0.0)**
Airframe pick list, 1D flight sim, apogee contracts, flight result screen.

**Stage 7: The test stand in 3D (0.8.0.0)**
three.js stand and blockhouse (Blender scripts), plume shader, failure fx and
slow-mo replay, graphics tiers, procedural audio and haptics.

**Stage 8: Polish and modes (0.9.0.0)**
Coach-card tour, glossary pass, sandbox, Daily Spec (one seeded contract per
day, best grade kept on the device), share card for a certified motor's data
sheet, tier 4 lot testing, headless balance bot checking every contract is
solvable with the parts unlocked by then.

**Stage 9: Release and studio listing (1.0.0.0)**
Final balance pass, `CREDITS.md`, store-card art, remove the `noindex` robots tag from `src/html/head.html`, then **one separate PR in
`Jxstrr0/Kelbo.Website`** adding Burn Rate to the games list. Kelbo has asked
for this listing. Copy exactly how the existing games are listed there; touch
nothing else in that repo.

---

## 13. Definition of done (per stage)

- Works by touch on a phone in portrait, from the live site.
- `node build.js --check` and sim tests green in CI.
- No new `Math.random` / `Date.now` / DOM in `src/sim/`.
- Tuning numbers in `src/data/`, not inline.
- Version bumped, `docs/PROGRESS.md` updated.
- PR description: what changed, how to test on a phone, anything Kelbo should
  decide.

---

## 14. Open decisions for Kelbo (build on the default until he answers)

| Question | Default |
| --- | --- |
| Era and setting | **Decided:** 2030s, Aqsor Range (old Site 41), leased state range on a steppe salt flat |
| Country and currency names | **Decided:** Altyn Steppe Republic; money in plain credits (`cr`) |
| Tier 4 tone | Government booster tenders, reliability-focused, no weapons framing |
| Look and fonts | **Decided:** "Faded state-range", Saira Semi Condensed + Saira Stencil One + Martian Mono |
| How far to take the 3D stand | Stage 7 as written; 2D placeholder until then |
| Voice lines | None until Kelbo approves an ElevenLabs quote |
| Name of the Range Safety Officer | **Decided:** Ruslan Abenov |
