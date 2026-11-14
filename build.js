#!/usr/bin/env node
// Adapted from Scrapline build.js (12 November 2026), itself from Prairie Engine Works.
/* Burn Rate: build index.html and sw.js from src/.
 *
 *   Edit src/, run `node build.js`, commit src/, index.html and sw.js together. Never hand-edit index.html or sw.js.
 *
 *   node build.js           concatenate the files listed in src/manifest.txt into index.html, then write sw.js
 *   node build.js --check   exit 1 if index.html or sw.js is not exactly what src/ builds (names the first differing src file);
 *                           both also refuse a script block that does not compile, or that declares a function twice,
 *                           or a voice line without its clips (checkVoice)
 *
 * Changes from Scrapline: caches start "brn-" (Burn Rate's own prefix; the service worker only ever deletes "brn-" caches),
 * nothing comes from a CDN (fonts, three.js and the studio logo are files in this repo), and the --absorb / --split
 * helpers are gone (Burn Rate was born split).
 *
 * The build is plain byte concatenation: no wrappers, no reformatting. Files are slices of one page, so a .js file may open
 * or close mid-IIFE and the first/last file of each <script> block carries the <script>/</script> line. File map: src/README.md.
 * Merge conflict in index.html: resolve it in src/, then `git checkout --theirs index.html && node build.js`.
 * Zero dependencies (node >= 16).
 */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), vm = require("vm");
const ROOT = __dirname, SRC = path.join(ROOT, "src"), OUT = path.join(ROOT, "index.html"), MAN = path.join(SRC, "manifest.txt");
const SW_OUT = path.join(ROOT, "sw.js"), NL = 10, PREFIX = "brn-";

function die(msg) { console.error("build.js: " + msg); process.exit(1); }

function manifest() {
  if (!fs.existsSync(MAN)) die("missing src/manifest.txt");
  const list = fs.readFileSync(MAN, "utf8").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const seen = new Set();
  for (const p of list) { if (seen.has(p)) die("manifest lists " + p + " twice"); seen.add(p); }
  return list;
}

/* every source file under src/ must be in the manifest (a new file nobody listed would silently drop out of the build) */
function orphans(list) {
  const want = new Set(list), out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name), r = path.relative(SRC, f).split(path.sep).join("/");
      if (e.isDirectory()) walk(f);
      else if (r !== "manifest.txt" && !/\.md$/i.test(r) && !want.has(r)) out.push(r);
    }
  })(SRC);
  return out;
}

const MARK = /^(<<<<<<<|>>>>>>>) /m;
function parts() {
  const list = manifest(), lost = orphans(list);
  if (lost.length) die("src files not in src/manifest.txt (add them or delete them): " + lost.join(", "));
  return list.map((p, i) => {
    const f = path.join(SRC, p);
    if (!fs.existsSync(f)) die("manifest lists src/" + p + " but the file does not exist");
    const b = fs.readFileSync(f);
    if (!b.length) die("src/" + p + " is empty");
    if (i < list.length - 1 && b[b.length - 1] !== NL) die("src/" + p + " must end with a newline (it is not the last file)");
    if (MARK.test(b.toString("latin1"))) die("src/" + p + " has merge-conflict markers; resolve them first");
    return { p, b };
  });
}
const build = ps => Buffer.concat(ps.map(x => x.b));

/* every inline <script> must compile (vm.Script parses, runs nothing), and no block may declare the same column-0 function
   twice (the files are slices of one scope, so a second declaration would silently replace the first) */
