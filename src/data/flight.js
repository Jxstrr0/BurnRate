/* ===================== data/flight.js: rockets and the launch day (stage 6; plan section 6.10) =====================
   A flight job puts the motor in a simple rocket picked from three lists: a body tube, a nose cone and a fin set. The
   rocket's length is the motor plus the payload bay plus the nose (three body diameters). Drag coefficient is the body's
   base plus the nose's and the fins' shares. A fin set keeps the rocket pointing straight up to a length/diameter ratio
   (maxLD); a longer, thinner rocket won't fly straight and the range won't launch it.
   Bodies: id / od in mm, kgm (kg per metre), cost (cr per metre). Noses: cd, mass (as metres of body tube), cost.
   Fins: cd, maxLD, mass (kg at 100 mm body diameter, growing with the square of the diameter), cost. */
const FLIGHT={
  bayLen:0.25,     // m of payload bay and parachute above the motor
  noseL:3,         // nose length, body diameters
  recovery:0.06,   // kg: parachute and harness, plus ...
  recoveryPerKg:0.04, // ... this share of the rest of the rocket's dry mass
  cdBody:0.25,     // the body's own drag coefficient (skin friction and base)
  rail:3,          // m of launch rail
  railMin:15,      // m/s: leaving the rail slower than this, the wind pushes the rocket over (a warning)
  twrMin:5,        // liftoff thrust-to-weight under this is a slow, wobbly start (a warning)
  gap:1,           // mm of clearance the body needs over the motor's case
  fee:250,         // range fee for a launch from the rail on the salt flat, cr
  windMin:0.5,     // m/s: the calmest launch day ...
  windMax:7,       // ... and the windiest the range lets you fly in
  windPow:1.6,     // most days are on the calm side: speed = min + (max − min) × u^windPow
  rho0:1.225,hScale:8500,g0:9.80665,   // sea-level air density (kg/m³), its scale height (m), gravity
  sound:340,       // m/s, for the drag rise near the speed of sound
  mach:[[0,1],[0.8,1],[1.05,1.6],[1.5,1.35],[3,1.2]],   // drag multiplier against Mach number (straight lines between)
  dtBurn:0.004,dtCoast:0.02,tMax:900   // integration steps (s) and a time cap
};
const BODIES={
  kraft33:{name:"33 mm kraft tube",id:31,od:33,kgm:0.07,cost:6,tier:1},
  kraft43:{name:"43 mm kraft tube",id:41,od:43,kgm:0.11,cost:8,tier:1},
  kraft58:{name:"58 mm kraft tube",id:56,od:58,kgm:0.17,cost:11,tier:1},
  kraft68:{name:"68 mm kraft tube",id:66,od:68,kgm:0.22,cost:14,tier:1},
  glass84:{name:"84 mm glass-fibre tube",id:81,od:84,kgm:0.55,cost:60,tier:2},
  glass118:{name:"118 mm glass-fibre tube",id:114,od:118,kgm:0.85,cost:85,tier:2},
  carbon160:{name:"160 mm carbon tube",id:156,od:160,kgm:1.05,cost:240,tier:3},
  carbon184:{name:"184 mm carbon tube",id:180,od:184,kgm:1.25,cost:290,tier:3}
};
const NOSES={
  cone:{name:"Cone",cd:0.18,mass:0.5,cost:10,tier:1,note:"Simple and light. Draggy."},
  ogive:{name:"Ogive",cd:0.12,mass:0.7,cost:18,tier:1,note:"The classic curve. Less drag."},
  karman:{name:"Von Kármán",cd:0.08,mass:0.9,cost:45,tier:2,note:"The low-drag shape for fast rockets."}
};
const FINS={
  three:{name:"Three small fins",cd:0.14,maxLD:13,mass:0.05,cost:12,tier:1,note:"Light, little drag; only steady on a short rocket."},
  four:{name:"Four fins",cd:0.21,maxLD:19,mass:0.08,cost:18,tier:1,note:"Steady on a longer rocket. More drag."},
  swept:{name:"Three swept fins",cd:0.16,maxLD:22,mass:0.09,cost:45,tier:2,note:"Big, swept and thin: steady and slippery."},
  long:{name:"Four long-chord fins",cd:0.24,maxLD:30,mass:0.14,cost:60,tier:3,note:"For long, thin boosters."}
};
Object.assign(SIM,{FLIGHT,BODIES,NOSES,FINS});
