/* tools/sim-tests/fire.js: the stage 3 firing, failure model, grading and contracts (plan sections 4, 7 and 8).
   The variance model must stay explainable and repeatable: the same seed fires the same, each source draws from its own
   stream, extra burning area from a void or crack still conserves mass, and each failure mode fires when (and only
   when) its line is crossed. The balance check fires every contract's solution so each stays solvable. */
module.exports = ({ SIM, check, near }) => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const set = (d, f, v) => { const k = f.split("."); let o = d; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = v; return d; };
  const D = SIM.DEFAULT_DESIGN, noon = { tGrain: SIM.SLOTS.noon.tGrain };

  check("fire: the same design, conditions and seed fire the same, sample for sample", () => {
    const a = SIM.fire(D, noon, "det"), b = SIM.fire(D, noon, "det");
    if (JSON.stringify([a.log, a.failure, a.draws, a.factors]) !== JSON.stringify([b.log, b.failure, b.draws, b.factors])) throw new Error("two firings differ");
    const c = SIM.fire(D, noon, "det2");
    if (c.draws.aMul === a.draws.aMul) throw new Error("a different seed drew the same batch");
  });

  check("fire: each variance source draws from its own stream (changing the motor never reshuffles them)", () => {
    const other = SIM.REF_DESIGNS["38mm tube, Swift 9 (progressive)"];
    for (const seed of ["s1", "s2", "s3"]) {
      const a = SIM.fire(D, noon, seed), b = SIM.fire(other, noon, seed);
      const pa = SIM.PROPELLANTS[D.grain.prop], pb = SIM.PROPELLANTS[other.grain.prop];
      near((a.draws.aMul - 1) / pa.aVar, (b.draws.aMul - 1) / pb.aVar, 1e-9, "batch draw in sd");
      near(a.draws.eroMul, b.draws.eroMul, 1e-12, "throat draw");
      near(a.draws.ignMul, b.draws.ignMul, 1e-12, "igniter draw");
    }
  });

  check("variance area: a crack's extra area raises pressure, shortens the burn and still conserves mass (0.5%)", () => {
    const m = SIM.motorFromDesign(D), x0 = m.grain.web * 0.1, extra = 0.3 * m.grain.A(x0);
    const base = SIM.simulate(m, noon), cr = SIM.simulate(m, noon, { areaAdd: (t, x) => x >= x0 ? extra : 0 });
    const pk = a => Math.max(...a), mp = m.mass.prop, M = cr.mass;
    if (!(pk(cr.p) > pk(base.p) * 1.1)) throw new Error("the crack barely moved the peak");
    const sb = SIM.summarize(m, base), sc = SIM.summarize(m, cr);
    if (!(sc.tb < sb.tb * 0.95)) throw new Error(`burn ${sc.tb.toFixed(2)} s, not shorter than ${sb.tb.toFixed(2)} s`);
    near(M.burned / mp, 1, 0.005, "burned / propellant");
    near(M.out, M.burned + M.ign + M.gas0 - M.gasEnd, 0.005 * mp, "mass balance");
    return `peak +${((pk(cr.p) / pk(base.p) - 1) * 100).toFixed(0)}%, burn ${sb.tb.toFixed(2)} → ${sc.tb.toFixed(2)} s`;
  });

  check("fire: a clean firing lands near the prediction (impulse within 5%)", () => {
    let n = 0;
    for (let i = 0; i < 12 && n < 4; i++) {
      const f = SIM.fire(D, noon, "clean" + i);
      if (f.failure || f.draws.void || f.draws.crack) continue;
      n++;
      near(f.meas.sum.I / f.pred.sum.I, 1, 0.05, "measured / predicted impulse");
    }
    if (!n) throw new Error("no clean firings in 12 seeds");
  });

  const failOf = (d, cond, seeds) => { for (const s of seeds || ["f1", "f2", "f3"]) { const f = SIM.fire(d, cond || noon, s); if (f.failure) return f; } return SIM.fire(d, cond || noon, "f1"); };
  check("failure: a case far too thin bursts (CATO), the trace stops there and the report points at the wall", () => {
    const d = set(set(set(clone(D), "case.mat", "phenolic"), "case.wall", 0.5), "nozzle.throatD", 4.5);
    const f = failOf(d);
    if (!f.failure || f.failure.key !== "cato") throw new Error("got " + (f.failure && f.failure.key));
    if (!f.failure.fix.includes("case.wall")) throw new Error("fix list misses the wall");
    const pBurst = f.limits.pBurst, i = f.failure.i;
    if (!(f.meas.run.p[i] > pBurst)) throw new Error("the failure sample is under the burst pressure");
    if (Math.max(...f.meas.run.p.slice(0, i)) > pBurst) throw new Error("an earlier sample was already past it");
    if (f.meas.run.f.slice(i + 1).some(v => v > 0)) throw new Error("thrust after the burst");
    if (!/MPa/.test(f.failure.text) || !f.factors.length) throw new Error("no numbers or factors in the report");
    return f.failure.text.slice(0, 70) + "…";
  });

  check("failure: closures that can't take the load let the nozzle go before a strong case bursts", () => {
    const d = set(set(clone(D), "case.wall", 3.5), "nozzle.throatD", 2.8);
    const f = failOf(d);
    if (!f.failure || f.failure.key !== "eject") throw new Error("got " + (f.failure && f.failure.key));
    if (!f.failure.fix.includes("case.closure")) throw new Error("fix list misses the closures");
  });

  check("failure: a liner thinner than the burn burns through; a thick one doesn't", () => {
    const f = failOf(set(clone(D), "case.linerThk", 0.4));
    if (!f.failure || f.failure.key !== "burnthrough") throw new Error("thin: got " + (f.failure && f.failure.key));
    if (!f.failure.fix.includes("case.linerThk")) throw new Error("fix list misses the liner");
    const g = SIM.fire(set(clone(D), "case.linerThk", 2.0), noon, "f1");
    if (g.failure && g.failure.key === "burnthrough") throw new Error("thick liner burned through");
  });

  check("failure: a micro igniter in a big motor hangs fire; the reference igniter lights it", () => {
    const big = SIM.REF_DESIGNS["98mm 5-seg BATES, Ox, composite"];
    const f = SIM.fire(set(clone(big), "igniter", "xs"), noon, "f1");
    if (!f.failure || f.failure.key !== "hangfire") throw new Error("got " + (f.failure && f.failure.key));
    if (f.meas.sum.I > 1) throw new Error("a hang fire made impulse");
    const g = SIM.fire(big, noon, "f1");
    if (g.failure && g.failure.key === "hangfire") throw new Error("the reference igniter hung fire");
  });

  check("failure: a motor that runs under its grade's stable minimum chuffs (no grade, not destructive)", () => {
    const f = SIM.fire(set(set(clone(D), "nozzle.throatD", 9.5), "case.linerThk", 2.0), noon, "f1");
    if (!f.failure || f.failure.key !== "chuff" || f.failure.destructive) throw new Error("got " + (f.failure && f.failure.key));
  });

  check("grading: closeness to the band's middle sets A, B, C; out of band fails; a yielded case loses a letter", () => {
    const c = { spec: [{ k: "I", lo: 100, hi: 200 }, { k: "tb", hi: 3 }] };
    const fake = (I, tb, yielded) => ({ ok: true, failure: null, yielded, motor: { mass: { total: 0.1 } }, meas: { sum: { I, tb } } });
    const g = (I, tb, y) => SIM.grade(c, fake(I, tb, y));
    if (g(150, 2).letter !== "A" || g(176, 2).letter !== "B" || g(195, 2).letter !== "C") throw new Error("letters");
    if (g(210, 2).pass || g(150, 3.1).pass) throw new Error("out of band passed");
    if (g(150, 2, true).letter !== "B" || g(195, 2, true).pass) throw new Error("yield rule");
  });

  check("contracts: well formed; every start design builds; every solution fits the stand and passes", () => {
    const out = [];
    for (const c of SIM.CONTRACTS) {
      if (!SIM.STANDS[c.stand]) throw new Error(c.id + ": no stand " + c.stand);
      if (c.slot && !SIM.SLOTS[c.slot]) throw new Error(c.id + ": no slot " + c.slot);
      for (const s of c.spec) if (!SIM.SPEC_INFO[s.k] || (s.lo == null && s.hi == null)) throw new Error(c.id + ": bad criterion " + s.k);
      const start = typeof c.start === "string" ? SIM.REF_DESIGNS[c.start] : c.start;
      if (!start || !SIM.motorFromDesign(start).ok) throw new Error(c.id + ": start design doesn't build");
      const k = Object.assign({}, c, { stand: SIM.STANDS[c.stand] }), m = SIM.motorFromDesign(c.solution);
      if (!m.ok) throw new Error(c.id + ": solution doesn't build");
      const pf = SIM.preFire(k, c.solution, m);
      if (pf.length) throw new Error(c.id + ": " + pf[0].text);
      let best = 0, bestSlot = "";
      for (const slot of c.slot ? [c.slot] : Object.keys(SIM.SLOTS)) {
        let pass = 0;
        for (let i = 0; i < 8; i++) if (SIM.grade(c, SIM.fire(c.solution, { tGrain: SIM.SLOTS[slot].tGrain }, c.id + "/" + i)).pass) pass++;
        if (pass > best) { best = pass; bestSlot = slot; }
      }
      if (best < 7) throw new Error(`${c.id}: the solution passes only ${best}/8 at ${bestSlot}`);
      out.push(c.id + " " + best + "/8 " + bestSlot);
    }
    return out.length + " contracts";
  });
};