function lint(ps, out) {
  const txt = out.toString("latin1"), re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(txt))) {
    const src = m[1], at = m.index + m[0].indexOf(src); n++;
    try { new vm.Script(src, { filename: "block" + n }); }
    catch (e) {
      const ln = +((e.stack || "").match(/block\d+:(\d+)/) || [0, 1])[1], off = at + src.split("\n").slice(0, ln - 1).join("\n").length + (ln > 1 ? 1 : 0), w = where(ps, off);
      die("script block " + n + " does not compile: " + e.message + "\n  at src/" + w.p + " line " + w.line + " (index.html line " + lineAt(out, off) + ")");
    }
    const seen = new Map(), dr = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm; let d;
    while ((d = dr.exec(src))) {
      const w = where(ps, at + d.index);
      if (seen.has(d[1])) die("function " + d[1] + " is declared twice in script block " + n + ": src/" + seen.get(d[1]) + " and src/" + w.p + " line " + w.line);
      seen.set(d[1], w.p + " line " + w.line);
    }
  }
  return n;
}
function sizes(ps, out) {
  const zlib = require("zlib"), by = {};
  for (const x of ps) { const k = x.p.split("/")[0]; (by[k] = by[k] || []).push(x.b); }
  const row = (k, b) => k.padEnd(6) + String(b.length).padStart(9) + String(zlib.gzipSync(b, { level: 9 }).length).padStart(9);
  return ["      " + "raw".padStart(9) + "gzip".padStart(9)].concat(Object.keys(by).map(k => row(k, Buffer.concat(by[k])))).concat([row("total", out)]).join("\n");
}

/* ---- sw.js: generated so its cache name carries the version and a hash of everything it precaches ----
   PRECACHE = index.html + manifest + icons/ + fonts/ + assets/studio/ + lib/ (vendored scripts such as three.js).
   Any change to those bytes changes the hash, so sw.js changes, so browsers install it as an update ("New version ready"). */
const PRECACHE_DIRS = [["icons", /\.(png|svg|ico)$/i], ["fonts", /\.woff2$/i], ["assets/studio", /\.(svg|png)$/i], ["lib", /\.js$/i]];
function precacheList() {
  const list = ["index.html", "manifest.webmanifest"];
  for (const [dir, re] of PRECACHE_DIRS) {
    const d = path.join(ROOT, dir);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (re.test(f)) list.push(dir + "/" + f);
  }
  return list;
}
/* models/, sounds/ and textures/ are cached as they are fetched; the media cache name hashes their listings (names + sizes,
   subfolders included, such as sounds/voice/en/) */
function mediaHash() {
  const h = crypto.createHash("sha256");
  const walk = rel => {
    const d = path.join(ROOT, rel);
    if (fs.existsSync(d)) for (const n of fs.readdirSync(d).sort()) {
      const st = fs.statSync(path.join(d, n));
      if (st.isFile()) h.update(rel + "/" + n + "\0" + st.size + "\0"); else if (st.isDirectory()) walk(rel + "/" + n);
    }
  };
  for (const dir of ["models", "sounds", "textures"]) walk(dir);
  return h.digest("hex").slice(0, 8);
}
/* Ruslan's voice: every line in tools/voice-lines.json has a clip in sounds/voice/en/ and sounds/voice/ru/, the sign-offs
   match RSO_LINES in src/app/report.js (same keys, same count, same English), and the calls match VOICE_CALLS in
   src/app/firing.js, each countdown call with a beat (VOICE_BEAT) in both languages. A missing clip only means silence in
   the game, so this is the place that notices. */
