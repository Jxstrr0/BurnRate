#!/usr/bin/env node
// Adapted from Scrapline check-savecode.js (12 November 2026).
/* Burn Rate: checks for the saves and the Back up / Restore save codes (src/app/save.js, src/app/savecode.js).
 *
 *   node check-savecode.js        run every check, print one line each, exit 1 if any fail
 *
 * It loads src/app/save.js and src/app/savecode.js together with a pretend localStorage and small stand-ins for the page
 * (toast, document), so it runs in plain node with no browser and tests the real hydrate(). The careers in it are made
 * by the real sim (the BURN_SIM block cut out of index.html), played for a few firings. It also makes sure index.html was
 * rebuilt with the current files. Keys: brn-save, brn-slot1 .. brn-slot3 (backed up) and brn-settings (this phone only,
 * never in a backup). A new localStorage key goes into KEYS here as well as buMake / buWrite.
 * Zero dependencies (node >= 16).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const ROOT = __dirname, FILES = ["save.js", "savecode.js"].map(f => path.join(ROOT, "src", "app", f));
const KEYS = ["brn-save", "brn-slot1", "brn-slot2", "brn-slot3"], PHONE_ONLY = ["brn-settings"];

/* ---- the real sim, to make realistic careers ---- */
function loadSim() {
  const h = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), i = h.indexOf("Burn Rate: motor sim core");
  const mod = { exports: {} };
  vm.runInNewContext(h.slice(h.lastIndexOf("<script>", i) + 8, h.indexOf("</script>", i)), { module: mod, console });
  return mod.exports;
}
const SIM = loadSim();

/* ---- a pretend browser: localStorage in a Map, plus the page bits the two files touch ---- */
function fakeStorage() {
  const m = new Map();
  return {
    quota: Infinity,   // like a real browser's storage limit: a setItem that would go over it throws
    used: () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0),
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { v = String(v); const was = m.has(k) ? k.length + m.get(k).length : 0;
      if (this.used() - was + k.length + v.length > this.quota) throw new Error("QuotaExceededError"); m.set(k, v); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    dump: () => Object.fromEntries([...m].sort())
  };
}
function load() {
  const code = FILES.map(f => fs.readFileSync(f, "utf8")).join("\n") +
    "\n;globalThis.freshSave=freshSave;globalThis.__get=()=>S;globalThis.__set=v=>{S=v;};";
  const ctx = {
    localStorage: fakeStorage(), TextEncoder, TextDecoder, Uint8Array, JSON, Math, Date,
    VERSION: "test", toasts: [], toast(m) { ctx.toasts.push(m); },
    document: { addEventListener() {}, hidden: false, querySelectorAll: () => [] }, addEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, globalThis: null
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: "save+savecode.js" });
  return ctx;
}

/* ---- realistic saves: a career a few firings in, made by the real sim ---- */
function career(seed, firings) {
  const car = SIM.newCareer(seed, "Saltpan Propulsion"); car.designs = {};
  for (let i = 0; i < firings; i++) {
    for (const id in SIM.FACILITIES) if (!SIM.canBuy(car, id)) SIM.buy(car, id);
    if (SIM.isBroke(car)) SIM.restartTier(car);
    const c = SIM.board(car).find(c => car.jobs[c.id] || !SIM.canTake(car, c.id)) || null;   // nothing left on offer: a free design firing
    if (c && !car.jobs[c.id]) SIM.takeJob(car, c.id);
    const d = JSON.parse(JSON.stringify(c ? c.solution : SIM.DEFAULT_DESIGN)), key = c ? c.id : "free"; if (c) car.designs[c.id] = d;
    const m = SIM.motorFromDesign(d), bill = SIM.firingCost(c ? c.stand : "s3", m, d), n = (c ? car.jobs[c.id].n : i) + 1, seedS = SIM.fireSeed(car, key, n);
    const f = SIM.fire(d, { tGrain: 14, logRate: 120 }, seedS), g = c ? SIM.grade(c, f) : { pass: false, why: "free" }, out = SIM.settle(car, c, g, bill.total);
    SIM.logFiring(car, { day: out.day, key, n, slot: "dusk", seed: seedS, rate: 120, design: d, letter: g.pass ? g.letter : null, why: g.pass ? null : g.why, fee: bill.fee, cost: bill.total, paid: out.paid, late: out.late });
  }
  return JSON.parse(JSON.stringify(car));
}
const game = over => Object.assign({ v: 1, career: career("chk", 4), free: JSON.parse(JSON.stringify(SIM.DEFAULT_DESIGN)), freeN: 3, lastBackup: 0 }, over || {});
const seed = st => {
  st.clear();
  st.setItem("brn-save", JSON.stringify(game()));
  st.setItem("brn-slot1", JSON.stringify(Object.assign(game({ career: null }), { savedAt: 1760000000000 })));
  st.setItem("brn-slot3", JSON.stringify(Object.assign(game({ career: career("other", 2) }), { savedAt: 1760100000000 })));
  st.setItem("brn-settings", JSON.stringify({ theme: "dark" }));
};
const plain = o => JSON.parse(JSON.stringify(o));   // objects made inside the vm have their own Object/Array, so copy them out before comparing
const msg = (ctx, text) => { try { ctx.buRead(text); } catch (e) { return e.bu || "crash:" + e.message; } return "ok"; };
const live = (ctx, o) => { ctx.__set(JSON.parse(JSON.stringify(o))); };

