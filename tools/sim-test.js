#!/usr/bin/env node
// Adapted from Escapement tools/sim-test.js (12 November 2026).
/* Burn Rate: the sim correctness tests (plan section 11.5).
 *
 *   node tools/sim-test.js            run every check, one line each; exit 1 if any fail
 *   node tools/sim-test.js --brief    also print the reference motors' numbers (paste before/after into commit messages)
 *
 * It cuts the BURN_SIM <script> block out of the built index.html (run `node build.js` first), so it tests exactly what
 * ships, and it scans src/sim/ and src/data/ for banned calls (Math.random, Date.now, performance.now, the DOM, three.js,
 * localStorage). The physics checks test invariants, not snapshots: mass conservation, impulse consistency, monotonicity,
 * analytic vs level-set geometry, C_F against independent values, determinism. Zero dependencies. */
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
const SIM = loadSim();
const args = process.argv.slice(2), brief = args.includes("--brief");
let fails = 0, n = 0;
function check(name, fn) {
  n++;
  try { const r = fn(); if (r === false) throw new Error("returned false"); console.log("ok   " + name + (typeof r === "string" ? "  (" + r + ")" : "")); }
  catch (e) { fails++; console.log("FAIL " + name + ": " + (e && e.message || e)); }
}
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what || "value"} ${a} not within ${tol} of ${b}`); };

/* ---- banned calls in the pure sim ---- */
check("no banned calls in src/sim/ or src/data/", () => {
  const BAN = [/Math\.random/, /Date\.now/, /new Date\b/, /performance\.now/, /\bdocument\./, /\bwindow\./, /\bTHREE\./, /localStorage/, /requestAnimationFrame/, /setTimeout/];
  const bad = [];
  for (const dir of ["sim", "data"]) {
    const d = path.join(ROOT, "src", dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const txt = fs.readFileSync(path.join(d, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const re of BAN) if (re.test(txt)) bad.push(`src/${dir}/${f}: ${re.source}`);
    }
  }
  if (bad.length) throw new Error(bad.join("; "));
});

/* ---- the seeded RNG ---- */
check("rng: same seed, same sequence; named streams are independent", () => {
  const a = SIM.makeRng("burn"), b = SIM.makeRng("burn");
  for (let i = 0; i < 100; i++) if (a.next() !== b.next()) throw new Error("diverged at " + i);
  const s1 = SIM.rngStreams("x"), s2 = SIM.rngStreams("x");
  s1.get("voids").next(); s1.get("voids").next();   // drawing from one stream...
  if (s1.get("igniter").next() !== s2.get("igniter").next()) throw new Error("streams interfere");   // ...leaves another alone
  const st = a.getState(), c = SIM.makeRng(st);
  if (a.next() !== c.next()) throw new Error("saved state does not resume");
});

const suites = path.join(__dirname, "sim-tests");
if (fs.existsSync(suites)) for (const f of fs.readdirSync(suites).sort()) if (/\.js$/.test(f)) require(path.join(suites, f))({ SIM, check, near, brief });

console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
