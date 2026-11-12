<script>
/* ===================== Burn Rate: motor sim core =====================
   BURN_SIM is pure maths: internal ballistics, the variance model, the career rules. It never touches the DOM or three.js
   and never calls Math.random, Date.now or performance.now (tools/sim-test.js fails the build if it does). Every random
   draw comes from a seeded stream (sim/rng.js) passed in as an argument, so a save and a design always fire the same way.
   Units inside the sim are SI: m, kg, s, Pa, N, K-offsets in °C. The data tables (src/data/) hold the tuning numbers.
   It runs in plain node: tools/sim-test.js cuts this <script> block out of index.html and loads it with vm.
   Files in this block (src/manifest.txt order): sim/open.js, sim/rng.js, data/*.js, sim/*.js, sim/close.js. Each file ends
   by adding what it exports to SIM. */
const BURN_SIM=(()=>{"use strict";
const SIM={};
