/* ===================== data/tuning.js: physics constants and solver settings =====================
   Every number the ballistics uses that is not a part's own stat. Change these, rerun node tools/sim-test.js. */
const TUNING={
  g0:9.80665,
  pAmb:98500,          // ambient pressure at the range, Pa (the salt flat sits a few hundred metres up)
  pRef:5e6,            // reference pressure for rRef and throat erosion, Pa
  tRef:20,             // reference grain temperature, °C
  steps:420,           // solver: about this many steps across the web
  dtIgn:0.0005,        // solver: time step while the igniter and the flame spread run, s
  dtMax:0.02,          // solver: longest step, s
  tMax:60,             // solver: give up after this long, s
  tailEnd:1.08,        // tail-off ends when chamber pressure falls under this x ambient
  sepRatio:0.4,        // flow separates where nozzle wall pressure would fall under this x ambient (Summerfield)
  eroExp:0.8,          // throat erosion grows as (P/pRef)^eroExp
  headSpace:0.25,      // empty chamber ahead of the grain, as a fraction of grain diameter
  lsGrid:256,          // level-set grains: grid cells across the grain's diameter
  lsSmooth:4,          // level-set grains: the burning area is the port's growth measured over this many cells
  lsWebMin:1.0,        // level-set grains: the thinnest propellant left at the wall, mm
  eroMax:1.5,          // erosive burning: the burn rate gain never goes past this (plan section 6.5)
  segGap:2,            // gap between segments, mm
  closureThk:0.14,     // each closure's thickness as a fraction of bore diameter (for mass)
  closureRho:2700,     // closures are aluminium by default, kg/m³
  ignNeedVol:3.0,      // igniter gas needed per m³ of free chamber volume, kg (fills it to a few bar)
  ignNeedArea:0.025,   // igniter gas needed per m² of burning surface, kg (to heat it to ignition)
  ignDelay:0.025,      // first-light delay at strength 1, s (grows as 1/strength)
  ignSpread:0.06,      // flame spread time over the whole grain at strength 1, s (grows as 1/strength²)
  ignWeak:0.45,        // strength under this: hang-fire risk (stage 3)
  sfWarn:1.5,          // case safety factor under this: warning
  ptWarn:2.0,          // port-to-throat area ratio under this: erosive-spike warning
  eroWarn:1.05,        // an erosive gain on the burn rate over this: warning
  gWarn:1500,          // peak mass flux over this, kg/(m²·s): warning
  linerWarn:0.85,      // burn time over this x liner rating: warning
  spikeWarn:1.3,       // a start-up peak over this x the steady peak: the igniter is too big (warning)
  // impulse classes: A tops out at 2.5 N·s and each letter doubles (the usual hobby scheme)
  classTop:2.5,classLetters:"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  // mass estimates that aren't a part's own stat: the nozzle is a solid of revolution this full, this long x case bore
  nozzleFill:0.45,nozzleLen:0.35
};
/* the bench's yardstick and hints (sim/hint.js, 1.7). designScore weighs how far a motor is from a clean delivery, by the
   predictor alone; the hint tries the moves below one at a time and names the one that helps most. tools/balance-bot.js
   tunes with the same yardstick, so a hint is the bot's next move.
     warnW, critW   weight of each yellow and red flag, growing as the motor goes past the flag's line
     margin         keep this far under every rating, flagged or not (the real motor scatters round the prediction)
     bandIn         a two-sided spec counts as fine inside this share of its half-width from the middle
     refuseW        weight of each reason the stand or the rail would refuse the motor
     steps          the predictor's solver steps while hinting (fewer than a firing's: fast enough for a phone)
     sound          a score under this is a motor that delivers on paper: no move to suggest
     gain           a move must cut the score by at least this share to be worth naming
     moves          [field or move, first step, kind]: x multiplies, + adds, i whole numbers (xi: multiply, then round),
                    m a move made together (size: the whole motor; segsKeep: more, shorter segments at the same length;
                    coreThroat: the core and the throat together)
     picks          the parts a hint may swap to (only ones the player has); parts: what it may tell you to look at */
const HINT={warnW:0.5,critW:10,margin:0.85,bandIn:0.4,refuseW:20,steps:110,sound:0.05,gain:0.1,
  moves:[["nozzle.throatD",1.08,"x"],["grain.segLen",1.12,"x"],["grain.coreD",1.06,"x"],["nozzle.exitD",1.08,"x"],
    ["case.id",1.06,"xi"],["case.wall",0.3,"+"],["grain.segs",1,"i"],["case.linerThk",0.5,"+"],["case.bolts",2,"i"],
    ["size",1.06,"m"],["segsKeep",1,"m"],["coreThroat",1.06,"m"]],
  picks:["igniter","airframe.nose","airframe.fins","airframe.body"],
  parts:["grain.prop","grain.shape","case.mat","nozzle.mat","case.liner","case.closure"]};
Object.assign(SIM,{TUNING,HINT});
