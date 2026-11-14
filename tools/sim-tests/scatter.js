/* tools/sim-tests/scatter.js: 1.4's "why it differed" (sim/explain.js) and the scatter predictor (sim/scatter.js).
   The explanation must add up exactly to what the stand measured and name the right causes; the scatter must use a
   real firing's rules (same dice, same failures) and stay deterministic, and its coarser time step must not change the
   physics: the same failures and numbers within half a percent of a full firing. */
module.exports = ({ SIM, check, near }) => {
  const D = SIM.DEFAULT_DESIGN, REF = SIM.REF_DESIGNS;
  const sumUp = e => e.steps.reduce((a, s) => a.map((v, i) => v + s.d[i]), e.bench);

  check("explain: the steps add up exactly to measured minus the bench's 20 °C prediction", () => {
    let n = 0;
    for (const d of Object.values(REF)) for (const tg of [-6, 31]) for (const seed of ["e1", "e2", "e3"]) {
      const f = SIM.fire(d, { tGrain: tg }, seed), e = SIM.explainFiring(f, ["I", "Pmax", "tb"]);
      if (!e) continue; n++;
      sumUp(e).forEach((v, i) => near(v, e.meas[i], 1e-9 * Math.max(1, Math.abs(e.meas[i])), "sum of steps"));
      e.bench.forEach((v, i) => near(v, SIM.specValue(e.keys[i], f.pred20, f.motor), 1e-12, "bench value"));
    }
    if (n < 20) throw new Error("only " + n + " firings explained");
    return n + " firings";
  });

  check("explain: at 20 °C the temperature step is zero; a cold grain lowers pressure, a hot one raises it", () => {
    const f20 = SIM.fire(D, { tGrain: 20 }, "t"), e20 = SIM.explainFiring(f20, ["Pmax"]);
    near(e20.steps[0].d[0], 0, 1e-12, "temperature step at 20 °C");
    const fc = SIM.fire(D, { tGrain: -6 }, "t"), fh = SIM.fire(D, { tGrain: 31 }, "t");
    if (!(SIM.explainFiring(fc, ["Pmax"]).steps[0].d[0] < 0)) throw new Error("cold grain didn't lower peak pressure");
    if (!(SIM.explainFiring(fh, ["Pmax"]).steps[0].d[0] > 0)) throw new Error("hot grain didn't raise peak pressure");
  });

  check("explain: a fast batch raises pressure, a slow one lowers it; a defect step only when there was a void or crack", () => {
    let fast = 0, slow = 0, def = 0;
    for (let i = 0; i < 30; i++) {
      const f = SIM.fire(REF["98mm 5-seg BATES, Ox, composite"], { tGrain: 20 }, "b" + i), e = SIM.explainFiring(f, ["Pmax"]);
      if (!e) continue;
      const b = e.steps.find(s => s.key === "batch").d[0], hasDef = e.steps.some(s => s.key === "defect");
      if (f.draws.aMul > 1.005 && b <= 0 || f.draws.aMul < 0.995 && b >= 0) throw new Error("batch step has the wrong sign (aMul " + f.draws.aMul + ")");
      if (f.draws.aMul > 1) fast++; else slow++;
      if (hasDef !== !!(f.draws.void || f.draws.crack)) throw new Error("defect step without a defect, or the other way round");
      if (hasDef) def++;
    }
    if (!fast || !slow) throw new Error("the seeds never drew both a fast and a slow batch");
    return `${fast} fast, ${slow} slow, ${def} with a defect`;
  });

  check("explain: nothing for a destructive failure or a hang fire", () => {
    const thin = JSON.parse(JSON.stringify(D)); thin.case.wall = 0.4; thin.nozzle.throatD = 3;
    const f = SIM.fire(thin, { tGrain: 31 }, "x");
    if (!f.failure || !f.failure.destructive) throw new Error("the test motor didn't fail destructively: " + JSON.stringify(f.failure && f.failure.key));
    if (SIM.explainFiring(f, ["Pmax"]) !== null) throw new Error("explained a destructive failure");
  });

  check("scatter: virtual motor i is the same motor as a real firing with seed scatter/i (same dice, same failure)", () => {
    let n = 0;
    for (const d of Object.values(REF)) for (const tg of [-6, 31]) {
      const P = SIM.scatterPrep(d, { tGrain: tg });
      for (let i = 1; i <= 8; i++) {
        const s = SIM.scatterOne(P, i), f = SIM.fire(d, { tGrain: tg }, "scatter/" + i), fk = f.failure ? f.failure.key : null; n++;
        if (s.key !== fk) throw new Error(`motor ${i} at ${tg} °C: scatter says ${s.key}, the firing says ${fk}`);
        if (s.yielded !== f.yielded) throw new Error("yield differs");
        if (s.sum && !f.failure) for (const k of ["I", "Pmax", "tb"]) near(s.sum[k] / f.meas.sum[k], 1, 0.005, k + " (coarse step against full)");
      }
    }
    return n + " motors";
  });

  check("scatter: deterministic; the band holds the lo-hi share of the motors that ran, and a tender's odds are sane", () => {
    const P = SIM.scatterPrep(D, { tGrain: 31 }), a = [], b = [];
    for (let i = 1; i <= 12; i++) { a.push(SIM.scatterOne(P, i)); b.push(SIM.scatterOne(SIM.scatterPrep(D, { tGrain: 31 }), i)); }
    if (JSON.stringify(a.map(s => [s.key, s.sum && s.sum.Pmax])) !== JSON.stringify(b.map(s => [s.key, s.sum && s.sum.Pmax]))) throw new Error("two scatters differ");
    const B = SIM.scatterBand(a);
    for (let j = 0; j < B.t.length; j++) if (B.pLo[j] > B.pHi[j] + 1e-9 || B.fLo[j] > B.fHi[j] + 1e-9) throw new Error("band upside down at " + j);
    const ran = a.filter(s => s.tr), peaks = ran.map(s => s.sum.Pmax).sort((x, y) => x - y), bandPk = Math.max(...B.pHi);
    if (!(bandPk <= peaks[peaks.length - 1] * 1.001 && bandPk >= peaks[0] * 0.95)) throw new Error("band peak outside the motors' peaks");
    near(SIM.lotOdds(1, 5, 4), 1, 1e-12, "all pass"); near(SIM.lotOdds(0, 5, 4), 0, 1e-12, "none pass");
    near(SIM.lotOdds(0.9, 5, 4), Math.pow(0.9, 5) + 5 * Math.pow(0.9, 4) * 0.1, 1e-12, "binomial");
    if (SIM.scatterPrep({ grain: {}, case: {}, nozzle: {}, igniter: "x" }, {}) !== null) throw new Error("built an unbuildable design");
  });
};
