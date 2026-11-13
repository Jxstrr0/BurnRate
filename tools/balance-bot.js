#!/usr/bin/env node
/* Burn Rate: the headless balance bot (plan section 12, stage 8).
 *
 *   node tools/balance-bot.js           every contract; exit 1 if the bot can't deliver one
 *   node tools/balance-bot.js kumtal    only the contracts whose id contains "kumtal"
 *
 * The contract tests (tools/sim-tests/fire.js) already prove each job has a hand-made solution that uses only parts of
 * its tier. This bot asks the harder question: can a player get there from the job's starting drawing? It plays like a
 * player who has picked the right parts and only has the bench's numbers to work with:
 *   1. it takes the job's start design and swaps in the solution's PARTS (grade, grain shape, case material, liner,
 *      throat material, closure, rocket parts), but none of the solution's numbers;
 *   2. it tunes the numbers with the predictor only (no firing), by small moves a player makes: one slider at a time,
 *      plus a few moves made together (the exit follows the throat; the core follows the grain's outside; scale the
 *      whole motor; split or merge segments at the same length; grow the core and the throat together). It aims for the
 *      middle of each spec band, clears every red flag, and keeps a margin under every rating;
 *   3. it fires the result three times at the slot it tuned for: the job's own slot, or for a free job noon first, then
     dawn and dusk if noon doesn't deliver (a long burn wants cold grain).
 * A job passes if the bot's motor raises no red flag, the stand (or range) accepts it, and it passes at least 2 of 3.
 * Nothing here is part of the game: the sim block is cut out of the built index.html, as tools/sim-test.js does. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function loadSim() {
  const h = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), i = h.indexOf("Burn Rate: motor sim core");
  if (i < 0) throw new Error("BURN_SIM block not found in index.html; run node build.js");
  const src = h.slice(h.lastIndexOf("<script>", i) + 8, h.indexOf("</script>", i));
  const mod = { exports: {} };
  vm.runInNewContext(src, { module: mod, console }, { filename: "burn-sim.js" });
  return mod.exports;
}
const S = loadSim();
const clone = o => JSON.parse(JSON.stringify(o)), r1 = v => Math.round(v * 10) / 10;
const get = (d, f) => f.split(".").reduce((o, k) => o && o[k], d);
const set = (d, f, v) => { const p = f.split("."), l = p.pop(); p.reduce((o, k) => o[k], d)[l] = v; };
const PARTS = ["grain.prop", "grain.shape", "case.mat", "case.liner", "case.closure", "nozzle.mat", "igniter", "airframe"];
const BOT = { rounds: 36, restartAt: 18, steps: 110, firings: 3, need: 2, warnW: 0.5, critW: 10, margin: 0.85 };

/* how far a design is from a clean delivery, by the predictor alone: 0 is in the middle of the spec with no flags */
function score(c, d, tGrain, steps) {
  let p; try { p = S.predict(d, { tGrain }, steps ? { steps } : undefined); } catch (e) { return { s: 1e9 }; }
  if (!p.ok) return { s: 1e9 };
  const q = p.sum, m = p.motor, T = S.TUNING;
  /* how far over its line each flag is, so a step towards the line counts as progress */
  const over = { liner: q.tb / m.linerRating, burst: q.Pmax / m.pUlt, yield: 1 / q.sf, closure: 1 / q.closureSf, pt: T.ptWarn / q.pt0,
    chuff: m.prop.pMin * 1e6 / q.pLow, sep: 0.9 + (d.nozzle.exitD / d.nozzle.throatD) ** 2 / 20 };
  let s = 0;
  for (const w of q.warnings) s += (w.sev === "crit" ? BOT.critW : BOT.warnW) * (1 + Math.max(0, (over[w.key] || 1) - 0.9) * 10);
  /* a careful player keeps a margin under every rating, flagged or not: real motors scatter round the prediction */
  for (const key of ["liner", "burst", "yield", "closure", "chuff"]) { const o = over[key]; if (o > BOT.margin && isFinite(o)) s += 20 * (o - BOT.margin) ** 2; }
  const k = Object.assign({}, c, { stand: S.STANDS[c.stand] }), refused = S.preFire(k, d, p.motor, { tier: c.tier, sum: q });
  s += refused.length * 20;
  let sum = q;
  if (c.flight) {
    const fp = S.predictFlight(d, p.motor, p.run, c.flight.payload); if (!fp) return { s: 1e9 };
    sum = Object.assign({}, q, { apogee: fp.apogee });
    s += S.preLaunch(d, p.motor, p.run, c.flight.payload, c.tier).length * 20;
  }
  for (const ck of S.specCheck(c.spec, sum, p.motor)) {
    const { lo, hi, v } = ck;
    if (lo != null && hi != null) { const e = Math.abs(v - (lo + hi) / 2) / ((hi - lo) / 2); s += Math.max(0, e - 0.4) ** 2 * 4; }
    else if (hi != null) { const e = (v - hi * 0.97) / hi; if (e > 0) s += (e * 10) ** 2; }
    else { const e = (lo * 1.03 - v) / lo; if (e > 0) s += (e * 10) ** 2; }
  }
  return { s, p, refused };
}
/* the start design with the solution's parts swapped in (and, for a new grain shape, that shape's own features) */
function startWithParts(c) {
  const st = typeof c.start === "string" ? S.REF_DESIGNS[c.start] : c.start, d = clone(st);
  for (const f of PARTS) {
    const v = get(c.solution, f);
    if (v === undefined || JSON.stringify(v) === JSON.stringify(get(d, f))) continue;
    if (f === "grain.shape") d.grain = Object.assign({}, clone(c.solution.grain), { segs: d.grain.segs, segLen: d.grain.segLen, prop: d.grain.prop });
    if (f === "airframe") d.airframe = clone(v); else set(d, f, v);
  }
  return S.normDesign(d);
}
/* a player's moves: [field or move name, first step, kind]. x: multiply; +: add; i: whole numbers; m: a move made together */
const MOVES = [["nozzle.throatD", 1.08, "x"], ["grain.segLen", 1.12, "x"], ["grain.coreD", 1.06, "x"], ["nozzle.exitD", 1.08, "x"],
  ["case.id", 1.06, "xi"], ["case.wall", 0.3, "+"], ["grain.segs", 1, "i"], ["case.linerThk", 0.5, "+"], ["case.bolts", 2, "i"],
  ["size", 1.06, "m"], ["segsKeep", 1, "m"], ["coreThroat", 1.06, "m"]];