function checkVoice() {
  const jf = path.join(ROOT, "tools", "voice-lines.json");
  if (!fs.existsSync(jf)) return;
  const j = JSON.parse(fs.readFileSync(jf, "utf8")), bad = [];
  for (const l of [...j.calls, ...j.signoffs]) for (const lang of ["en", "ru"])
    if (!fs.existsSync(path.join(ROOT, "sounds", "voice", lang, l.id + ".mp3"))) bad.push(`sounds/voice/${lang}/${l.id}.mp3 is missing`);
  const rep = fs.readFileSync(path.join(SRC, "app", "report.js"), "utf8").match(/const RSO_LINES=(\{[\s\S]*?\});\n/);
  if (!rep) bad.push("no RSO_LINES table in src/app/report.js");
  else {
    const R = vm.runInNewContext("(" + rep[1] + ")"), want = [];
    for (const k of Object.keys(R)) R[k].forEach((t, i) => want.push({ id: k + "-" + (i + 1), en: t }));
    const have = new Map(j.signoffs.map(l => [l.id, l.en]));
    for (const w of want) if (!have.has(w.id)) bad.push(`voice-lines.json has no sign-off ${w.id}`); else if (have.get(w.id) !== w.en) bad.push(`sign-off ${w.id} differs from RSO_LINES: "${have.get(w.id)}"`);
    if (j.signoffs.length !== want.length) bad.push(`voice-lines.json has ${j.signoffs.length} sign-offs, RSO_LINES ${want.length}`);
  }
  const fsrc = fs.readFileSync(path.join(SRC, "app", "firing.js"), "utf8"), fc = fsrc.match(/const VOICE_CALLS=(\[[^\]]*\]);/);
  if (!fc) bad.push("no VOICE_CALLS in src/app/firing.js");
  else if (JSON.stringify(JSON.parse(fc[1])) !== JSON.stringify(j.calls.map(l => l.id))) bad.push("VOICE_CALLS in src/app/firing.js differs from the calls in voice-lines.json");
  /* every countdown call has its beat (seconds to the stressed vowel) in both languages, so the count lands in either */
  const cc = fsrc.match(/const COUNT_CALLS=(\[[^\]]*\]);/), vb = fsrc.match(/const VOICE_BEAT=(\{[^\n]*\});/);
  if (!cc || !vb) bad.push("no COUNT_CALLS or VOICE_BEAT in src/app/firing.js");
  else {
    const B = vm.runInNewContext("(" + vb[1] + ")");
    for (const lang of ["en", "ru"]) for (const id of JSON.parse(cc[1])) {
      const v = B[lang] && B[lang][id];
      if (!(typeof v === "number" && v >= 0 && v < 0.35)) bad.push(`VOICE_BEAT.${lang}["${id}"] is missing or not 0 to 0.35 s`);
    }
  }
  if (bad.length) die("voice clips:\n  " + bad.join("\n  "));
}
function version() {
  const f = path.join(SRC, "app", "state.js"), m = fs.existsSync(f) && fs.readFileSync(f, "latin1").match(/const VERSION="([^"]+)"/);
  if (!m) die("no const VERSION=\"...\" in src/app/state.js");
  return m[1];
}
function swSource(page) {
  const list = precacheList(), h = crypto.createHash("sha256");
  for (const f of list) { h.update(f + "\0"); h.update(f === "index.html" ? page : fs.readFileSync(path.join(ROOT, f))); h.update("\0"); }
  return SW_TEMPLATE.replace("__CACHE__", () => PREFIX + "shell-v" + version() + "-" + h.digest("hex").slice(0, 10))
    .replace("__MEDIA__", () => PREFIX + "media-" + mediaHash()).replace("__PRECACHE__", () => JSON.stringify(list));
}
const SW_TEMPLATE = `/* Burn Rate service worker. GENERATED by build.js: do not edit (edit SW_TEMPLATE in build.js, then node build.js).
   App shell (the page, fonts, icons, the studio logo, vendored libraries): cache-first from a cache named for this version
   + content hash; old shell caches are deleted on activate. A new version installs in the background and waits: the page
   shows "New version ready" and sends SKIP_WAITING when tapped. Same-origin models/, sounds/ and textures/ are cached as
   they are fetched. Every cache name starts "brn-": the activate step only ever deletes "brn-" caches, never another game's. */
"use strict";
const CACHE = "__CACHE__", MEDIA = "__MEDIA__";
const PRECACHE = __PRECACHE__;
const BASE = new URL("./", self.location).pathname;
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async f => {
      const r = await fetch(new Request(f, { cache: "reload" }));
      if (!r.ok) throw new Error(f + " " + r.status);
      await c.put(f, r);
    }));
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("brn-") && k !== CACHE && k !== MEDIA) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", e => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });
async function put(name, q, r) { try { const c = await caches.open(name); await c.put(q, r); } catch (_) {} }
self.addEventListener("fetch", e => {
  const q = e.request;
  if (q.method !== "GET") return;
  const u = new URL(q.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(BASE)) return;
  const shell = q.mode === "navigate" && (u.pathname === BASE || u.pathname === BASE + "index.html");
  e.respondWith((async () => {
    const hit = await (await caches.open(CACHE)).match(shell ? "index.html" : q, { ignoreSearch: true });
    if (hit) return hit;
    const m = await (await caches.open(MEDIA)).match(q);
    if (m) return m;
    try {
      const r = await fetch(q);
      if (r.status === 200 && !q.headers.has("range") && /\\/(models|sounds|textures)\\//.test(u.pathname)) e.waitUntil(put(MEDIA, q, r.clone()));
      return r;
    } catch (err) {
      if (q.mode === "navigate") { const h = await (await caches.open(CACHE)).match("index.html"); if (h) return h; }
      throw err;
    }
  })());
});
`;
function writeSw(page) {
  const s = swSource(page);
  try { new vm.Script(s, { filename: "sw.js" }); } catch (e) { die("sw.js template does not compile: " + e.message); }
  if (!fs.existsSync(SW_OUT) || fs.readFileSync(SW_OUT, "utf8") !== s) fs.writeFileSync(SW_OUT, s);
  return s;
}

