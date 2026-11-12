/* ===================== app/gloss.js: the tap-to-explain glossary (plan section 10) =====================
   GLOSS[key] = {t: the term, d: a short plain-English explanation}. Any element with data-g="key" opens its entry.
   The warnings in sim/derive.js name their entry in their gloss field. This teaches motor DESIGN only: geometry, pressure,
   nozzles, cases. Propellants are described by their numbers, never by what is in them (plan section 3). */
const GLOSS={
  grade:{t:"Propellant grade",d:"Each grade is a set of numbers. Burn rate: how fast the surface recedes at 5 MPa. Exponent n: how strongly that rate follows pressure. Density, and c*, how much pressure the gas makes per kilogram flowing. A high-n grade gives big swings from small changes."},
  exponent:{t:"Pressure exponent (n)",d:"Burn rate goes as pressure to the power n. With a low n (0.2 to 0.35) the motor settles calmly. With a high n (0.5 and up) a little more burning area or a little less throat sends the pressure up a lot, which is why high-n grades are touchy."},
  shape:{t:"Grain shape",d:"BATES: short hollow cylinders burning inside and on both ends, so the area stays fairly flat. Tube: one long hollow grain with its ends covered; the core grows, so the area and the pressure climb (progressive). End burner: a solid cylinder burning only from its back face, small and steady, so it burns for a long time at low thrust."},
  segments:{t:"Segments",d:"BATES grains are split into short segments so each one's burning ends balance its growing core. More segments: more propellant and more burning area, so higher pressure and more impulse."},
  web:{t:"Web",d:"The thickness of propellant that has to burn through before a segment is gone: the smaller of the wall (outside minus core, halved) and half the segment length for BATES. Burn time is roughly web divided by burn rate."},
  core:{t:"Core",d:"The hole down the middle of a cored grain. A bigger core means less propellant but more burning area at the start, and a wider port for the gas to flow out."},
  kn:{t:"Kn (Klemmung)",d:"Burning area divided by throat area. It sets the chamber pressure: more Kn, more pressure. Most of designing a motor is keeping Kn in a good band for the whole burn."},
  pressure:{t:"Chamber pressure",d:"The gas pressure inside the case. Higher pressure burns the grain faster and makes the nozzle work better, but the case has to hold it. The motor settles where the gas made by the burning grain equals the gas leaving through the throat."},
  throat:{t:"Throat",d:"The narrowest point of the nozzle. A smaller throat lets less gas out, so the pressure rises until the flow balances. It is the quickest way to tune pressure."},
  throatMat:{t:"Throat material",d:"Hot fast gas wears the throat wider during the burn (more at high pressure). As it widens, Kn falls and the pressure drops off. Graphite holds its size; plain steel wears fast; a refractory insert barely moves."},
  exit:{t:"Nozzle exit and expansion ratio",d:"The exit area divided by the throat area is the expansion ratio. A bigger exit turns more of the pressure into speed, up to the point where the exhaust leaves at the outside air pressure. Go past that and the nozzle is over-expanded."},
  halfAngle:{t:"Divergence half-angle",d:"How fast the cone of the nozzle opens. A wide cone throws some of the exhaust sideways, which is wasted thrust; a narrow one is long and heavy. 12 to 18 degrees is the usual band."},
  separation:{t:"Flow separation",d:"When the exit is too big for the chamber pressure, the exhaust can't fill the cone at sea level: it peels off the wall partway down. Thrust drops and the jet can wobble. Use a smaller exit, or more pressure."},
  caseMat:{t:"Case material",d:"The tube that holds the pressure. Its yield strength and wall thickness set the pressure it can take: hoop stress = pressure x radius / wall. Stronger material or a thicker wall holds more; it also weighs more."},
  bore:{t:"Case bore",d:"The inside diameter of the case. Everything scales with it: the grain, the propellant mass, and the force on the closures."},
  wall:{t:"Wall thickness",d:"Twice the wall holds twice the pressure, for twice the weight of tube. The safety factor is what the wall can hold at yield divided by the peak pressure."},
  sf:{t:"Safety factor",d:"Case yield pressure divided by the predicted peak pressure. The real motor never matches the prediction exactly, so keep it at 1.5 or more. Under 1 the case starts to stretch; past its ultimate strength it bursts."},
  cato:{t:"CATO",d:"A catastrophe at take-off: the motor comes apart. Usually the pressure went past what the case or its closures could hold. Ruslan Abenov will want a report."},
  liner:{t:"Liner",d:"Insulation between the grain and the case. Where the grain has burned away, hot gas reaches the case wall and the liner buys time: its rating is seconds of protection. If the burn outlasts it, the case burns through."},
  closure:{t:"Closures",d:"The forward bulkhead and the nozzle are held in by a snap ring or by bolts. Chamber pressure pushes on them with a force of pressure x bore area. A snap ring's rating grows with the bore; bolts add up one by one."},
  retention:{t:"Closure retention",d:"How much force the snap ring or the bolts can hold before the nozzle or bulkhead lets go. Compare it with peak pressure x bore area, and keep a margin of 1.5."},
  igniter:{t:"Igniter",d:"A small charge that fills the chamber with hot gas and lights the grain. Too small and the start is slow, or it hangs fire. Too big and its own gas spikes the pressure at the start."},
  hangFire:{t:"Hang fire",d:"The igniter goes off but the grain doesn't light properly: a long delay, a weak start, or nothing at all. A bigger igniter fixes it."},
  ignSpike:{t:"Start spike",d:"An igniter that is too big for the motor pushes the pressure past the steady burn while it is still going. The case has to hold that spike too. Pick a smaller igniter."},
  chuffing:{t:"Chuffing",d:"Under each grade's stable minimum pressure the flame can't hold steady: it puffs out and relights in a slow, loud chuff, chuff. More Kn (a smaller throat) brings the pressure back up."},
  portThroat:{t:"Port-to-throat ratio",d:"The open area of the core at the aft end divided by the throat area. Under about 2, the gas rushing down a narrow core scours the grain and burns it faster than the prediction: a pressure spike at the start. A bigger core or a smaller throat fixes it."},
  massFlux:{t:"Mass flux",d:"Kilograms of gas per second flowing through each square metre of the port. High flux at the aft end of a long grain scours the surface (erosive burning) and spikes the pressure."},
  isp:{t:"Specific impulse (Isp)",d:"Impulse per weight of propellant, in seconds: how well the motor turns propellant into push. A better nozzle and a higher pressure raise it."},
  impulse:{t:"Total impulse",d:"Thrust added up over the whole burn, in newton-seconds. It is what a contract's class letter is based on."},
  impulseClass:{t:"Impulse class",d:"A letter for the total impulse. A is up to 2.5 N·s and every letter after it doubles: G is 80 to 160, K is 1280 to 2560. The designation is the letter followed by the average thrust, like G55."},
  burnTime:{t:"Burn time",d:"From when thrust first reaches 5% of its peak to when it falls back under 5%."},
  thrust:{t:"Thrust",d:"Chamber pressure x throat area x the thrust coefficient (C_F), which says how well the nozzle turns pressure into push, usually 1.2 to 1.6."},
  cf:{t:"Thrust coefficient (C_F)",d:"Thrust divided by chamber pressure x throat area. It rises with a well matched expansion ratio and with chamber pressure."}
};
function glossSheet(key){const e=GLOSS[key];if(!e)return;openSheet(e.t,`<p>${esc(e.d)}</p>`);}
document.addEventListener("click",e=>{const el=e.target.closest("[data-g]");if(!el||el.closest("#sheet"))return;e.preventDefault();glossSheet(el.dataset.g);});
