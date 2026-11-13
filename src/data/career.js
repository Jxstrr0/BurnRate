/* ===================== data/career.js: money, range days, reputation and facilities (plan section 5) =====================
   The career's tuning numbers. Money is in plain credits ("cr", Kelbo 12 November 2026). sim/career.js reads these.
   A firing costs one range day, the stand's range fee and the motor's build cost (its materials, priced per kg from the
   part tables, plus machining). A pass pays the job's fee times the grade's share, cut for each day past the deadline
   (Kelbo: a late delivery still pays, a little less each day). */
const CAREER={
  startMoney:{1:2500,2:6000,3:15000,4:30000},   // what a new career (or a restarted tier) starts with, cr
  overdraft:1500,      // the bank lets the money go this far below zero before it stops a firing
  matMul:6,            // build cost = mass x the part's cost per kg x this (the part tables' costs are raw stock prices)
  shopBase:30,         // machining a motor: a flat charge, cr
  shopPerMm:0.8,       // ... plus this per mm of case bore (bigger cases, bigger lathe time), cr
  perBolt:2,           // ... plus this per closure bolt, cr
  hutFee:60,           // holding a motor in the conditioning hut overnight, per firing, cr
  gradePay:{A:1.2,B:1,C:0.8},   // a pass pays the job's fee times this
  rep:{A:3,B:2,C:1},   // reputation for a first delivery (repeat orders earn half, rounded down)
  lateCut:0.1,         // each range day past the deadline takes this share off the pay ...
  lateFloor:0.4,       // ... down to this share at worst
  maxJobs:3,           // jobs in hand at once
  boardMax:8,          // work orders shown on the board
  logMax:120,          // logbook entries kept in the save (the oldest go first)
  logRate:{0:120,1:400}, // the data logger's sample rate by blockhouse level, Hz
  /* tier 4 range tenders (Kelbo, 13 November 2026): a lot of five motors from one design fires on one range day for one
     stand fee (and one hut fee); four must pass. One failure still delivers but cuts the pay; two or more lose the
     tender, which the range puts out again some days later. The lot's grade is its worst passing motor's. */
  lot:{n:5,need:4,failPay:0.7,retender:6}
};
/* facilities. need: reputation needed before the range will lease it. after: a facility that must be owned first.
   give: what buying it changes. */
const FACILITIES={
  bunker:{name:"Blockhouse instruments",cost:2200,need:4,give:{bunker:1},
    note:"A faster data logger and the full blockhouse readout: 400 samples a second instead of 120, and every deviation the motor rolled shows on the report."},
  s2:{name:"Stand 2 lease",cost:5000,need:10,give:{stand:"s2",tier:2},
    note:"The medium stand: motors up to 900 mm long and 110 mm across, a 10 kN load cell. Opens tier 2 work and tier 2 parts."},
  hut:{name:"Conditioning hut",cost:3500,need:14,give:{hut:1},
    note:"An insulated hut that holds a motor at the temperature you set, −20 to 50 °C, overnight before it fires. Some qualification jobs need it. 60 cr a firing."},
  s1:{name:"Stand 1 lease",cost:16000,need:24,give:{stand:"s1",tier:3},
    note:"The old state booster stand: motors up to 2 m long and 170 mm across, a 40 kN load cell. Opens tier 3 work and tier 3 parts."},
  tenders:{name:"Range tender register",cost:30000,need:45,after:"s1",give:{tier:4},
    note:"A place on the state's list of approved motor suppliers. Opens tier 4: booster tenders, each delivered as a lot of five motors from one design, at least four of which must pass."}
};
Object.assign(SIM,{CAREER,FACILITIES});
