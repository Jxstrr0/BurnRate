#!/usr/bin/env node
// Adapted from Escapement tools/make-icons.js (12 November 2026).
/* Burn Rate: render the PWA icons into icons/ (icon.svg, 192, 512, 512 maskable, 180 apple-touch).
 * Needs Playwright (it is preinstalled in Claude's cloud sessions; elsewhere: npm i -g playwright, then
 * NODE_PATH=$(npm root -g) node tools/make-icons.js). Output is committed; re-run only to change the mark.
 * The mark: a motor on a test stand firing to the right, its pressure trace drawn above it, on sun-bleached concrete. */
"use strict";
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "icons");
const GROUND = "#E6E3DC", INK = "#23262A", RED = "#C8341E", AMBER = "#E0A526", GREEN = "#5E7F6E";
function mark() {
  return `<path d="M14 40 C 22 22, 30 20, 40 26 S 58 30, 66 27 S 78 22, 86 40" fill="none" stroke="${RED}" stroke-width="4.2" stroke-linecap="round"/>
<rect x="14" y="54" width="44" height="14" rx="3" fill="${INK}"/>
<path d="M58 55 L66 51 L66 71 L58 67 Z" fill="${INK}"/>
<path d="M66 54 Q 82 57, 90 61 Q 82 65, 66 68 Z" fill="${AMBER}"/>
<path d="M66 57.5 Q 77 59.5, 82 61 Q 77 62.5, 66 64.5 Z" fill="${RED}"/>
<rect x="18" y="68" width="5" height="10" fill="${GREEN}"/><rect x="46" y="68" width="5" height="10" fill="${GREEN}"/>
<rect x="12" y="78" width="48" height="4" fill="${GREEN}"/>`;
}
function svg(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" fill="${GROUND}"/>
<g transform="translate(50 50) scale(${s}) translate(-50 -50)">${mark()}</g></svg>`;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "icon.svg"), svg(1).replace(' width="100%" height="100%"', "") + "\n");
  const b = await chromium.launch(), jobs = [["icon-192.png", 192, 1.02], ["icon-512.png", 512, 1.02], ["icon-512-maskable.png", 512, 0.78], ["apple-touch-icon.png", 180, 0.92]];
  for (const [f, n, s] of jobs) {
    const p = await b.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0;background:${GROUND}">${svg(s)}</body>`);
    await p.screenshot({ path: path.join(OUT, f), clip: { x: 0, y: 0, width: n, height: n } }); await p.close(); console.log("wrote icons/" + f);
  }
  await b.close();
})();
