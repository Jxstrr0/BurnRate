/* tools/sim-tests/physics.js: invariants of the stage 1 motor model (plan sections 6 and 11.5).
   Each check tests physics that must hold whatever the tuning numbers are, so a tuning change can't hide a bug:
   mass is conserved, impulse agrees with the thrust coefficient, the chamber sits on the quasi-steady pressure, the
   nozzle matches independently computed values, and pressure moves the right way when the design changes. */
module.exports = ({ SIM, check, near, brief }) => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const REFS = Object.entries(SIM.REF_DESIGNS);
  const runs = REFS.map(([k, d]) => [k, d, SIM.predict(d)]);

  check("every reference design is valid and fires", () => {
    for (const [k, , r] of runs) if (!r.ok) throw new Error(k + ": " + r.errors.map(e => e.text).join("; "));
    return runs.length + " motors";
  });

  check("mass: what leaves the nozzle = propellant + igniter + air in the chamber (0.5%)", () => {
    let worst = 0;
    for (const [k, , r] of runs) {
      const m = r.run.mass, mp = r.motor.mass.prop;
      const err = Math.abs(m.out - (m.burned + m.ign + m.gas0 - m.gasEnd)) / mp;
      const burnt = Math.abs(m.burned / mp - 1);
      if (err > 0.005) throw new Error(`${k}: balance off by ${(err * 100).toFixed(3)}%`);
      if (burnt > 0.005) throw new Error(`${k}: burned ${(m.burned / mp * 100).toFixed(2)}% of the propellant`);
      worst = Math.max(worst, err, burnt);
    }
    return "worst " + (worst * 100).toExponential(1) + "%";
  });

  check("grain: propellant volume equals the analytic cylinder sums", () => {
    const g = SIM.buildGrain({ shape: "bates", segs: 3, segLen: 0.06, coreD: 0.012, od: 0.035 });
    const want = 3 * Math.PI / 4 * (0.035 * 0.035 - 0.012 * 0.012) * 0.06;
    near(g.V(0), want, want * 1e-9, "V(0)");
    near(g.V(g.web), 0, 1e-12, "V(web)");
    // area is minus dV/dx
    const x = g.web * 0.4, h = 1e-7;
    near(g.A(x), -(g.V(x + h) - g.V(x - h)) / (2 * h), g.A(x) * 1e-4, "A vs dV/dx");
  });

  check("steady burn: thrust / mass flow = eta · C_F · c*", () => {
    for (const [k, , r] of runs) {
      const R = r.run, i = R.x.findIndex(x => x > R.web * 0.5);
      const ve = R.f[i] / R.mdot[i], want = r.motor.eta * R.cf[i] * r.motor.prop.cStar;
      near(ve, want, want * 0.01, k + " exhaust velocity");
    }
  });

  check("steady burn: chamber pressure = (Kn · a · rho · c*)^(1/(1-n)) (2%)", () => {
    for (const [k, , r] of runs) {
      const R = r.run, p = r.motor.prop, i = R.x.findIndex(x => x > R.web * 0.5);
      const want = Math.pow(R.kn[i] * R.a * p.rho * p.cStar, 1 / (1 - p.n));
      near(R.p[i], want, want * 0.02, k + " mid-burn pressure");
    }
  });

  check("impulse: total impulse / propellant mass sits inside the eta · C_F · c* range", () => {
    for (const [k, , r] of runs) {
      const R = r.run, s = r.sum, ve = s.I / R.mass.out;
      let lo = Infinity, hi = 0;
      for (let i = 1; i < R.t.length; i++) if (R.cf[i] > 0) { const v = r.motor.eta * R.cf[i] * r.motor.prop.cStar; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!(ve > lo * 0.98 && ve < hi * 1.001)) throw new Error(`${k}: ${ve.toFixed(0)} m/s outside ${lo.toFixed(0)}..${hi.toFixed(0)}`);
    }
  });

  check("nozzle: area ratio, exit Mach and C_F match independent values", () => {
    // gamma 1.4, M 2: A/A* = 1.6875 (standard isentropic tables)
    near(SIM.areaRatio(2, 1.4), 1.6875, 1e-4, "A/A* at M2");
    near(SIM.exitMach(1.6875, 1.4), 2, 1e-6, "exit Mach");
    // Newton's method on the area-Mach relation, a different route to the same exit Mach
    const g = 1.2, eps = 8; let M = 3;
    for (let i = 0; i < 50; i++) { const f = SIM.areaRatio(M, g) - eps, d = (SIM.areaRatio(M + 1e-6, g) - SIM.areaRatio(M - 1e-6, g)) / 2e-6; M -= f / d; }
    near(SIM.exitMach(eps, g), M, 1e-6, "exit Mach (Newton)");
    // C_F in vacuum from the closed form, and optimum expansion is the peak
    const pr = SIM.presRatio(M, g), pc = 5e6;
    const cfVac = Math.sqrt(2 * g * g / (g - 1) * Math.pow(2 / (g + 1), (g + 1) / (g - 1)) * (1 - Math.pow(pr, (g - 1) / g))) + pr * eps;
    near(SIM.cfIdeal(pr * pc, 0, pc, eps, g), cfVac, 1e-9, "vacuum C_F");
    const pa = pr * pc, opt = SIM.thrustCoef(pc, pa, eps, g, pr).cf;
    for (const e of [eps * 0.7, eps * 1.3]) { const p2 = SIM.presRatio(SIM.exitMach(e, g), g); if (SIM.thrustCoef(pc, pa, e, g, p2).cf >= opt) throw new Error("optimum expansion is not the peak"); }
    // the choked and unchoked branches meet at the critical pressure ratio
    const crit = Math.pow(2 / (g + 1), g / (g - 1)), a = SIM.thrustCoef(1e5 / crit * 0.9999, 1e5, 1, g, crit).cf, b = SIM.thrustCoef(1e5 / crit * 1.0001, 1e5, 1, g, crit).cf;
    near(a, b, 2e-3, "C_F across the critical ratio");
    near(SIM.chokedFrac(1e5 / crit * 0.9999, 1e5, g), 1, 1e-3, "flow across the critical ratio");
  });

  check("design moves: smaller throat / hotter grain / longer grain raise peak pressure", () => {
    const base = clone(SIM.REF_DESIGNS["38mm 3-seg BATES, Mule"]), P = d => SIM.predict(d).sum.Pmax, p0 = P(base);
    const small = clone(base); small.nozzle.throatD -= 0.5;
    const segs = clone(base); segs.grain.segs = 4;
    const hot = SIM.predict(base, { tGrain: 40 }).sum.Pmax, cold = SIM.predict(base, { tGrain: 0 }).sum.Pmax;
    if (!(P(small) > p0)) throw new Error("smaller throat did not raise pressure");
    if (!(P(segs) > p0)) throw new Error("more segments did not raise pressure");
    if (!(hot > p0 && p0 > cold)) throw new Error("temperature sensitivity runs the wrong way");
    const tbSmall = SIM.predict(small).sum.tb, tb0 = SIM.predict(base).sum.tb;
    if (!(tbSmall < tb0)) throw new Error("higher pressure did not shorten the burn");
  });

  check("exponent: a higher n moves pressure further from the reference pressure", () => {
    const d = clone(SIM.REF_DESIGNS["38mm 3-seg BATES, Mule"]), m = SIM.motorFromDesign(d), base = m.prop;
    const pAt = n => { m.prop = Object.assign({}, base, { n }); return SIM.summarize(m, SIM.simulate(m)).Pmax; };
    const lo = Math.abs(Math.log(pAt(0.25) / 5e6)), hi = Math.abs(Math.log(pAt(0.45) / 5e6));
    m.prop = base;
    if (!(hi > lo)) throw new Error(`|ln(P/Pref)| ${lo.toFixed(3)} -> ${hi.toFixed(3)}`);
  });

  check("tail-off: pressure only falls once the web is gone", () => {
    for (const [k, , r] of runs) {
      const R = r.run; let i = R.x.findIndex(x => x >= R.web);
      for (i++; i < R.p.length; i++) if (R.p[i] > R.p[i - 1] * (1 + 1e-9)) throw new Error(`${k}: rises at t=${R.t[i].toFixed(3)}`);
    }
  });

  check("throat erosion: a steel throat grows, an insert barely does", () => {
    const steel = runs.find(([k]) => /steel/.test(k))[2].sum.throatGrowth, insert = runs.find(([k]) => /98mm/.test(k))[2].sum.throatGrowth;
    if (!(steel > 0.005 && insert < steel / 3)) throw new Error(`steel ${steel}, insert ${insert}`);
    return `steel +${(steel * 100).toFixed(1)}%, insert +${(insert * 100).toFixed(2)}%`;
  });

  check("determinism: the same design fires the same, sample for sample", () => {
    const a = SIM.predict(SIM.DEFAULT_DESIGN).run, b = SIM.predict(SIM.DEFAULT_DESIGN).run;
    if (a.t.length !== b.t.length) throw new Error("lengths differ");
    for (let i = 0; i < a.t.length; i++) if (a.p[i] !== b.p[i] || a.f[i] !== b.f[i]) throw new Error("differs at " + i);
  });

  check("impulse classes: each letter doubles from A = 2.5 N·s", () => {
    const L = I => SIM.impulseClass(I).letter;
    if (L(2.5) !== "A" || L(2.51) !== "B" || L(160) !== "G" || L(161) !== "H" || L(5120) !== "L") throw new Error([2.5, 2.51, 160, 161, 5120].map(L).join(""));
  });

  check("design errors name the field to fix", () => {
    const d = clone(SIM.DEFAULT_DESIGN); d.grain.coreD = 40; d.nozzle.exitD = 3;
    const e = SIM.designErrors(d).map(x => x.field);
    if (!e.includes("grain.coreD") || !e.includes("nozzle.exitD")) throw new Error(JSON.stringify(e));
  });

  check("the reference motors are clean apart from the deliberate lessons", () => {
    const allowed = { "38mm tube, Swift 9 (progressive)": ["chuff", "pt", "sep"] };
    for (const [k, , r] of runs) {
      const bad = r.sum.warnings.filter(w => !(allowed[k] || []).includes(w.key));
      if (bad.length) throw new Error(k + ": " + bad.map(w => w.key).join(", "));
    }
  });

  if (brief) {
    console.log("\n  reference motors (predicted, 20 °C, sea level)");
    console.log("  " + "motor".padEnd(38) + "class    I N·s   Fav N  Fmax N  Pmax MPa  tb s   Isp s  Kn        sf    mass g");
    for (const [k, , r] of runs) {
      const s = r.sum;
      console.log("  " + k.padEnd(38) + s.designation.padEnd(7) + s.I.toFixed(1).padStart(8) + s.Fav.toFixed(0).padStart(8) + s.Fmax.toFixed(0).padStart(8) +
        (s.Pmax / 1e6).toFixed(2).padStart(10) + s.tb.toFixed(2).padStart(7) + s.Isp.toFixed(1).padStart(8) + ("  " + s.knMin.toFixed(0) + "-" + s.knMax.toFixed(0)).padEnd(10) +
        s.sf.toFixed(1).padStart(6) + (s.mass.total * 1000).toFixed(0).padStart(9));
    }
    console.log("");
  }
};
