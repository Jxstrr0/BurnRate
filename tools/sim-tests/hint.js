/* tools/sim-tests/hint.js: the bench's yardstick and the stuck hint (sim/hint.js, 1.7).
   The score must be the sum of its parts and 1e9 only for a motor that can't run; a hint must be honest (the move it names
   really makes the motor score better by the share HINT.gain asks), deterministic, and only ever name parts the player
   has. tools/balance-bot.js tunes with the same yardstick, so the bot's runs check it from the other side. */
module.exports = ({ SIM, check }) => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const start = c => { const d = SIM.normDesign(clone(typeof c.start === "string" ? SIM.REF_DESIGNS[c.start] : c.start));
    if (c.flight && !SIM.airframeOf(d)) d.airframe = SIM.defaultAirframe(SIM.motorFromDesign(d)); return d; };
  const H = SIM.HINT, tab = { "grain.prop": SIM.PROPELLANTS, "grain.shape": SIM.GRAIN_SHAPES, "case.mat": SIM.CASES, "nozzle.mat": SIM.THROATS,
    "case.liner": SIM.LINERS, igniter: SIM.IGNITERS, "airframe.nose": SIM.NOSES, "airframe.fins": SIM.FINS, "airframe.body": SIM.BODIES };
  /* apply a hint the way the player would (the move one step, or the part swapped in) */
  const apply = (c, d, h) => h.kind === "move" ? SIM.hintMove(d, h.f, H.moves.find(m => m[0] === h.f)[2], H.moves.find(m => m[0] === h.f)[1], h.dir) : null;

  check("hint: the score is the sum of its parts, biggest first, and 1e9 only for a motor that can't run", () => {
    let n = 0;
    for (const c of SIM.CONTRACTS) for (const d of [start(c), c.solution]) {
      const r = SIM.designScore(c, d, 20, H.steps); n++;
      if (!(r.s < 1e9)) throw new Error(c.id + ": a buildable motor scored 1e9");
      const sum = r.parts.reduce((a, p) => a + p.s, 0);
      if (Math.abs(sum - r.s) > 1e-9 * Math.max(1, r.s)) throw new Error(`${c.id}: parts add to ${sum}, score ${r.s}`);
      for (let i = 1; i < r.parts.length; i++) if (r.parts[i].s > r.parts[i - 1].s) throw new Error(c.id + ": parts not biggest first");
    }
    const c = SIM.CONTRACTS[0], bad = clone(c.solution); bad.nozzle.throatD = bad.grain.coreD + 5;
    if (SIM.designScore(c, bad, 20, H.steps).s !== 1e9) throw new Error("a throat wider than the core still scored");
    if (SIM.hint(c, bad, { tGrain: 20, tier: 1 }).kind !== "broken") throw new Error("a broken motor got a hint");
    return n + " designs";
  });
  check("hint: every job's starting motor gets an honest hint, and the named move really helps", () => {
    const kinds = {};
    for (const c of SIM.CONTRACTS) {
      const d = start(c), h = SIM.hint(c, d, { tGrain: 20, tier: c.tier });
      kinds[h.kind] = (kinds[h.kind] || 0) + 1;
      if (h.kind === "broken") throw new Error(c.id + ": the starting motor is broken");
      if (h.kind === "sound" || h.kind === "stuck") continue;
      if (!(h.to < h.from * (1 - H.gain))) throw new Error(`${c.id}: the hint only goes ${h.from} -> ${h.to}`);
      if (!h.issue || !h.issue.kind) throw new Error(c.id + ": a hint with no issue");
      const t = h.kind === "move" ? apply(c, d, h) : (() => { const x = clone(d); const p = h.f.split("."), l = p.pop(); p.reduce((o, k) => o[k], x)[l] = h.v; return SIM.normDesign(x); })();
      if (h.f !== "grain.shape" && h.f !== "case.closure") {
        const s = SIM.designScore(c, t, 20, H.steps).s;
        if (Math.abs(s - h.to) > 1e-9 * Math.max(1, s)) throw new Error(`${c.id}: the hint promised ${h.to}, the move gives ${s}`);
      }
    }
    return Object.entries(kinds).map(([k, v]) => k + " " + v).join(", ");
  });
  check("hint: deterministic, and never names a part from a tier the player hasn't opened", () => {
    for (const c of SIM.CONTRACTS.filter((c, i) => c.tier >= 2 && i % 3 === 0)) {
      const d = start(c), a = SIM.hint(c, d, { tGrain: -6, tier: 1 }), b = SIM.hint(c, d, { tGrain: -6, tier: 1 });
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(c.id + ": two hints for the same motor differ");
      if ((a.kind === "pick" || a.kind === "part") && (tab[a.f][a.v].tier || 1) > 1) throw new Error(`${c.id}: a tier ${tab[a.f][a.v].tier} ${a.f} named for a tier 1 player`);
    }
  });
};
