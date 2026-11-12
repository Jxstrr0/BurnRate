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
  gWarn:1500,          // peak mass flux over this, kg/(m²·s): warning
  linerWarn:0.85,
  spikeWarn:1.3,       // a start-up peak over this x the steady peak: the igniter is too big (warning)      // burn time over this x liner rating: warning
  // impulse classes: A tops out at 2.5 N·s and each letter doubles (the usual hobby scheme)
  classTop:2.5,classLetters:"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  // mass estimates that aren't a part's own stat: the nozzle is a solid of revolution this full, this long x case bore
  nozzleFill:0.45,nozzleLen:0.35
};
Object.assign(SIM,{TUNING});
