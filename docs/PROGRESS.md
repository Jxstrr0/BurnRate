# Burn Rate: progress

The plan is `docs/BURN-RATE-PLAN.md` (stages in section 12). Newest first.

| Stage | Version | State |
| --- | --- | --- |
| 0. Scaffold | 0.1.0.0 | Done |
| 1. Ballistics core | 0.2.0.0 | Done |
| 2. Designer | 0.3.0.0 | Done |
| 3. Static fire and incident report (first playable) | 0.4.0.0 | Done |
| 4. Career and saves | 0.5.0.0 | Done |
| 5. Advanced grains and effects | 0.6.0.0 | Done |
| 6. Flight tests | 0.7.0.0 | Done |
| 7. The test stand in 3D | 0.8.0.0 | Done |
| 8. Polish and modes | 0.9.0.0 | Done |
| 9. Release and studio listing | 1.0.0.0 | Done |
| After 1.0: night shift, voice, tier 3+ clients | 1.3.0.0 | Done |
| After 1.0: why it differed, scatter, tap the curve | 1.4.0.0 | Done |

## 1.4.0.0 — After 1.0: why it differed, the scatter predictor, tap the curve

Kelbo's picks (plan section 0, 14 November 2026).

- **Why it differed from the bench**: a card on the range report for every firing that ran to the end, passes included.
  It walks from the bench's 20 °C prediction to the measured motor one cause at a time (grain temperature, the batch,
  the igniter, throat wear, a void or crack), re-firing the same motor with each of its own deviations added, so the
  rows add up exactly to what the stand measured. It shows the spec's numbers (up to three) and names the biggest mover.
  With the basic data logger only temperature and batch are split out; the rest is one "everything else" row.
  Destructive failures keep their "What pushed it" card. `sim/explain.js`, `app/report.js`.
- **Scatter predictor**: a new facility, the **Computing room** (6,000 cr, reputation 18). Always on in the Sandbox,
  never in the Daily Spec. The Scatter button under the bench's chart fires 40 virtual motors with the real dice (fixed
  seeds `scatter/1..40`, never the seeds a real firing uses) about a second after the design settles, a few at a time so
  the bench never freezes. The curves get a shaded band (the middle 80%) and a red cross for each motor that failed; the
  line under the chart counts passes (with letters), each kind of failure, spec misses and yields, and on a tender the
  chance a lot of five is accepted. A coarser time step (3×) keeps it to about a third of a second on a laptop with the
  same failures as full firings. The on/off choice is a field in `brn-settings`. `sim/scatter.js`, `app/scatter.js`.
- **Tap the curve**: dragging on the bench's curves scrubs the burn and shows a readout (time, pressure, thrust, Kn,
  burning area, web gone, and the port's end view); it fades 2.5 s after the finger lifts. A swipe only switches views
  on the cross-section now. The report's chart is tap-to-read: predicted against measured pressure and thrust at that
  moment.
- Tests: `tools/sim-tests/scatter.js` (the explanation adds up exactly and names the right causes; virtual motor i is
  the same motor as a real firing with seed `scatter/i`; determinism, band sanity, lot odds).

## 1.3.0.0 — After 1.0: Ruslan's voice (after-1.0 list done)

