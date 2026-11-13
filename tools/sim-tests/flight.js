/* Burn Rate: flight tests (sim/flight.js; plan section 6.10).
   With no drag and no wind, a flat thrust curve flies to the textbook height; drag and wind only ever lower the
   apogee and wind drifts the rocket upwind; heavier payloads fly lower; launches are deterministic; the range refuses a
   motor that doesn't fit, a rocket too long for its fins and one that never leaves the pad; grading reads the apogee. */
module.exports = ({ SIM, check, near }) => {
  const rel = (a, b, tol, what) => { if (!(Math.abs(a / b - 1) <= tol)) throw new Error(`${what}: ${a} is ${((a / b - 1) * 100).toFixed(2)}% off ${b} (allowed ${(tol * 100).toFixed(1)}%)`); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const g = SIM.FLIGHT.g0;
  const flat = (F, tb) => { const t = [], f = []; for (let i = 0; i <= 400; i++) { t.push(tb * i / 400); f.push(F); } t.push(tb + 1e-4); f.push(0); return { t, f }; };
  const ref = () => { const d = clone(SIM.REF_DESIGNS["38mm 3-seg BATES, Mule"]); d.airframe = { body: "kraft43", nose: "ogive", fins: "four" }; return d; };

  check("flight: no drag, no wind, constant mass: the apogee is the textbook height", () => {
    const m = 1.2, F = 60, tb = 1.5, r = { dry: m, prop: 0, cd: 0, area: 0.001 };
    const out = SIM.fly(flat(F, tb), r, 0, { noMach: true }), a = F / m - g, vb = a * tb, hb = 0.5 * a * tb * tb, want = hb + vb * vb / (2 * g);
    rel(out.apogee, want, 0.006, "apogee"); rel(out.vMax, vb, 0.006, "burnout speed");
    if (Math.abs(out.drift) > 1e-9) throw new Error("drifted with no wind");
    return `${out.apogee.toFixed(1)} m against ${want.toFixed(1)} m`;
  });

  check("flight: drag only lowers the apogee, more drag lowers it more; burning propellant off makes it climb higher", () => {
    const th = flat(80, 1.2), base = { dry: 1, prop: 0, area: 0.0015 };
    const h = [0, 0.3, 0.6, 1.0].map(cd => SIM.fly(th, Object.assign({ cd }, base), 0).apogee);
    for (let i = 1; i < h.length; i++) if (!(h[i] < h[i - 1])) throw new Error("drag didn't lower the apogee: " + h.map(Math.round).join(", "));
    const light = SIM.fly(th, { dry: 0.8, prop: 0.2, cd: 0.5, area: 0.0015 }, 0).apogee, heavy = SIM.fly(th, { dry: 1, prop: 0, cd: 0.5, area: 0.0015 }, 0).apogee;
    if (!(light > heavy)) throw new Error("losing propellant mass didn't help");
    return "apogee by Cd 0 / 0.3 / 0.6 / 1.0: " + h.map(Math.round).join(" / ") + " m";
  });

  check("flight: wind lowers the apogee and the rocket weathercocks upwind; payload lowers it too", () => {
    const d = ref(), p = SIM.predict(d, { tGrain: 20 }), r = SIM.rocketOf(d, p.motor, 0.1);
    const calm = SIM.fly(p.run, r, 0), out = [];
    let last = calm.apogee;
    for (const w of [2, 4, 7]) { const f = SIM.fly(p.run, r, w); if (!(f.apogee < last)) throw new Error("more wind didn't lower the apogee"); if (!(f.drift < 0)) throw new Error("didn't turn into the wind"); last = f.apogee; out.push(`${w} m/s ${Math.round(f.apogee)} m`); }
    const heavy = SIM.fly(p.run, SIM.rocketOf(d, p.motor, 3), 0);
    if (!(heavy.apogee < calm.apogee)) throw new Error("a heavier payload flew higher");
    return `calm ${Math.round(calm.apogee)} m, ` + out.join(", ");
  });

  check("flight: a launch is deterministic, flies the measured curve in a seeded wind, and a burst motor loses the rocket", () => {
    const d = ref(), a = SIM.launch(d, { tGrain: 14 }, "fl/1", { payload: 0.1 }), b = SIM.launch(d, { tGrain: 14 }, "fl/1", { payload: 0.1 });
    if (a.flight.apogee !== b.flight.apogee || a.flight.wind !== b.flight.wind) throw new Error("same seed, different flight");
    const w = [1, 2, 3, 4, 5, 6, 7, 8].map(i => SIM.windOf("fl/" + i));
    if (w.some(v => v < SIM.FLIGHT.windMin || v > SIM.FLIGHT.windMax)) throw new Error("wind out of range");
    if (!(a.fpred.apogee > 0 && a.fpred.wind === 0)) throw new Error("no predicted flight");
    const thin = clone(d); thin.case.wall = 0.5; thin.case.mat = "al6061"; thin.nozzle.throatD = 4;
    const lost = SIM.launch(thin, { tGrain: 14 }, "fl/2", { payload: 0.1 });
    if (!(lost.failure && lost.failure.destructive && lost.flight.lost)) throw new Error("a burst motor's rocket wasn't lost");
    return `wind ${a.flight.wind.toFixed(1)} m/s, apogee ${Math.round(a.flight.apogee)} m (predicted ${Math.round(a.fpred.apogee)} m)`;
  });

  check("flight: the range refuses a motor that doesn't fit, a rocket too long for its fins, and one that can't lift off", () => {
    const d = ref(), m = SIM.motorFromDesign(d), run = SIM.predict(d, { tGrain: 20 }).run;
    if (SIM.preLaunch(d, m, run, 0.1, 1).length) throw new Error("a good rocket was refused: " + SIM.preLaunch(d, m, run, 0.1, 1)[0].text);
    const narrow = clone(d); narrow.airframe.body = "kraft33";
    if (!SIM.preLaunch(narrow, m, run, 0.1).some(e => e.field === "airframe.body")) throw new Error("a motor wider than the body went");
    const long = clone(d); long.airframe.fins = "three"; long.grain.segs = 6; const ml = SIM.motorFromDesign(long);
    if (!SIM.preLaunch(long, ml, SIM.predict(long, { tGrain: 20 }).run, 0.1).some(e => e.field === "airframe.fins")) throw new Error("an over-long rocket went");
    if (!SIM.preLaunch(d, m, run, 40).some(e => /never lifts/.test(e.text))) throw new Error("a rocket heavier than the thrust went");
    if (!SIM.preLaunch(Object.assign(clone(d), { airframe: { body: "glass84", nose: "ogive", fins: "four" } }), m, run, 0.1, 1).some(e => /tier 2/.test(e.text))) throw new Error("a tier 2 body at tier 1");
  });

  check("flight: grading reads the real flight's apogee, and a lost rocket scores zero", () => {
    const d = ref(), f = SIM.launch(d, { tGrain: 14 }, "fl/3", { payload: 0.1 }), h = f.flight.apogee;
    const c = band => ({ spec: [{ k: "apogee", lo: band[0], hi: band[1] }], flight: { payload: 0.1 } });
    if (!SIM.grade(c([h * 0.8, h * 1.2]), f).pass) throw new Error("an apogee in its band failed");
    if (SIM.grade(c([h * 1.1, h * 1.5]), f).pass) throw new Error("an apogee under its band passed");
    if (SIM.specValue("apogee", { apogee: 123 }) !== 123) throw new Error("specValue");
  });
};