/* ---- the checks ---- */
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check("index.html carries the current save.js and savecode.js (run `node build.js` if not)", () => {
  const h = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const f of FILES) assert(h.includes(fs.readFileSync(f, "utf8")), path.basename(f));
});
check("the storage keys the page uses are the brn- keys this check knows", () => {
  const save = fs.readFileSync(FILES[0], "utf8");
  assert(/SAVE_KEY="brn-save"/.test(save) && /slotKey=i=>"brn-slot"\+i/.test(save), "save and slot keys in app/save.js");
  assert(/BU_KEY="brn-save"/.test(fs.readFileSync(FILES[1], "utf8")), "savecode.js's key");
  const h = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const keys = new Set([...h.matchAll(/["'](brn-[a-z0-9-]+)["']/g)].map(m => m[1]).filter(k => !/^brn-shell/.test(k)));
  for (const k of keys) assert(KEYS.includes(k) || PHONE_ONLY.includes(k) || k === "brn-slot", "index.html uses key " + k + ", which this check doesn't know (add it to buMake / buWrite and KEYS)");
  assert(!/localStorage\.clear\(\)\s*[;,)]/.test(h.replace(/\/\*[\s\S]*?\*\//g, "")), "never localStorage.clear()");
});
check("hydrate takes a real career and rejects broken ones without touching S", () => {
  const a = load(); const good = game();
  assert.strictEqual(a.hydrate(good), true);
  assert.deepStrictEqual(plain(a.__get()), plain(Object.assign(a.freshSave(), good)));
  const running = a.__get();
  const bad = [null, [], { v: 2 }, { v: 0 }, { v: "1" }, game({ career: "yes" }), game({ career: Object.assign(game().career, { money: "lots" }) }),
    game({ career: Object.assign(game().career, { log: {} }) }), game({ career: Object.assign(game().career, { jobs: { x: { due: "soon", pay: 1, n: 0 } } }) }),
    game({ free: { grain: 1 } }), game({ career: Object.assign(game().career, { designs: { x: [] } }) })];
  for (const o of bad) { assert.strictEqual(a.hydrate(o), false, JSON.stringify(o).slice(0, 60)); assert.strictEqual(a.__get(), running); }
});
check("save() writes brn-save; a slot keeps its own copy and loads back", () => {
  const a = load(); live(a, game());
  assert.strictEqual(a.save(true), true);
  assert.deepStrictEqual(JSON.parse(a.localStorage.getItem("brn-save")), plain(a.snapshot()));
  assert.strictEqual(a.saveSlot(2), true);
  const before = plain(a.__get().career);
  a.__get().career.money = -5; a.save(true);
  assert.strictEqual(a.loadSlot(2), true);
  assert.deepStrictEqual(plain(a.__get().career), before);
  assert.strictEqual(a.loadSlot(1), false, "an empty slot doesn't load");
});
check("round trip: everything comes back on a fresh browser, and brn-settings stays on this phone", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode(), before = a.localStorage.dump();
  assert(code.startsWith("BRN1:") && /^BRN1:[A-Za-z0-9_-]+$/.test(code), "only base64url characters after BRN1:");
  const b = load();   // another phone: nothing saved yet
  const r = b.buRead(code);
  assert.strictEqual(r.kind, "full");
  assert.deepStrictEqual(plain(r.data.save), plain(a.snapshot()));
  assert.strictEqual(r.data.slots.length, 3);
  assert.strictEqual(r.data.slots[1], null, "empty slot 2 stays empty");
  assert(b.buWrite(r.data));
  assert.deepStrictEqual(Object.keys(b.localStorage.dump()).sort(), KEYS.filter(k => k !== "brn-slot2").sort());
  for (const k of ["brn-slot1", "brn-slot3"]) assert.deepStrictEqual(JSON.parse(b.localStorage.getItem(k)), JSON.parse(before[k]), k);
  assert(!JSON.stringify(r.data).includes('"theme":"dark"'), "settings stayed out of the backup");
});
check("a brand-new player (no career yet) round trips, and restoring it clears the slots", () => {
  const a = load(); live(a, a.freshSave());
  const r = a.buRead(a.buCode()).data;
  assert.deepStrictEqual(plain(r.slots), [null, null, null]);
  const b = load(); seed(b.localStorage);
  assert(b.buWrite(r));
  assert.deepStrictEqual(Object.keys(b.localStorage.dump()).sort(), ["brn-save", "brn-settings"]);
});
check("code is much shorter than the save it holds", () => {
  const a = load(); seed(a.localStorage); live(a, game({ career: career("long", 30) }));
  const raw = JSON.stringify(a.buMake()).length, code = a.buCode().length;
  assert(code < raw * 0.6, `code ${code} vs JSON ${raw}`);
});
check("spaces, line breaks and text around the code are fine", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode(), mid = code.length >> 1;
  const messy = "here's my save:\n  " + code.slice(0, mid) + "\n ​" + code.slice(mid, mid + 40) + "  " + code.slice(mid + 40) + '" thanks!';
  assert.strictEqual(a.buRead(messy).kind, "full");
});
check("a damaged code is rejected (one character changed)", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode();
  for (const at of [6, code.length >> 1, code.length - 3]) {
    const c = code[at] === "A" ? "B" : "A";
    assert.strictEqual(msg(a, code.slice(0, at) + c + code.slice(at + 1)), "damaged", "changed at " + at);
  }
});
check("a cut-off code is rejected", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode();
  for (const n of [1, 6, 7, 50, code.length >> 1, code.length - 6]) assert.strictEqual(msg(a, code.slice(0, code.length - n)), "damaged", "cut " + n);
  assert.strictEqual(msg(a, code.slice(0, 200) + code.slice(260)), "damaged", "chunk missing from the middle");
  assert.strictEqual(msg(a, "BRN1:"), "damaged");
});
check("a code from another game is rejected (Scrapline, Lombard)", () => {
  const a = load();
  assert.strictEqual(msg(a, "SCR1:CYQwLiBcIAQBYA6s9ccc5z"), "other");
  assert.strictEqual(msg(a, "LMB1.CYQwLiBcIAQBYA6s9ccc5z.abc"), "other");
});
check("a code from a newer version gets its own message", () => {
  const a = load(); live(a, game());
  const body = a.buCode().slice(5);
  assert.strictEqual(msg(a, "BRN2:" + body), "newer");
  assert.strictEqual(msg(a, "BRN12:" + body), "newer");
});
check("empty and junk pastes get a friendly message, never a crash", () => {
  const a = load();
  assert.strictEqual(msg(a, ""), "empty");
  assert.strictEqual(msg(a, "   \n "), "empty");
  assert.strictEqual(msg(a, null), "empty");
  assert.strictEqual(msg(a, "hello there"), "notcode");
  assert.strictEqual(msg(a, "BRN1:!!!!!!!!!!!!"), "damaged");
  assert.strictEqual(msg(a, "BRN0:" + "A".repeat(20)), "notcode");
});
const pack = (a, d) => { const body = a.buZip(new TextEncoder().encode(JSON.stringify(d))); return "BRN1:" + body + a.buSum(body); };
check("a well-formed code with a broken save inside is refused and nothing is written", () => {
  const a = load(); seed(a.localStorage); const before = a.localStorage.dump();
  const g = game(), c = g.career;
  const bad = [
    { v: 1, save: { career: {} }, slots: [] },                                        // no v
    { v: 1, save: game({ v: 9 }), slots: [] },                                        // a save from a newer version
    { v: 1, save: game({ v: "1" }), slots: [] },                                      // v not a number
    { v: 1, save: game(), slots: [null, null, null, null] },                          // too many slots
    { v: 1, save: game({ career: Object.assign({}, c, { money: "lots" }) }), slots: [] },
    { v: 1, save: game({ career: Object.assign({}, c, { day: null }) }), slots: [] },
    { v: 1, save: game({ career: Object.assign({}, c, { jobs: [] }) }), slots: [] },
    { v: 1, save: game({ career: Object.assign({}, c, { log: "none" }) }), slots: [] },
    { v: 1, save: game({ career: Object.assign({}, c, { seed: 5 }) }), slots: [] },
    { v: 1, save: game({ career: "started" }), slots: [] },
    { v: 1, save: game({ free: [1] }), slots: [] },
    { v: 1, save: game(), slots: [{ v: 1, career: { money: 1 } }] },                  // a broken slot
    { v: 1, save: game(), slots: "none" },
    { v: 2, save: game(), slots: [] },
    [game()], "just a string", 42, null
  ];
  for (const d of bad) assert.strictEqual(msg(a, pack(a, d)), "bad", JSON.stringify(d).slice(0, 80));
  assert.strictEqual(msg(a, pack(a, { v: 1, save: game(), slots: [game(), null, null] })), "ok", "and the same thing done right passes");
  assert.deepStrictEqual(a.localStorage.dump(), before);
});
check("a write that fails half way (storage full) puts every key back the way it was", () => {
  const a = load(); seed(a.localStorage); a.localStorage.setItem("brn-slot2", JSON.stringify(game({ career: null })));
  const before = a.localStorage.dump();
  const huge = game({ career: career("huge", 60) });
  const r = { v: 1, save: game({ freeN: 9 }), slots: [game(), null, huge] };   // slot 3 won't fit
  a.localStorage.quota = a.localStorage.used() + 2000;
  assert.strictEqual(a.buWrite(r), false);
  assert.deepStrictEqual(a.localStorage.dump(), before);
  a.localStorage.quota = Infinity;
  assert.strictEqual(a.buWrite(r), true);
  assert.deepStrictEqual(JSON.parse(a.localStorage.getItem("brn-slot3")), plain(huge));
});
check("a trial load never changes the running game", () => {
  const a = load(); live(a, game()); const running = a.__get();
  a.buRead(a.buCode());
  assert.strictEqual(a.__get(), running);
});
check("packing survives big, varied saves (the LZW dictionary fills up)", () => {
  const a = load();
  let x = 12345; const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;
  const big = game({ career: career("big", 100) });
  big.career.name = "Ақсор ⚙ Стенд " + rnd().toString(36);
  for (const e of big.career.log) e.seed += rnd().toString(36);
  live(a, big);
  assert.deepStrictEqual(plain(a.buRead(a.buCode()).data.save), plain(a.snapshot()));
  const bytes = new TextEncoder().encode("abababababababababab");
  assert.deepStrictEqual(Array.from(a.buUnzip(a.buZip(bytes))), Array.from(bytes), "KwKwK case");
  assert.deepStrictEqual(plain(a.buUnzip(a.buZip(new Uint8Array(0)))), []);
});
check("a logbook entry restored from a code fires the same motor again (same report)", () => {
  const a = load(); live(a, game());
  const e = plain(a.buRead(a.buCode()).data.save).career.log[0];
  const f1 = SIM.fire(e.design, { tGrain: 14, logRate: e.rate }, e.seed), f2 = SIM.fire(game().career.log[0].design, { tGrain: 14, logRate: 120 }, game().career.log[0].seed);
  assert.deepStrictEqual(f1.log, f2.log);
});
check("a backup file (the code plus a line break) reads back, and its name carries the local date", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const file = a.buCode() + "\r\n";
  assert.deepStrictEqual(plain(a.buRead(file).data.save), plain(a.snapshot()));
  assert.strictEqual(a.buFileName(new Date(2026, 0, 5, 23, 30)), "burnrate-backup-2026-01-05.txt");
});

let bad = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { bad++; console.log("FAIL " + name + "\n     " + String(e && e.message || e).split("\n").join("\n     ")); }
}
console.log(bad ? `\n${bad} of ${checks.length} checks failed` : `\nall ${checks.length} save code checks passed`);
process.exit(bad ? 1 : 0);