- **Ruslan speaks**, in English or Russian (Settings, Ruslan's voice: English, the default, Русский, or Off). The two
  ElevenLabs runs Kelbo approved: all 42 lines in both languages, 84 clips, **3,748 credits** of the 6,000 cap, one take
  each, no retries. The clips were trimmed, levelled to the same loudness and re-encoded at 48 kbps mono: 1.6 MB in all,
  in `sounds/voice/en/` and `sounds/voice/ru/`.
- **On the stand**: once his calls have loaded (they load on the first tap, about 100 KB), the countdown opens with
  "Stand is armed. Range is clear." (an "Armed" sign for 2.4 s), and he calls three, two, one, fire over the tannoy (a
  band-pass filter) in place of the beeps. Until they've loaded, or with the voice off, it beeps as before. Abort in the
  countdown gets "Hold, hold, hold. Countdown held." The end of a run gets "Range is safe" (skipped if you tap on
  before it ends).
- **On the report**: he reads the sign-off printed at the foot (the same line, the same pick), plainly, not over the
  tannoy. Logbook reports stay quiet. Leaving the stand and the report stops him mid-line.
- He goes through the same audio as everything else, so Sound off or the speaker button silences him. No new storage
  key: `voice` lives in `brn-settings`. The service worker caches each clip the first time it plays (`sounds/` is
  already a runtime-cached folder), so an installed copy keeps the lines it has heard.
- **`node build.js` checks the clips**: every line in `tools/voice-lines.json` must have both mp3s, the sign-offs must
  match `RSO_LINES` in `src/app/report.js` word for word, and the calls must match `VOICE_CALLS` in
  `src/app/firing.js`. CI runs it, so a new sign-off without its clips fails the build.

## 1.2.0.0 — After 1.0: the late game, the altitude chamber and the capstone

- **The altitude chamber** (stand s0, a Facilities lease after the tender register: 40,000 cr, reputation 55, 2,500 cr
  a firing): the old programme's pumped-down tank at 3 kPa. Its jobs fire against that back-pressure, and the bench
  predicts against it too (`standCond` in sim/career.js, used by the designer, the slot sheet, the firing, lots,
  replays, the balance bot and the tests). No new physics: the nozzle model already took the outside pressure, so a big
  bell that separates on the open stand gains 40-odd seconds of Isp in the chamber. A new spec, **specific impulse**,
  grades it. The work order says "Fires in the altitude chamber, at 3 kPa" and the glossary explains it.
- **Seven new jobs**, each with a reference solution the balance bot also reaches from the start drawing:
  - tier 3: Dala's *Catalogue M1400*, Kökjal's *A flat sustainer* (a neutral curve), Saryk's *Every second counts*
    (228 s Isp on the open stand);
  - tier 4 tenders: Bürkit's *Desert booster lot* (40 °C in the hut), Kökjal's *Kick stage lot* and Kumtal's
    *High-altitude sonde stage* (both in the chamber);
  - the capstone: Altyn's *Orbital booster lot* (chamber, 90,000 cr), on the board only once every other tender is won.
- **The range is yours**: winning the capstone the first time puts a card on the board with the career's numbers (days,
  firings, jobs done, A grades, tenders, reputation). The career carries on. The flag lives in the career object
  (`won`, `wonSeen`): no new storage key.
- **Repeat orders** on every tier 3 and 4 job (60% pay; every 6 days at tier 3, 10 for tenders, 14 for the capstone).
  Repeats now list the best paid first, so late in a career the big clients' orders aren't crowded off the 8-card
  board by the club's. The empty board's hint now points at the next step (tender register, chamber, capstone).
