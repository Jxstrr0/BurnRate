/* ===================== data/variance.js: how a real firing differs from the prediction (plan section 7) =====================
   The predictor is the ideal motor. A firing is the same motor plus seeded deviations, each one something the incident
   report can name. sim/fire.js draws them, one named random stream per source, so adding a source never reshuffles the
   others. Every spread is 1 standard deviation unless it says otherwise.
   Propellant batch spread is each grade's aVar (data/propellants.js); case strength spread is each material's sVar
   (data/materials.js). */
const VARIANCE={
  eroSd:0.30,          // throat erosion rate spread, fraction
  eroMin:0.2,          //   never less than this x the material's rate
  ignSd:0.15,          // igniter gas delivered, fraction
  ignMin:0.4,
  hangS:0.30,          // igniter strength (after its spread) under this: the grain never lights (hang fire)
  retSd:0.06,          // closure retention spread, fraction
  linerSd:0.07,        // liner protection time spread, fraction
  /* casting voids: a hidden cavity the flame front reaches partway through the burn, a sudden jump in burning area.
     Chance = voidBase + voidPerSeg x segments + voidPerL x litres of propellant, capped at voidMax. */
  voidBase:0.02,voidPerSeg:0.012,voidPerL:0.05,voidMax:0.35,
  voidAt:[0.15,0.80],  // where in the web the flame reaches it (fraction of the web)
  voidArea:[0.06,0.22],// extra burning area while it burns, as a fraction of the grain's area there
  voidLen:[0.04,0.12], // how much of the web it lasts for (fraction of the web)
  /* grain cracks: a crack opens at ignition and adds a lot of area for the rest of the burn. The chance rises with a
     cold grain and a fast pressure rise at the start (a harsh ignition shocks the grain):
       chance = crackBase x (1 + crackCold x degrees under crackWarm) x (rise / crackRise)^crackRiseExp, capped at crackMax
     rise = the fastest pressure rise in the predicted start-up, MPa/s. */
  crackBase:0.012,crackWarm:15,crackCold:0.12,crackRise:250,crackRiseExp:1.5,crackMax:0.5,
  crackArea:[0.25,0.70],
  crackAt:[0.0,0.25],  // where in the web it opens (fraction of the web)
  noiseP:0.006,noiseF:0.010,   // sensor noise on the measured traces, fraction of each trace's peak (display only)
  logRate:400,         // the data logger's sample rate, Hz (the blockhouse upgrade raises it in stage 4)
  logMax:1600,         // never more than this many samples per trace (long burns log slower)
  ventTau:0.04,        // after a burst, an ejected nozzle or a burn-through, the chamber empties with this time constant, s
  chuffHz:7            // the puffing rate drawn on a chuffing trace, Hz
};
/* firing slots: the steppe's hard cold mornings and hot afternoons (plan sections 3 and 6.6). tGrain in °C. The hut slot
   (a facility) fires at whatever temperature the player sets, or the one a contract asks for (sim/career.js slotTemp). */
const SLOTS={
  dawn:{name:"Dawn",tGrain:-6,note:"Cold grain: slower burn, lower pressure, more cracks."},
  noon:{name:"Noon",tGrain:31,note:"Hot grain: faster burn, higher pressure."},
  dusk:{name:"Dusk",tGrain:14,note:"Mild. Close to the predictor's 20 °C."},
  hut:{name:"Hut",tGrain:20,hut:true,note:"Held overnight in the conditioning hut at the temperature you set."}
};
/* the conditioning hut's range, °C, and its step */
const HUT={min:-20,max:50,step:5};
Object.assign(SIM,{VARIANCE,SLOTS,HUT});