function move(d, f, kind, step, dir) {
  const t = clone(d);
  if (kind === "m") {
    const k = dir > 0 ? step : 1 / step;
    if (f === "size") { t.case.id = Math.round(t.case.id * k); t.nozzle.throatD = r1(t.nozzle.throatD * k); t.nozzle.exitD = r1(t.nozzle.exitD * k); if (t.grain.coreD) t.grain.coreD = r1(t.grain.coreD * k); t.grain.segLen = r1(t.grain.segLen * k); }
    else if (f === "segsKeep") { const ns = t.grain.segs + dir; if (ns < 1 || t.grain.shape === "end") return null; t.grain.segLen = r1(t.grain.segLen * t.grain.segs / ns); t.grain.segs = ns; }
    else { if (!t.grain.coreD) return null; t.grain.coreD = r1(t.grain.coreD * k); t.nozzle.throatD = r1(t.nozzle.throatD * k); t.nozzle.exitD = r1(t.nozzle.exitD * k); }
    return t;
  }
  const v = get(d, f);
  let nv = kind[0] === "x" ? v * (dir > 0 ? step : 1 / step) : v + dir * step;
  nv = kind === "xi" || kind === "i" ? Math.round(nv) : r1(nv);
  if (nv === v || nv <= 0) return null;
  set(t, f, nv);
  /* moves a player makes together: the exit follows the throat (same expansion), the core follows the grain's outside */
  if (f === "nozzle.throatD") t.nozzle.exitD = r1(d.nozzle.exitD * nv / v);
  if ((f === "case.id" || f === "case.linerThk") && t.grain.coreD) { const o0 = d.case.id - 2 * d.case.linerThk, o1 = t.case.id - 2 * t.case.linerThk; t.grain.coreD = r1(d.grain.coreD * o1 / o0); }
  return t;
}
/* tune at one slot's grain temperature, then fire the result at that slot */
function solveAt(c, slot) {
  const tGrain = S.slotTemp(slot, c, null);
  let d = startWithParts(c);
  const moves = MOVES.filter(([f, , kind]) => kind === "m" || get(d, f) != null);
  let cur = score(c, d, tGrain, BOT.steps), evals = 0, steps = moves.map(x => x[1]);
  /* pattern search: each round tries every move and keeps each one that helps; a round with none halves the steps; one
     restart with the big steps */
  for (let round = 0; round < BOT.rounds && cur.s > 0; round++) {
    if (round === BOT.restartAt) steps = moves.map(x => x[1]);
    let better = false;
    for (let i = 0; i < moves.length; i++) for (const dir of [1, -1]) {
      const t = move(d, moves[i][0], moves[i][2], steps[i], dir); if (!t) continue;
      const r = score(c, t, tGrain, BOT.steps); evals++;
      if (r.s < cur.s - 1e-9) { d = t; cur = r; better = true; break; }
    }
    if (!better) moves.forEach(([f, s0, kind], i) => { if (kind === "+") steps[i] /= 2; else if (s0 > 1 && f !== "segsKeep" && kind !== "i") steps[i] = 1 + (steps[i] - 1) / 2; });
  }
  if (cur.s > 0) for (const ig of Object.keys(S.IGNITERS)) { const t = clone(d); t.igniter = ig; const r = score(c, t, tGrain, BOT.steps); evals++; if (r.s < cur.s) { d = t; cur = r; } }
  const full = score(c, d, tGrain);
  const cond = { tGrain };
  let pass = 0, marks = "";
  for (let k = 1; k <= BOT.firings; k++) {
    const seed = "bot/" + c.id + "/" + slot + "/" + k;
    const g = c.lot ? S.gradeLot(c, S.fireLot(d, cond, seed)) : S.grade(c, c.flight ? S.launch(d, cond, seed, { payload: c.flight.payload }) : S.fire(d, cond, seed));
    if (g.pass) pass++; marks += g.pass ? g.letter : "x";
  }
  const flags = full.p ? full.p.sum.warnings : [];
  return { design: d, evals, best: { slot, pass, marks }, crit: flags.filter(w => w.sev === "crit").map(w => w.key), warn: flags.filter(w => w.sev !== "crit").map(w => w.key), refused: full.refused || [] };
}
/* a job with a set slot is tuned there; a free one at noon first, and if that doesn't deliver, at dawn and dusk too */
const delivers = r => !r.crit.length && !r.refused.length && r.best.pass >= BOT.need;
function solve(c) {
  if (c.slot) return solveAt(c, c.slot);
  let best = solveAt(c, "noon"), evals = best.evals;
  for (const slot of ["dawn", "dusk"]) {
    if (delivers(best)) break;
    const r = solveAt(c, slot); evals += r.evals;
    if (delivers(r) || r.best.pass > best.best.pass) best = r;
  }
  best.evals = evals; return best;
}

const only = process.argv[2];
let fails = 0, n = 0;
const t0 = Date.now();
for (const c of S.CONTRACTS) {
  if (only && !c.id.includes(only)) continue;
  n++;
  const t1 = Date.now(), r = solve(c), why = [];
  if (r.crit.length) why.push("red flags: " + r.crit.join(", "));
  if (r.refused.length) why.push("refused: " + r.refused[0].text);
  if (r.best.pass < BOT.need) why.push(`passed ${r.best.pass} of ${BOT.firings}`);
  if (why.length) fails++;
  const kind = c.flight ? "flight" : c.lot ? "lot" : "static";
  console.log(`${why.length ? "FAIL" : "ok  "} tier ${c.tier} ${c.id.padEnd(15)} ${kind.padEnd(6)} ${String(r.evals).padStart(4)} tries  ${r.best.slot.padEnd(5)} ${r.best.marks}` +
    `${r.warn.length ? "  (warnings: " + r.warn.join(", ") + ")" : ""}  ${((Date.now() - t1) / 1000).toFixed(1)} s${why.length ? "  " + why.join("; ") : ""}`);
}
console.log(`\n${n - fails}/${n} contracts delivered by the bot from their start designs (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(fails ? 1 : 0);