- Tests: a new physics invariant (in the chamber the chamber pressure is unchanged mid-burn and thrust rises by exactly
  eta · Δp · A_e; a wider exit gains more; the kick stage's bell separates on the ground but not in the chamber), and
  the career playthrough now leases the chamber, wins the capstone and checks its repeat doesn't "win" again.

## 1.1.0.0 — After 1.0: the night shift theme, and the voice script

- **Night shift**: a dark theme. Settings, Theme: Day (the default, unchanged), Night shift, or Match phone (follows
  the phone's dark mode, live). Every colour token is redefined under `:root[data-theme="dark"]`, so the bench,
  stand, charts, report and share card all follow; every text colour is at least 4.5:1 on every ground. A tiny script in
  the page head sets the theme before the first paint (no light flash), the phone's bar colour follows, and the title
  shows the studio's own ivory logo file at night. The 3D range stays in daylight. No new storage key (`theme` was
  already in `brn-settings`).
- **Voice script**: `tools/voice-lines.json` holds Ruslan's 8 range calls and 34 report sign-offs in English and
  Russian, ready for the two ElevenLabs runs Kelbo approved (plan section 0; 3,622 characters, 6,000-credit cap). Nothing
  generated yet: the ElevenLabs connector was down this session.

## 1.0.0.0 — Stage 9: release (Stage 9 done)

- **The final balance pass** played whole careers headless, with a perfect player and with players who fail one, two or
  three times per job. A perfect career reaches tier 4 by about day 28 and never dips below its starting money. Players
  who fail often earn far less, and that is fine. The pass found one real bug: a soft-lock. A player who finished every
  work order but couldn't yet afford the next lease saw an empty board forever. Days only pass when you fire, and repeat
  orders only come back after days pass.
- **The fix (Kelbo's call): a free "Wait for orders" button.** It appears under an empty board, says how many days it
  skips, and jumps to the day the next repeat order (or a lost tender) comes back. It costs nothing. Jobs in hand keep
  their due days, and the card says so. A sim test checks that the wait lands on the right day, costs nothing and refills
  the board, and that tier 1 always has repeat work (the board shows older tiers' work, so every tier can wait).
- **Search engines may list the game now**: the `noindex` tag is gone.
- **`CREDITS.md`** now also covers the sound (all procedural, no recordings), code shared with other Longlight games,
  the algorithms and textbooks the sim follows, and the store art (a frame from the 3D stand, not generated art).
- **Studio listing**: the cover is a frame of an N-class motor from the nozzle camera, added to Burn Rate's entry on
  longlight.games in its own PR. The listing stays hidden until Kelbo shows it.

## 0.9.0.0 — Stage 8, part 5: the balance bot (Stage 8 done)

- **The headless balance bot**, `node tools/balance-bot.js`: for every contract it plays like a player who has picked the
  right parts. It starts from the job's own starting drawing with the solution's parts swapped in, but none of the
  solution's numbers. It tunes the bench's numbers using the predictor alone: one slider at a time, plus moves a player
  makes together (the exit follows the throat, the core follows a thicker liner, scale the whole motor, split or merge
  segments, grow the core and the throat together). It aims for the middle of each band, clears every red flag and
  keeps a margin under every rating. Then it fires the result three times.
- A job passes if the bot's motor raises no red flag, the stand accepts it, and it passes 2 of 3 firings. Free-slot jobs
  are tuned at noon first, then at dawn and dusk if noon doesn't deliver (a long burn wants cold grain). **All 27
  contracts pass** (about 100 s), most of them A A A. It runs in CI as its own job, beside the other checks.
- The hardest jobs, by the bot's count of tries: Qyran's long burn (a cold dawn grain, close to the chuffing limit),
  Ozen's cold motor and Kumtal's sounding rocket. These are tier 2-3 puzzles, and they're meant to be hard.
- Stage 8 is done: the Daily Spec, the Sandbox, tier 4 tenders, the coach tour, the data sheet, the glossary pass and
  the balance bot.

## 0.8.4.0 — Stage 8, part 4: the coach tour, the data sheet, glossary links

- **The first job teaches the loop.** "A G for field day" now opens with the club's old drawing: a thin case and a tight
  throat. The predictor flags it red, and it bursts at every firing slot. A bigger throat (6.5 mm) passes. A thicker wall
  alone stops the burst but burns too fast for the spec. A sim test checks all three.
- **Coach cards**: short cards, each shown once, that walk the first job: the bench and its curves, the red flag, the way
  to the stand, the incident report, the two ways to fix it, the pay, and the work orders. Each card rings the thing it
  talks about. "Got it" moves on; "No more tips" turns them off. Settings has a Coach cards switch and "Show them
  again". They live in `brn-settings` (`coach`, `seen`); no new key.
- **The data sheet**: a passed job's report has a **Data sheet** button. It draws a 1080 × 1350 picture of the motor's
  certificate: the range header and report number, the grade stamp, the designation, the client and job, the strip
  chart (measured over predicted), six numbers with the prediction under each, the spec with its ticks, Abenov's line
  and the game's address. **Share** sends the PNG through the phone's share sheet (on phones that can share files);
  **Save picture** downloads it. A lot's sheet shows a passing motor and says how many of the five passed.
- **Glossary links** for entries nothing pointed at before: the pressure exponent and grain temperature in the bench's
  data, the load cell when the stand turns a motor away, the range fee and build cost on the bill, firing slots, the job
  deadline, casting voids, grain cracks and the blockhouse.

## 0.8.3.0 — Stage 8, part 3: tier 4 range tenders

- **Tier 4 opens** with a new facility, the **Range tender register** (reputation 45, 30 000 cr, after Stand 1). Four
  tenders on Stand 1: the range's sounding booster lot, Kökjal's strap-on boosters, Ozen's cold northern lot (held in
  the hut at −10 °C) and the Altyn Space Agency's upper stage. Reliability work: boosters and sounding rockets only.
- **Lot testing** (decided: 4 of 5 must pass): a tender is delivered by a lot of five motors from one design, fired on
  one range day for one stand fee plus five motors' materials (decided). Four must pass; one failure still delivers at
  70% of the pay; two or more lose the tender, which the range puts out again 6 days later (decided). The lot's grade
  is its worst passing motor's.
- **Development motors** (decided): the stand offers "Fire one development motor" (costs a day and the motor, pays
  nothing, shows how the design fires) or "Fire the lot of 5".
- **The report** for a lot: a lot card with each motor's impulse, peak pressure and result; all five traces on the
  chart (the picked one bold); tap a motor to read its details. It opens on the first failure, if there is one. The
  logbook keeps lots and development motors, and replays a lot exactly.
- Tests: lot rules (one fee, repeatable motors, worst-motor grade, pay cut, lost and re-tendered), every tender's
  solution passes 5 lots of 5, and the career bot now plays through tier 4.

## 0.8.2.0 — Stage 8, part 2: the Sandbox

- **The Sandbox**, on the title once a career reaches tier 2: practise any work order up to the career's tier, with every
  part the career has unlocked. No money, no range days, no deadlines, as many firings as you like, each one graded.
- Each job keeps its own Sandbox bench, apart from the career's; the report offers Back to the bench, Fire another,
  Other jobs and Title. Nothing in the Sandbox changes the career (money, days, reputation and logbook stay put).
- Before tier 2 the button is there but says when it opens. The save gains `sandbox` inside `brn-save`; no new key.
- Tier 4 tender decisions recorded in the plan (section 0): development singles before the lot, a lost tender is put
  out again later, and a lot fires on one range day for one stand fee.

## 0.8.1.0 — Stage 8, part 1: the Daily Spec

- **The Daily Spec**, a new button on the title: one work order a day, the same on every phone, built from the date
  alone (Daily Spec No. 1 is 13 November 2026). Decided: **fire as often as you like, the best grade is kept**, and
  **a fixed kit of parts per day** (two grades, BATES plus two more grain shapes, two case materials, the tier 1-2 liners
  and throats, every closure and igniter), so a brand-new player and a tier 4 career play the same puzzle.
- The order sheet shows the client, the brief, the spec, the firing slot and today's kit. Parts outside the kit carry a
  "Not in today's kit" tag on the bench, and the stand turns away a motor that uses one, with a button to the part.
- Firings are free (no money, no range days) and keep the full blockhouse data. The report shows today's best, and
  **Share** sends a short text (the number, the best grade, a run of marks like `✗ B A`) through the phone's share
  sheet, or copies it. The title button shows how today is going; the order sheet shows the streak (days in a row
  with a pass).
- Every day is solvable: the generator builds a hidden reference motor from the day's kit, tunes it to fit Stand 3
  with no warnings, and centres the spec on its prediction. The tests build 60 days and fire 20 of them three times
  each; the reference passes its own spec at least 85% of the time (about 95% in practice).
- The save gains `daily` (today's run and bench) and `dailyHist` (the last 60 days' best grades) inside `brn-save`; no
  new storage key.

## 0.8.0.0 — Stage 7, part 2: sound and vibration

- **Procedural sound** (decided: on by default, with a mute), all made in WebAudio while the game runs, no sound files:
  the motor's roar follows the measured thrust (bigger motors sound deeper), it crackles when the pressure trace gets
  rough, a burn-through hisses, and a climbing rocket fades into the distance. Countdown beeps, the firing relay's
  click at ignition and burnout, the data logger's chirp when it arms and when it has saved the run, and a bang for a
  burst (smaller for a nozzle popping out). The slow-motion replay plays it again, deeper.
- **Vibration** on ignition and on each kind of failure (Android; iPhone browsers don't allow it).
- **The speaker button** on the stand mutes sound and vibration together, remembered on this phone. Settings has
  separate Sound and Vibration switches.
- Fix: after a short burn that played slowed down, the stand idled in slow motion for up to 20 seconds before the replay
  started; the time after the burn now plays at normal speed.

## 0.7.1.0 — Stage 7, part 1: the 3D stand and launches

- **Stand 3 in 3D** (three.js r187, vendored in `lib/`): the motor you designed sits in the cradle on the thrust block,
  built from the design (case length, bore and material colour, the nozzle's real throat and exit). The range model
  (`models/range.glb`) is scripted in Blender: the stand, the blockhouse, the launch rail, the workshop, water tower,
  flood masts and radar on the salt flat.
- **The plume** grows with thrust, shows **shock diamonds** when the exhaust is under-expanded and pinches when it is
  over-expanded; smoke drifts on the day's wind; the fire lights the stand.
- **Failures in 3D**: a CATO splits the case with a flash, debris and a smoke cloud; a nozzle ejection fires the nozzle
  out; a burn-through cuts a side jet; a hang fire leaves a wisp. Destructive failures play a **slow-motion replay**
  once (not with reduced motion), and "Watch it again, slowed down" replays it any time.
- **Launches fly in 3D to apogee** (decided): the rocket you built (body tube, nose, fins) leaves the rail with a
  smoke trail. A rocket lost on the rail or in flight breaks up.
- **Cameras** (decided: both): tap the view for the next set shot (stand: side on, nozzle close-up, blockhouse window;
  launch: chase, pad camera, downrange), drag to orbit, pinch to zoom.
- **Graphics setting** (Settings on the title screen): Auto, Full, Lite or 2D. Auto starts Full or Lite from what the
  phone reports and steps down to Lite if frames run slow, and remembers it. 2D keeps the old flat stand and sky, which
  is also the fallback without WebGL. three.js and the model load a few seconds after start-up and are kept offline.

## 0.7.0.0 — Stage 6: flight tests

- **Flight jobs** (decided: launch replaces the stand): four new work orders put the motor in a rocket and fly it from
  the range's launch rail, graded on apogee. Tier 1: the club's altitude cup (800–1200 m, a 250 g altimeter, G or
  smaller). Tier 2: a weather sounding flight (2500–3500 m with 1 kg) and the students' H-class altitude record
  (1700–2300 m on 320 N·s or less). Tier 3: a 4 kg telemetry pack to 6000–8000 m.
- **The Rocket tab** on a flight job's bench: body tubes (kraft, glass-fibre, carbon by tier), three noses and four fin
  sets. It shows the predicted apogee, top speed and Mach, rail exit speed, thrust-to-weight, length/diameter against
  the fins' limit, liftoff mass and the rocket's build cost. The apogee replaces Isp in the bench's numbers. The range
  refuses a motor that doesn't fit the tube, a rocket too long for its fins and one that can't lift off; a slow rail
  exit or a weak liftoff is a warning flag.
- **Launch day**: the slot sheet shows each slot's predicted apogee and the bill (rail fee 250 cr, the rocket, the
  motor). The firing screen shows the rocket climbing from the rail, drawn to scale, with a height gauge; the coast
  to apogee plays sped up. The wind (decided: light and seeded) is only known on the day.
- **The flight report**: height against time, predicted (blue, still air) and flown (red), with apogee, top speed,
  rail speed, the wind and the drift; then the motor's own curves as the onboard logger's data. A motor that fails
  loses the rocket: "Rocket lost", an X on the chart, no pay.
- **Level-set grains, more accurate**: the port's exact distance replaces the grid distance transform, and each cell
  burns smoothly over its width. A round core's starting burn area was 13% high and is now within 3%. A test helper
  that compared with an absolute tolerance was letting it through; the level-set tests now use relative tolerances.
- The board shows up to eight work orders. Glossary: apogee, airframe, nose cone, fins and stability, drag, rail exit
  speed, thrust-to-weight, wind.
- Tests: `tools/sim-tests/flight.js` (6 checks: the textbook no-drag apogee, drag and wind and payload effects,
  determinism, a burst losing the rocket, the launch refusals, grading on apogee). The balance check launches flight
  jobs across seeds and slots (8/8 each), and the career bot flies them.

## 0.6.0.0 — Stage 5, part 2: the conditioning hut, Stand 1 and tier 3

- **The conditioning hut** (a facility, 3 500 cr, reputation 14): a fourth firing slot that holds the motor overnight
  at a temperature you set, −20 to 50 °C in 5 °C steps (the − and + under the slot cards). It adds 60 cr to a firing.
  The bench's temperature button cycles through it too. On the free bench it is always open.
- **Qualification jobs** fire from the hut at the client's temperature (the work order says "Conditioned in the hut to
  −20 °C"); taking one needs the hut. The logbook and reports show the real grain temperature.
- **Stand 1** (16 000 cr, reputation 24): motors up to 2 m long and 170 mm across, a 40 kN load cell, 1 200 cr a
  firing. It opens tier 3: finocyl and moonburner grains, the TR-9 Ox and Steppefire X grades, composite cases,
  ablative liners and throat inserts.
- **Six tier 3 work orders**: a boost-then-sustain curve, an M-class motor that is mostly propellant, hot (45 °C) and
  arctic (−20 °C) qualifications, an N-class sounding booster and a slow nine-second burn. Every one has a solution the
  balance check fires across seeds (7/8 or better).
- Saves: older saves load with no hut; the hut's setting is kept in the save.
- Tests: a new hut check (slot temperatures, clamping, the fee, hut jobs need the hut), the balance check fires hut jobs
  at their own temperature, and the career bot now plays through tier 3.

## 0.5.1.0 — Stage 5, part 1: level-set grains and erosive burning

- **Four new grain shapes** (`sim/levelset.js`): star and slotted (tier 2), finocyl and moonburner (tier 3). The port's
  cross-section is drawn on a 256-cell grid and a distance transform gives every cell its distance from the port; the
  burning surface at web x is where that distance equals x. Burning area, propellant left and port area come out as
  tables the solver reads like the analytic shapes. New controls: points / slots / fins, their reach and width, the
  finocyl's finned length, the moonburner's core offset. Shapes from a tier not yet open are locked in a career.
- **The cross-section** draws the new shapes from their distance maps: the end view paints the burning front as it
  moves, and the side cut shows the moonburner's thin side burning through first.
- **Erosive burning** (plan 6.5): a narrow port speeds the burn where the mass flux passes the grade's threshold. The
  predictor includes it, so the start-up spike shows on the curves; a new "Erosive spike" flag, a data sheet line, and a
  factor in the incident report when it helped burst a case.
- Older logbook entries regenerate with erosive burning now in the model; for almost every motor it is exactly zero.
- Tests: `tools/sim-tests/levelset.js` (6 checks): a round core on the grid against the analytic tube (area and volume
  within 1.3%), mass conservation for every new shape, deterministic tables, a regressive star, design limits and shape
  tiers, and erosive burning growing as the port narrows.

## 0.5.0.0 — Stage 4: career and saves

- **Careers**: the title has Continue, New career (name your startup), Free design, and Saves and backups. A career
  starts at Aqsor Range on Stand 3 with 2 500 cr and up to 1 500 cr of overdraft. Money is plain credits (cr), the
  country is the Altyn Steppe Republic (decided, plan section 0).
- **The work orders board**: up to six offers (new work at your tier first), up to three jobs in hand, each with pay and
  a due day. Every firing is a day. Late delivery cuts the pay 10% a day, never below 40%. A pass pays the job × the
  grade (A 1.2, B 1, C 0.8) and earns reputation; some clients come back with repeat orders at 60% pay.
- **Costs**: every firing pays the stand's range fee and the motor's build cost (propellant, case, liner, nozzle,
  igniter, machining), itemised on the slot sheet before you fire and on the report after. Go broke and the range
  restarts you at the tier's starting money.
- **Facilities**: blockhouse instruments (the full dice in the report, a finer data log) and the Stand 2 lease, which
  opens tier 2: seven new work orders up to 10 kN, including curve shape (progressive / regressive) and mass fraction
  specs, hot and cold slot qualifications.
- **The logbook**: every firing, with its report regenerated from the stored design and seed (the sim is deterministic).
- **Saves**: the game saves itself to `brn-save` as you go; three save slots (`brn-slot1..3`); Back up / Restore with a
  `BRN1:` save code or a backup file, and a gentle reminder bar once there's progress to lose. Restore is all or
  nothing. Settings stay on the phone.
- Tests: 7 new sim checks in `tools/sim-tests/career.js` (prices, pay and the late floor, repeat orders, facilities,
  going broke, curve shape, the load cell, and a bot that plays a whole career), and `check-savecode.js` (19 checks on
  saves and codes), which CI now runs.

## 0.4.0.0 — Stage 3: static fire and incident report (first playable)

- **Work orders**: six fixed contracts (`data/contracts.js`), each with a client, a brief, a spec with tolerance bands
  and a start design that needs work. Tier 1 parts only; everything has to fit Stand 3.
- **The bench's bottom bar** checks the spec against the prediction as you drag, and lets you predict at a firing
  slot's temperature (tap the temperature chip). "To the stand" checks the motor fits and its parts are allowed.
- **Firing slots**: dawn (−6 °C), noon (31 °C), dusk (14 °C) set the grain temperature.
- **The variance model** (`sim/fire.js`, `data/variance.js`): the real motor differs from the prediction by seeded,
  nameable deviations, one random stream per source: propellant batch, case strength, closure retention, liner
  protection, igniter gas, throat wear, casting voids (more likely in bigger grains), grain cracks (more likely cold
  and with a harsh start). A void or crack's extra area burns propellant out of the web, so mass still balances.
- **The failure model**: CATO (case burst), nozzle ejection, burn-through, hang fire, chuffing; a yielded case costs
  a grade. After a burst the trace stops and the chamber vents.
- **The stand**: countdown (Abort works until it's lit), a 2D stand with a plume that follows thrust and failure
  effects, the live strip chart (measured red over predicted blue, pressure above thrust) and gauges. Short burns play
  slowed, long ones sped up.
- **The report**: grade A, B, C or fail; the spec line by line, predicted vs measured; on a failure, the incident
  report's root cause with the number that crossed the line, the factors ranked, "where to fix it" buttons back to the
  bench, and the blockhouse data (this motor's dice). Ruslan Abenov signs it.
- Play is in memory only: the board keeps your design per job and your best grade until you close the page.
- Tests: 11 new checks in `tools/sim-tests/fire.js` (determinism, independent streams, mass with a crack, each failure
  mode, grading, and every contract's solution passing on the stand).

## 0.3.0.1 — fix: keep the hidden game out of search

- `<meta name="robots" content="noindex">` in the page head, as on the other hidden Longlight games. Stage 9 removes
  it at release. (The burnrate DNS record is in Cloudflare now.)

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

**Kelbo to do:** tick **Enforce HTTPS** in the repo's Settings → Pages (the DNS record and the certificate are done).
