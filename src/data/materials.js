/* ===================== data/materials.js: cases, liners, nozzles, closures, igniters =====================
   Generic engineering materials with plausible round numbers (strengths in MPa, density kg/m³). Tuning lives here. */
/* case tube materials. yield / ult in MPa (hoop), sVar = 1 sd spread on strength (stage 3), cost per kg */
const CASES={
  "phenolic":{name:"Phenolic tube",yield:70,ult:95,rho:1350,sVar:0.08,cost:30,tier:1,note:"Cheap and light. Low pressure only."},
  "mild":{name:"Mild steel tube",yield:300,ult:420,rho:7850,sVar:0.04,cost:8,tier:1,note:"Strong and cheap, but heavy."},
  "al6061":{name:"Aluminium 6061-T6",yield:275,ult:310,rho:2700,sVar:0.04,cost:20,tier:1,note:"The hobby standard. Little margin past yield."},
  "cromo":{name:"Chromoly steel",yield:460,ult:670,rho:7850,sVar:0.03,cost:18,tier:2,note:"Tough steel for higher pressure."},
  "composite":{name:"Filament-wound composite",yield:850,ult:1050,rho:1600,sVar:0.06,cost:120,tier:3,note:"Light and very strong. Pricey."}
};
/* liners / insulation between grain and case: rate = seconds of protection per mm of thickness */
const LINERS={
  "paper":{name:"Paper liner",rate:3.5,rho:900,cost:15,tier:1},
  "rubber":{name:"Rubber insulation",rate:5.5,rho:1150,cost:45,tier:2},
  "ablative":{name:"Ablative insulation",rate:9.0,rho:1400,cost:110,tier:3}
};
/* throat materials. ero = throat radius erosion in mm/s at 5 MPa (scales with (P/5 MPa)^0.8); finish = efficiency factor */
const THROATS={
  "steel":{name:"Steel",ero:0.070,finish:0.975,rho:7850,cost:6,tier:1,note:"Cheap, erodes fast at high pressure."},
  "graphite":{name:"Graphite",ero:0.010,finish:0.985,rho:1800,cost:25,tier:1,note:"Holds its throat well."},
  "insert":{name:"Refractory insert",ero:0.003,finish:0.99,rho:9000,cost:140,tier:3,note:"A throat insert that barely moves."}
};
/* closure retention: rating in N per mm of bore circumference (snap ring) or per bolt (bolts) */
const CLOSURES={
  "ring":{name:"Snap ring",perMm:110,tier:1,note:"Simple. Rated by the bore size."},
  "bolts":{name:"Radial bolts",perBolt:4200,tier:1,note:"More bolts, more load."}
};
/* igniters: gas (kg) delivered over burn (s). Strength = gas / need, need from the chamber (tuning.ign) */
const IGNITERS={
  "xs":{name:"Micro igniter",gas:0.00005,burn:0.10,cost:3},
  "s":{name:"Small igniter",gas:0.0004,burn:0.06,cost:5},
  "m":{name:"Medium igniter",gas:0.0012,burn:0.08,cost:9},
  "l":{name:"Large igniter",gas:0.004,burn:0.10,cost:16},
  "xl":{name:"Booster igniter",gas:0.015,burn:0.15,cost:40}
};
Object.assign(SIM,{CASES,LINERS,THROATS,CLOSURES,IGNITERS});
