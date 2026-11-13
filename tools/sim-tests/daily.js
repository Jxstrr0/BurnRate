/* tools/sim-tests/daily.js: the Daily Spec (stage 8, sim/daily.js).
   The same date must give the same order on every phone, every day must be solvable with that day's kit, and the hidden
   reference motor must pass its own spec when it is really fired, nearly always. */
module.exports = ({ SIM, check }) => {
  const pad = n => String(n).padStart(2, "0");
  const dateAt = k => { const d = new Date(Date.UTC(2026, 10, 13 + k)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

  check("daily: numbering runs from the epoch through month and year ends", () => {
    const want = [["2026-11-13", 1], ["2026-11-30", 18], ["2026-12-01", 19], ["2027-01-01", 50], ["2028-02-29", 474], ["2028-03-01", 475]];
    for (const [d, n] of want) if (SIM.dailyNo(d) !== n) throw new Error(`${d} is No. ${SIM.dailyNo(d)}, want ${n}`);
  });

  check("daily: the same date builds the same order; the next date a different one", () => {
    const a = SIM.dailySpec("2026-12-05"), b = SIM.dailySpec("2026-12-05"), c = SIM.dailySpec("2026-12-06");
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("two builds of one date differ");
    if (JSON.stringify(a.spec) === JSON.stringify(c.spec)) throw new Error("two dates gave the same spec");
  });

  check("daily: 60 days all build, with tier 1-2 kits, a reference inside its own kit that fits Stand 3", () => {
    for (let k = 0; k < 60; k++) {
      const date = dateAt(k), c = SIM.dailySpec(date);
      if (!c) throw new Error(`${date}: no reference motor came out clean`);
      if (!c.kit.shapes.includes("bates") || c.kit.props.length !== SIM.DAILY.kit.nProps || c.kit.cases.length !== SIM.DAILY.kit.nCases) throw new Error(`${date}: kit shape`);
      const tabs = { props: SIM.PROPELLANTS, shapes: SIM.GRAIN_SHAPES, cases: SIM.CASES, liners: SIM.LINERS, throats: SIM.THROATS };
      for (const k2 in tabs) for (const id of c.kit[k2]) if (!tabs[k2][id] || (tabs[k2][id].tier || 1) > 2) throw new Error(`${date}: kit part ${id}`);
      const bad = SIM.kitCheck(c.kit, c.solution).concat(SIM.kitCheck(c.kit, c.start));
      if (bad.length) throw new Error(`${date}: ${bad[0].text}`);
      const p = SIM.predict(c.solution, { tGrain: SIM.SLOTS[c.slot].tGrain });
      if (!p.ok || p.sum.warnings.length) throw new Error(`${date}: reference warns`);
      const pf = SIM.preFire(Object.assign({}, c, { stand: SIM.STANDS[c.stand] }), c.solution, p.motor, { sum: p.sum, tier: 2 });
      if (pf.length) throw new Error(`${date}: ${pf[0].text}`);
      for (const s of SIM.specCheck(c.spec, p.sum, p.motor)) if (!s.ok) throw new Error(`${date}: the reference's prediction misses ${s.k}`);
    }
  });

  check("daily: the reference fired for real passes its own spec at least 85% of the time (20 days x 3 firings)", () => {
    let pass = 0, n = 0;
    for (let k = 0; k < 20; k++) {
      const date = dateAt(k * 3), c = SIM.dailySpec(date);
      for (let s = 1; s <= 3; s++) { const g = SIM.grade(c, SIM.fire(c.solution, { tGrain: SIM.SLOTS[c.slot].tGrain }, `daily/${date}/${s}`)); n++; if (g.pass) pass++; }
    }
    if (pass / n < 0.85) throw new Error(`only ${pass} of ${n} passed`);
  });

  check("daily: kitCheck names each part outside the kit, with the field to change", () => {
    const c = SIM.dailySpec("2026-11-20"), d = JSON.parse(JSON.stringify(c.start));
    const prop = Object.keys(SIM.PROPELLANTS).find(p => !c.kit.props.includes(p)), mat = Object.keys(SIM.CASES).find(m => !c.kit.cases.includes(m));
    d.grain.prop = prop; d.case.mat = mat;
    const f = SIM.kitCheck(c.kit, d).map(x => x.field).sort().join(",");
    if (f !== "case.mat,grain.prop") throw new Error("got " + f);
    if (SIM.inKit(c.kit, "grain.prop", prop) || !SIM.inKit(c.kit, "grain.prop", c.kit.props[0]) || !SIM.inKit(c.kit, "igniter", "xl")) throw new Error("inKit");
  });
};