function lineAt(buf, off) { let n = 1; for (let i = 0; i < off && i < buf.length; i++) if (buf[i] === NL) n++; return n; }
function firstDiff(a, b) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i; return a.length === b.length ? -1 : n; }
function where(ps, off) {
  let at = 0;
  for (const x of ps) { if (off < at + x.b.length) return { p: x.p, line: lineAt(x.b, off - at) }; at += x.b.length; }
  const last = ps[ps.length - 1]; return { p: last.p, line: lineAt(last.b, last.b.length) + 1, end: true };
}

function cmdBuild() {
  const ps = parts(), out = build(ps);
  lint(ps, out); checkVoice();
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null, sw0 = fs.existsSync(SW_OUT) ? fs.readFileSync(SW_OUT, "utf8") : null;
  if (!(old && old.equals(out))) { fs.writeFileSync(OUT, out); console.log(`index.html written (${out.length} bytes, ${ps.length} files)`); }
  else console.log(`index.html unchanged (${out.length} bytes, ${ps.length} files)`);
  const sw = writeSw(out); console.log(sw === sw0 ? "sw.js unchanged" : "sw.js written (" + (sw.match(/brn-shell-[^"]+/) || [""])[0] + ")");
  console.log(sizes(ps, out));
}
function cmdCheck() {
  const ps = parts(), out = build(ps);
  lint(ps, out); checkVoice();
  if (!fs.existsSync(OUT)) die("index.html is missing; run node build.js");
  const cur = fs.readFileSync(OUT), d = firstDiff(out, cur);
  if (d < 0) {
    if (!fs.existsSync(SW_OUT) || fs.readFileSync(SW_OUT, "utf8") !== swSource(out)) die("sw.js is missing or stale (it is generated from index.html, manifest.webmanifest, icons/, fonts/, assets/studio/ and lib/); run node build.js");
    console.log(`ok: index.html and sw.js match src/ (${out.length} bytes, ${ps.length} files)`); return;
  }
  const w = where(ps, d);
  console.error(`build.js --check: index.html differs from the src/ build (built ${out.length} bytes, index.html ${cur.length}).`);
  console.error(`  first difference: src/${w.p} line ${w.line}${w.end ? " (past the end of the build)" : ""} = index.html line ${lineAt(cur, d)}`);
  console.error("  If src/ is right: node build.js. If index.html was hand-edited: move the edit into src/, then rebuild.");
  process.exit(1);
}

const a = process.argv.slice(2);
if (!a.length) cmdBuild();
else if (a[0] === "--check") cmdCheck();
else die("unknown option " + a[0] + " (use no option, or --check)");
