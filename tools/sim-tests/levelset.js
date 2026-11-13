/* Burn Rate: level-set grains and erosive burning (sim/levelset.js, sim/ballistics.js; plan sections 6.2, 6.5, 11.5).
   A round core drawn on the grid matches the analytic tube; every new shape conserves mass and burns all its propellant;
   tables are deterministic; star points start big and fall away; erosive burning grows as the port narrows, is off in a
   wide port, and the design checks catch points that reach the case. */
module.exports = ({ SIM, check, near }) => {
  const rel = (a, b, tol, what) => { if (!(Math.abs(a / b - 1) <= tol)) throw new Error(`${what}: ${a} is ${((a / b - 1) * 100).toFixed(2)}% off ${b} (allowed ${(tol * 100).toFixed(1)}%)`); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const base = () => {
    const d = clone(SIM.REF_DESIGNS["54mm 4-seg BATES, Dray, steel throat"]);
    Object.assign(d.grain, { prop: "tr2", segs: 2, segLen: 80, coreD: 16, pts: 6, ptLen: 8, ptW: 4, finLen: 50, offset: 6 });
    d.nozzle.throatD = 11; d.nozzle.exitD = 24; d.case.wall = 3; return d;
  };
  const shaped = (shape, more) => { const d = base(); d.grain.shape = shape; if (shape === "finocyl") { d.grain.segs = 1; d.grain.segLen = 200; d.grain.finLen = 70; } Object.assign(d.grain, more || {}); return d; };

  check("level set: a round core on the grid matches the analytic tube (area, volume, port, web)", () => {
    const R = 0.0235, rc = 0.008, L = 0.1, tab = SIM.lsTable({ shape: "core", R, rc });
    const a = SIM.coreSeg(R, rc, L, false), b = SIM.lsSeg(R, [{ tab, L }], "core");
    rel(b.web, a.web, 0.02, "web");
    let worstA = 0, worstV = 0;
    for (let f = 0.05; f <= 0.9; f += 0.05) {
      const x = f * a.web;
      worstA = Math.max(worstA, Math.abs(b.A(x) / a.A(x) - 1));
      if (f <= 0.8) worstV = Math.max(worstV, Math.abs(b.V(x) / a.V(x) - 1));
      rel(b.port(x), a.port(x), 0.02, "port at " + f.toFixed(2));
    }
    rel(b.V(0), a.V(0), 0.01, "volume at the start");
    rel(b.A(0), a.A(0), 0.05, "area at the start");
    if (worstA > 0.03) throw new Error(`area off by ${(worstA * 100).toFixed(1)}%`);
    if (worstV > 0.015) throw new Error(`volume off by ${(worstV * 100).toFixed(1)}%`);
    return `area within ${(worstA * 100).toFixed(1)}%, volume within ${(worstV * 100).toFixed(1)}%`;
  });

  check("level set: every new shape conserves mass and burns all its propellant", () => {
    const out = [];
    for (const shape of ["star", "slots", "finocyl", "moon"]) {
      const p = SIM.predict(shaped(shape), { tGrain: 20 });
      if (!p.ok) throw new Error(shape + ": " + p.errors.map(e => e.text).join(" "));
      const M = p.run.mass, inn = M.burned + M.ign + M.gas0 - M.gasEnd;
      rel(M.out, inn, 0.005, shape + " mass out vs in");
      rel(M.burned, p.motor.mass.prop, 0.01, shape + " burned vs loaded");
      if (!(p.sum.I > 0 && p.sum.tb > 0)) throw new Error(shape + " made no impulse");
      out.push(`${shape} ${p.sum.designation}`);
    }
    return out.join(", ");
  });

  check("level set: tables are deterministic, and a fresh one equals the remembered one", () => {
    const p = { shape: "star", R: 0.02, rc: 0.006, pts: 7, ptLen: 0.007, ptW: 0.003, offset: 0 };
    const a = SIM.lsTable(p), b = SIM.lsTable(Object.assign({}, p));
    if (a !== b) throw new Error("the memo missed an identical key");
    const c = SIM.lsTable(Object.assign({}, p, { ptLen: 0.007000001 }));
    for (const x of [0, 0.002, 0.005, 0.009]) rel(c.area(x), a.area(x), 0.002, "a hair-different table at " + x);
    for (let q = 0; q < a.s.length; q += 997) { const u = a.s[q], v = c.s[q]; if (!(u === v || (u !== u && v !== v) || Math.abs(u - v) < 1e-7)) throw new Error("distance maps differ at " + q); }
  });

  check("level set: a deep star is regressive, and its area falls once the points burn out", () => {
    const d = shaped("star", { ptLen: 12, pts: 8 }), p = SIM.predict(d, { tGrain: 20 }), G = p.motor.grain;
    if (!(p.sum.prog < 0.85)) throw new Error("star curve shape " + p.sum.prog.toFixed(2) + ", expected regressive");
    if (!(G.A(0) > G.A(0.6 * G.web))) throw new Error("the star's area didn't fall");
    const t = SIM.predict(shaped("slots", { ptLen: 3, pts: 2, ptW: 2 }), { tGrain: 20 });
    return `star 8x12 mm: shape ${p.sum.prog.toFixed(2)}; shallow 2-slot: ${t.sum.prog.toFixed(2)}`;
  });

  check("level set: points or an offset that reach the case are refused, and shape tiers gate the stand", () => {
    const e = SIM.designErrors(shaped("star", { ptLen: 30 }));
    if (!e.some(x => x.field === "grain.ptLen")) throw new Error("points past the case weren't refused");
    const m = SIM.designErrors(shaped("moon", { offset: 30 }));
    if (!m.some(x => x.field === "grain.offset")) throw new Error("a core past the wall wasn't refused");
    const c = { stand: SIM.STANDS.s2, tier: 1 }, d = shaped("finocyl");
    const pf = SIM.preFire(c, d, SIM.motorFromDesign(d), { tier: 2 });
    if (!pf.some(x => x.field === "grain.shape")) throw new Error("a tier 3 shape went on a tier 2 stand");
    if (SIM.designErrors(SIM.normDesign({ grain: { prop: "tr2", shape: "bates", segs: 2, segLen: 40, coreD: 10 }, case: clone(base().case), nozzle: { mat: "graphite", throatD: 6, exitD: 12, half: 15 }, igniter: "s" })).length) throw new Error("an older design without the new fields didn't build");
  });

  check("erosive: off in a wide port, grows as the port narrows, and raises the start pressure", () => {
    const wide = SIM.predict(SIM.REF_DESIGNS["98mm 5-seg BATES, Ox, composite"], { tGrain: 20 });
    if (wide.run.eroPeak !== 1) throw new Error("erosive burning in a wide port: " + wide.run.eroPeak);
    const d = clone(SIM.REF_DESIGNS["54mm 4-seg BATES, Dray, steel throat"]); d.grain.prop = "swift9"; d.case.wall = 4;
    const gains = [];
    for (const core of [24, 20, 17, 16]) {
      d.grain.coreD = core; d.nozzle.throatD = 13;
      const p = SIM.predict(d, { tGrain: 20 }), q = SIM.predict(d, { tGrain: 20 }, { noErosive: true });
      if (p.sum.Pmax < q.sum.Pmax * 0.999) throw new Error("erosive burning lowered the peak at core " + core);
      gains.push(p.run.eroPeak);
    }
    for (let i = 1; i < gains.length; i++) if (gains[i] < gains[i - 1] - 1e-9) throw new Error("erosive gain fell as the port narrowed: " + gains.join(", "));
    if (!(gains[gains.length - 1] > 1.05)) throw new Error("no erosive spike in a narrow port: " + gains.join(", "));
    if (gains.some(g => g > SIM.TUNING.eroMax + 1e-9)) throw new Error("erosive gain past its cap");
    return "gain by core 24/20/17/16 mm: " + gains.map(g => g.toFixed(3)).join(" / ");
  });
};
