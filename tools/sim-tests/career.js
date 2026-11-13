/* Burn Rate: career checks (sim/career.js, data/career.js; plan sections 4 and 5).
   Money, deadlines, reputation, the board, facilities and going broke, the curve-shape number tier 2 contracts grade on,
   the conditioning hut, and a bot that plays a whole career with each contract's solution: every job can be delivered,
   tiers 2 and 3 open, and the money never runs past the overdraft. */
module.exports = ({ SIM, check, near }) => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const C = SIM.CAREER, byId = SIM.contractById;
  const pass = letter => ({ pass: true, letter });

  check("career: build cost is the items' sum, every item is positive, and a bigger motor costs more", () => {
    const small = SIM.REF_DESIGNS["29mm 2-seg BATES, Mule"], big = SIM.REF_DESIGNS["54mm 4-seg BATES, Dray, steel throat"];
    const a = SIM.buildCost(SIM.motorFromDesign(small), small), b = SIM.buildCost(SIM.motorFromDesign(big), big);
    for (const x of [a, b]) { if (x.items.reduce((s, i) => s + i.cr, 0) !== x.total) throw new Error("items don't add up"); if (x.items.some(i => !(i.cr >= 0))) throw new Error("a negative item"); }
    if (!(b.total > 3 * a.total)) throw new Error(`54 mm ${b.total} cr vs 29 mm ${a.total} cr`);
    const f = SIM.firingCost("s3", SIM.motorFromDesign(small), small);
    if (f.total !== f.fee + f.build.total || f.fee !== SIM.STANDS.s3.fee) throw new Error("firing cost isn't fee + build");
    return `29 mm ${a.total} cr, 54 mm ${b.total} cr`;
  });

  check("career: a pass pays fee x grade x lateness, earns reputation, finishes the job; a fail only costs", () => {
    const car = SIM.newCareer("t", "Test"), c = byId("dala-g48");
    if (SIM.takeJob(car, c.id)) throw new Error("couldn't take the job");
    const m0 = car.money, d0 = car.day;
    let o = SIM.settle(car, c, { pass: false, why: "cato" }, 200);
    if (car.money !== m0 - 200 || car.day !== d0 + 1 || o.paid || !car.jobs[c.id] || car.jobs[c.id].n !== 1) throw new Error("a failure didn't just cost a day and the bill");
    o = SIM.settle(car, c, pass("A"), 200);
    near(o.paid, c.pay * C.gradePay.A, 0.5, "on-time A pay");
    if (car.jobs[c.id] || !car.done[c.id] || car.rep !== C.rep.A) throw new Error("the job didn't finish with its reputation");
    /* late: three days past the deadline cuts 30% */
    const car2 = SIM.newCareer("t2", "Late"); SIM.takeJob(car2, c.id); car2.day = car2.jobs[c.id].due + 3;
    o = SIM.settle(car2, c, pass("B"), 100);
    near(o.paid, c.pay * (1 - 3 * C.lateCut), 0.5, "3 days late");
    const ls = SIM.lateShare({ due: 1 }, 40);
    near(ls.mul, C.lateFloor, 1e-9, "the floor on a very late job");
    return `A ${Math.round(c.pay * C.gradePay.A)} cr, 3 days late B ${o.paid} cr`;
  });

  check("career: repeat orders come back after their days at their share; the board respects tier, stand and job limit", () => {
    const car = SIM.newCareer("r", "Repeat"), c = byId("dala-g48");
    SIM.takeJob(car, c.id); SIM.settle(car, c, pass("B"), 0);
    if (SIM.board(car).includes(c)) throw new Error("a delivered repeat order is straight back");
    car.day = car.done[c.id].again;
    if (!SIM.board(car).includes(c)) throw new Error("the repeat order didn't come back");
    if (SIM.basePay(car, c) !== Math.round(c.pay * c.repeat.pay)) throw new Error("repeat pay");
    if (SIM.board(car).some(x => x.tier > 1)) throw new Error("tier 2 work on a tier 1 board");
    if (!SIM.canTake(car, "dala-j")) throw new Error("took a tier 2 job at tier 1");
    const ids = SIM.board(car).map(x => x.id);
    for (let i = 0; i < C.maxJobs; i++) SIM.takeJob(car, ids[i]);
    if (!SIM.canTake(car, ids[C.maxJobs])) throw new Error("more than maxJobs in hand");
  });

  check("career: an empty board can wait, free, for the next repeat order; tier 1 always has repeat work", () => {
    const car = SIM.newCareer("w", "Wait"), m0 = car.money;
    for (const c of SIM.CONTRACTS.filter(x => (x.tier || 1) === 1)) { SIM.takeJob(car, c.id); SIM.settle(car, c, pass("B"), 0); }
    car.day = 0; /* rewind the clock so every repeat order is still away */
    if (SIM.board(car).length) throw new Error("the board isn't empty after every tier 1 job");
    const due = Math.min(...Object.keys(car.done).map(id => car.done[id].again).filter(x => x != null));
    if (SIM.nextWork(car) !== due) throw new Error(`next work on day ${SIM.nextWork(car)}, expected ${due}`);
    const day = car.day, money = car.money, n = SIM.waitForWork(car);
    if (n !== due - day || car.day !== due) throw new Error("waiting didn't land on the repeat order's day");
    if (car.money !== money) throw new Error("waiting cost money");
    if (!SIM.board(car).length) throw new Error("the board is still empty after waiting");
    if (SIM.waitForWork(SIM.newCareer("w0", "Fresh")) !== 0) throw new Error("a fresh career waited with work on the board");
    /* the board shows older tiers' work too, so repeat orders at tier 1 keep every tier from running dry */
    if (!SIM.CONTRACTS.some(c => (c.tier || 1) === 1 && c.repeat)) throw new Error("no tier 1 repeat order to wait for");
    return `waited ${n} days (money ${m0} at start)`;
  });

  check("career: facilities need reputation and money; Stand 2 opens tier 2; going broke offers a tier restart", () => {
    const car = SIM.newCareer("f", "Fac");
    if (!SIM.canBuy(car, "s2")) throw new Error("bought Stand 2 with no reputation");
    car.rep = 99; car.money = 100;
    if (!SIM.canBuy(car, "s2")) throw new Error("bought Stand 2 with no money");
    car.money = 99999;
    if (SIM.buy(car, "s2") || car.tier !== 2 || !car.stands.s2 || car.money !== 99999 - SIM.FACILITIES.s2.cost) throw new Error("Stand 2 didn't open tier 2");
    if (!SIM.board(car).some(c => c.tier === 2)) throw new Error("no tier 2 work after the lease");
    car.money = -C.overdraft;
    if (!SIM.isBroke(car)) throw new Error("not broke at the overdraft limit");
    SIM.restartTier(car);
    if (car.money !== C.startMoney[2] || car.broke !== 1 || Object.keys(car.jobs).length) throw new Error("tier restart");
  });

  check("curve shape: a tube grain is progressive, a long-segment BATES neutral, short fat BATES segments regressive", () => {
    const tube = SIM.predict(SIM.REF_DESIGNS["38mm tube, Swift 9 (progressive)"], { tGrain: 20 }).sum.prog;
    const bates = SIM.predict(SIM.REF_DESIGNS["38mm 3-seg BATES, Mule"], { tGrain: 20 }).sum.prog;
    const fat = SIM.predict(byId("qyran-regress").solution, { tGrain: 20 }).sum.prog;
    if (!(tube > 1.3)) throw new Error("tube " + tube);
    if (!(Math.abs(bates - 1) < 0.15)) throw new Error("BATES " + bates);
    if (!(fat < 0.85)) throw new Error("short BATES " + fat);
    return `tube ${tube.toFixed(2)}, BATES ${bates.toFixed(2)}, short BATES ${fat.toFixed(2)}`;
  });

  check("pre-fire: a motor past the stand's load cell is refused, naming the throat", () => {
    const d = SIM.REF_DESIGNS["54mm 4-seg BATES, Dray, steel throat"], p = SIM.predict(d, { tGrain: 20 });
    const k = Object.assign({}, byId("dala-j"), { stand: Object.assign({}, SIM.STANDS.s2, { cell: p.sum.Fmax * 0.9 }) });
    const pf = SIM.preFire(k, d, p.motor, { tier: 2, sum: p.sum });
    if (!pf.some(x => x.field === "nozzle.throatD" && /load cell/.test(x.text))) throw new Error("no load-cell refusal");
    if (!SIM.preFire(Object.assign({}, k, { stand: SIM.STANDS.s2 }), d, p.motor, { tier: 1, sum: p.sum }).some(x => /tier 2/.test(x.text))) throw new Error("tier 2 parts allowed at tier 1");
  });

  check("career bot: every contract's solution delivers, tiers 2, 3 and 4 open, money stays inside the overdraft", () => {
    const car = SIM.newCareer("bot", "Bot"), slotFor = c => c.slot || "dusk";
    let fired = 0, low = car.money, fails = 0;
    const fireJob = c => {
      const d = c.solution, m = SIM.motorFromDesign(d), bill = SIM.firingCost(c.stand, m, d, slotFor(c), !!c.flight, c.lot ? C.lot.n : 1);
      if (!SIM.canAfford(car, bill.total)) throw new Error(`day ${car.day}: can't afford ${c.id}`);
      const n = car.jobs[c.id].n + 1, cond = SIM.standCond(c, { tGrain: SIM.slotTemp(slotFor(c), c, 20), logRate: C.logRate[car.bunker] }), seed = SIM.fireSeed(car, c.id, n);
      /* a tender delivers by a lot of five */
      const g = c.lot ? SIM.gradeLot(c, SIM.fireLot(d, cond, seed)) : SIM.grade(c, c.flight ? SIM.launch(d, cond, seed, { payload: c.flight.payload }) : SIM.fire(d, cond, seed));
      SIM.settle(car, c, g, bill.total, { lot: !!c.lot }); fired++; if (!g.pass) fails++;
      SIM.logFiring(car, { day: car.day - 1, key: c.id, n, slot: slotFor(c), seed: "x", design: d });
      low = Math.min(low, car.money);
    };
    const runTier = (t, only) => {
      for (let guard = 0; guard < 80; guard++) {
        const todo = SIM.CONTRACTS.filter(c => c.tier === t && !car.done[c.id] && (!only || only(c)));
        if (!todo.length) return;
        for (const c of todo) if (!car.jobs[c.id] && !SIM.canTake(car, c.id)) SIM.takeJob(car, c.id);
        const id = Object.keys(car.jobs)[0]; if (!id) throw new Error("stuck with no job at tier " + t);
        fireJob(byId(id));
      }
      throw new Error("tier " + t + " never finished");
    };
    runTier(1);
    if (SIM.canBuy(car, "s2")) throw new Error(`can't lease Stand 2 after tier 1: ${SIM.canBuy(car, "s2")}`);
    SIM.buy(car, "s2");
    if (!SIM.canBuy(car, "bunker")) SIM.buy(car, "bunker");
    runTier(2);
    for (const id of ["hut", "s1"]) { const why = SIM.canBuy(car, id); if (why) throw new Error(`can't get ${id} after tier 2: ${why}`); SIM.buy(car, id); }
    if (car.tier !== 3 || !car.stands.s1 || car.hut !== 1) throw new Error("buying Stand 1 and the hut didn't open tier 3");
    runTier(3);
    { const why = SIM.canBuy(car, "tenders"); if (why) throw new Error(`can't join the tender register after tier 3: ${why}`); SIM.buy(car, "tenders"); }
    if (car.tier !== 4) throw new Error("the tender register didn't open tier 4");
    /* tier 4: the open-stand tenders first, then the altitude chamber's; the capstone only once every other tender is won */
    const cap = SIM.CONTRACTS.find(c => c.final);
    runTier(4, c => c.stand !== "s0");
    if (SIM.board(car).includes(cap)) throw new Error("the capstone is on the board before the chamber's tenders are won");
    { const why = SIM.canBuy(car, "chamber"); if (why) throw new Error(`can't lease the altitude chamber after the open-stand tenders: ${why}`); SIM.buy(car, "chamber"); }
    runTier(4, c => !c.final);
    if (!SIM.finalOpen(car) || !SIM.board(car).includes(cap)) throw new Error("the capstone didn't open once every other tender was won");
    runTier(4);
    if (car.won !== car.done[cap.id].day) throw new Error("winning the capstone didn't mark the career won");
    const wonDay = car.won; car.day = car.done[cap.id].again; { const why = SIM.takeJob(car, cap.id); if (why) throw new Error("the capstone's repeat order: " + why); } fireJob(cap);
    if (car.won !== wonDay || car.done[cap.id].times !== 2) throw new Error("the capstone's repeat order should pay again but not win again");
    if (low < -C.overdraft) throw new Error("money went past the overdraft");
    if (car.log.length > C.logMax) throw new Error("logbook not capped");
    return `${fired} firings (${fails} failed), day ${car.day}, ${Math.round(car.money)} cr, reputation ${car.rep}, lowest ${Math.round(low)} cr`;
  });

  check("tenders: a lot is one fee for five motors; four of five pass; one failure cuts the pay; two lose the tender for a while", () => {
    const L = C.lot, c = SIM.CONTRACTS.find(x => x.lot), d = c.solution, m = SIM.motorFromDesign(d);
    if (!c || !SIM.CONTRACTS.filter(x => x.lot).every(x => x.tier === 4 && !x.flight)) throw new Error("tenders should be tier 4 stand jobs");
    const one = SIM.firingCost(c.stand, m, d, "dusk"), lot = SIM.firingCost(c.stand, m, d, "dusk", false, L.n);
    if (lot.total !== one.fee + one.build.total * L.n || lot.fee !== one.fee) throw new Error("a lot's bill isn't one fee plus five motors");
    const cond = { tGrain: SIM.SLOTS.dusk.tGrain }, fires = SIM.fireLot(d, cond, "lot-test");
    if (fires.length !== L.n || JSON.stringify(SIM.fireLot(d, cond, "lot-test").map(f => f.meas.sum.I)) !== JSON.stringify(fires.map(f => f.meas.sum.I))) throw new Error("a lot isn't five repeatable motors");
    if (new Set(fires.map(f => f.meas.sum.I.toFixed(3))).size < 2) throw new Error("the five motors of a lot are identical");
    const gl = SIM.gradeLot(c, fires), worst = gl.grades.filter(g => g.pass).map(g => g.letter).sort().pop();
    if (!gl.pass || gl.letter !== worst) throw new Error("the solution's lot should pass with its worst motor's grade");
    /* a design far too thin-walled fails every motor */
    const bad = JSON.parse(JSON.stringify(d)); bad.case.wall = 0.2; bad.case.mat = "phenolic";
    const gb = SIM.gradeLot(c, SIM.fireLot(bad, cond, "lot-bad"));
    if (gb.pass || gb.fails < 2 || gb.why !== "lot") throw new Error("a lot of bursting motors passed");
    const car = SIM.newCareer("tender", "T"); Object.assign(car, { tier: 4, rep: 99, money: 1e6 }); car.stands.s1 = true; car.hut = 1;
    if (SIM.takeJob(car, c.id)) throw new Error("couldn't take a tender");
    /* a development motor: costs, counts, pays nothing, leaves the job in hand */
    let out = SIM.settle(car, c, { pass: true, letter: "A" }, 100, {});
    if (!out.dev || out.paid || !car.jobs[c.id] || car.jobs[c.id].n !== 1) throw new Error("a single firing on a tender delivered it");
    /* a lot with one failure: delivered at a cut */
    const pay = car.jobs[c.id].pay; out = SIM.settle(car, c, { pass: true, letter: "B", payMul: L.failPay }, 100, { lot: true });
    if (!out.done || out.paid !== Math.round(pay * C.gradePay.B * L.failPay)) throw new Error(`one failure should pay ${L.failPay} of a B (${out.paid})`);
    /* a lost lot: the job goes, and the tender only comes back after the wait */
    const c2 = SIM.CONTRACTS.filter(x => x.lot)[1]; SIM.takeJob(car, c2.id);
    out = SIM.settle(car, c2, { pass: false, letter: "–", why: "lot" }, 100, { lot: true });
    if (!out.lost || car.jobs[c2.id] || out.paid) throw new Error("a failed lot didn't lose the tender");
    if (SIM.board(car).includes(c2)) throw new Error("a lost tender is straight back on the board");
    car.day += L.retender; if (!SIM.board(car).includes(c2)) throw new Error("a lost tender never came back");
    /* the register needs Stand 1 */
    const early = SIM.newCareer("early", "E"); Object.assign(early, { rep: 99, money: 1e6 });
    if (!/Stand 1/.test(SIM.canBuy(early, "tenders"))) throw new Error("the tender register opened without Stand 1");
  });

  check("tenders: each solution's lot passes at some slot, 5 lots of 5", () => {
    const out = [], N = 5;
    for (const c of SIM.CONTRACTS.filter(x => x.lot)) {
      let best = 0, bestSlot = "";
      for (const slot of c.slot ? [c.slot] : ["dusk", "noon", "dawn"]) {
        let ok = 0; for (let i = 0; i < N; i++) if (SIM.gradeLot(c, SIM.fireLot(c.solution, SIM.standCond(c, { tGrain: SIM.slotTemp(slot, c, null) }), c.id + "/lot" + i)).pass) ok++;
        if (ok > best) { best = ok; bestSlot = slot; }
        if (best === N) break;
      }
      if (best < N) throw new Error(`${c.id}: only ${best}/${N} lots pass at ${bestSlot}`);
      out.push(`${c.id} ${bestSlot}`);
    }
    return out.join(", ");
  });

  check("first job: the club's old drawing bursts at every slot, the predictor says so, and a bigger throat passes", () => {
    const c = byId("first-light"), d = JSON.parse(JSON.stringify(c.start));
    const p = SIM.predict(d, { tGrain: 20 }).sum;
    if (!p.warnings.some(w => w.sev === "crit")) throw new Error("the predictor gives no critical warning on the old drawing");
    let cato = 0, n = 0;
    for (const slot of ["dawn", "noon", "dusk"]) for (let i = 0; i < 6; i++) { n++; const f = SIM.fire(d, { tGrain: SIM.SLOTS[slot].tGrain }, "tour" + i + "/first-light/1"); if (f.failure && f.failure.key === "cato") cato++; }
    if (cato < n) throw new Error(`only ${cato}/${n} burst: the tour expects a CATO`);
    const f = SIM.fire(d, { tGrain: SIM.SLOTS.dusk.tGrain }, "tour/fix");
    if (!f.failure.fix.includes("nozzle.throatD")) throw new Error("the incident report doesn't point at the throat");
    d.nozzle.throatD = 6.5; d.nozzle.exitD = 13; let pass = 0;
    for (let i = 0; i < 6; i++) if (SIM.grade(c, SIM.fire(d, { tGrain: SIM.SLOTS.dusk.tGrain }, "tourfix" + i)).pass) pass++;
    if (pass < 6) throw new Error(`the throat fix passes only ${pass}/6`);
  });

  check("hut: fires at the job's temperature or the player's setting (clamped), costs its fee, and hut jobs need the hut", () => {
    const H = SIM.HUT, hutJob = SIM.CONTRACTS.find(c => c.slot === "hut");
    if (!hutJob) throw new Error("no hut job in the contracts");
    if (SIM.slotTemp("dawn", hutJob, 40) !== SIM.SLOTS.dawn.tGrain) throw new Error("a weather slot used the hut's setting");
    if (SIM.slotTemp("hut", hutJob, 0) !== hutJob.tGrain) throw new Error("a hut job didn't fire at its own temperature");
    if (SIM.slotTemp("hut", null, 35) !== 35 || SIM.slotTemp("hut", null, 99) !== H.max || SIM.slotTemp("hut", null, -99) !== H.min) throw new Error("the hut's setting isn't clamped to its range");
    const d = SIM.REF_DESIGNS["38mm 3-seg BATES, Mule"], m = SIM.motorFromDesign(d);
    const a = SIM.firingCost("s3", m, d, "dusk"), b = SIM.firingCost("s3", m, d, "hut");
    if (b.total - a.total !== C.hutFee || a.hut !== 0) throw new Error("the hut's fee isn't on the bill");
    const hot = SIM.predict(d, { tGrain: SIM.slotTemp("hut", null, H.max) }).sum, cold = SIM.predict(d, { tGrain: SIM.slotTemp("hut", null, H.min) }).sum;
    if (!(hot.Pmax > cold.Pmax && hot.tb < cold.tb)) throw new Error("a hot hut didn't burn faster than a cold one");
    const car = SIM.newCareer("hut", "Hut"); car.tier = hutJob.tier; car.stands[hutJob.stand] = true; car.rep = 99;
    if (!/hut/.test(SIM.canTake(car, hutJob.id) || "")) throw new Error("a hut job was taken without the hut");
    car.money = 1e6; SIM.buy(car, "hut");
    if (SIM.canTake(car, hutJob.id)) throw new Error("a hut job was refused with the hut: " + SIM.canTake(car, hutJob.id));
    return `hot ${(hot.Pmax / 1e6).toFixed(2)} MPa ${hot.tb.toFixed(2)} s, cold ${(cold.Pmax / 1e6).toFixed(2)} MPa ${cold.tb.toFixed(2)} s`;
  });
};
