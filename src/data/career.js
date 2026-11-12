/* ===================== data/career.js: money, range days, reputation and facilities (plan section 5) =====================
   The career's tuning numbers. Money is in plain credits ("cr", Kelbo 12 November 2026). sim/career.js reads these.
   A firing costs one range day, the stand's range fee and the motor's build cost (its materials, priced per kg from the
   part tables, plus machining). A pass pays the job's fee times the grade's share, cut for each day past the deadline
   (Kelbo: a late delivery still pays, a little less each day). */
const CAREER={
  startMoney:{1:2500,2:6000},   // what a new career (or a restarted tier) starts with, cr
  overdraft:1500,      // the bank lets the money go this far below zero before it stops a firing
  matMul:6,            // build cost = mass x the part's cost per kg x this (the part tables' costs are raw stock prices)
  shopBase:30,         // machining a motor: a flat charge, cr
  shopPerMm:0.8,       // ... plus this per mm of case bore (bigger cases, bigger lathe time), cr
  perBolt:2,           // ... plus this per closure bolt, cr
  gradePay:{A:1.2,B:1,C:0.8},   // a pass pays the job's fee times this
  rep:{A:3,B:2,C:1},   // reputation for a first delivery (repeat orders earn half, rounded down)
  lateCut:0.1,         // each range day past the deadline takes this share off the pay ...
  lateFloor:0.4,       // ... down to this share at worst
  maxJobs:3,           // jobs in hand at once
  boardMax:6,          // work orders shown on the board
  logMax:120,          // logbook entries kept in the save (the oldest go first)
  logRate:{0:120,1:400} // the data logger's sample rate by blockhouse level, Hz
};
/* facilities. need: reputation needed before the range will lease it. give: what buying it changes. */
const FACILITIES={
  bunker:{name:"Blockhouse instruments",cost:2200,need:4,give:{bunker:1},
    note:"A faster data logger and the full blockhouse readout: 400 samples a second instead of 120, and every deviation the motor rolled shows on the report."},
  s2:{name:"Stand 2 lease",cost:5000,need:10,give:{stand:"s2",tier:2},
    note:"The medium stand: motors up to 900 mm long and 110 mm across, a 10 kN load cell. Opens tier 2 work and tier 2 parts."}
};
Object.assign(SIM,{CAREER,FACILITIES});
