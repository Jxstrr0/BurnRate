/* ===================== data/propellants.js: the propellant grades =====================
   HARD RULE (plan section 3): a grade is a STAT BLOCK, never a recipe. Fictional names and performance numbers only;
   no ingredients, ratios or making steps, here or anywhere. The state grades (TR-) are old programme surplus named after
   draught animals; the others are the startups' own.
   Fields (plan section 6.1):
     rRef    burn rate in mm/s at 5 MPa and 20 °C. The sim derives the coefficient a = rRef / (5 MPa)^n (SI, m/s per Pa^n).
     n       pressure exponent (0.2 to 0.7): higher n is faster to respond and touchier about pressure
     rho     density, kg/m³
     cStar   delivered characteristic velocity, m/s
     gamma   ratio of specific heats of the exhaust
     sigmaP  temperature sensitivity of burn rate, per °C (a_eff = a·exp(sigmaP·(T − 20)))
     pMin    below this chamber pressure the burn is unstable (chuffing), MPa
     aVar    batch-to-batch burn rate spread (1 sd), fraction
     kE      erosive burning gain, per (kg/m²s) above gTh (stage 5)
     gTh     erosive threshold mass flux, kg/(m²·s) (stage 5)
     cost    per kg, in the game's money
     tier    career tier that unlocks it */
const PROPELLANTS={
  "tr2":{name:"TR-2 Mule",maker:"State surplus",note:"Forgiving, low exponent. Slow and steady.",
    rRef:5.0,n:0.30,rho:1700,cStar:1380,gamma:1.21,sigmaP:0.0016,pMin:0.55,aVar:0.025,kE:6e-5,gTh:1100,cost:40,tier:1},
  "swift9":{name:"Swift 9",maker:"Startup grade",note:"Fast and touchy. High exponent: small changes, big swings.",
    rRef:9.0,n:0.52,rho:1660,cStar:1420,gamma:1.20,sigmaP:0.0030,pMin:0.9,aVar:0.040,kE:9e-5,gTh:900,cost:55,tier:1},
  "tr5":{name:"TR-5 Dray",maker:"State surplus",note:"The workhorse. Middle of everything, plenty of it.",
    rRef:7.0,n:0.38,rho:1760,cStar:1470,gamma:1.19,sigmaP:0.0020,pMin:0.7,aVar:0.020,kE:7e-5,gTh:1100,cost:70,tier:2},
  "clearsky":{name:"Clearsky HP",maker:"Startup grade",note:"High energy, but it feels the weather.",
    rRef:8.0,n:0.42,rho:1780,cStar:1540,gamma:1.18,sigmaP:0.0036,pMin:0.8,aVar:0.030,kE:8e-5,gTh:1000,cost:120,tier:2},
  "tr9":{name:"TR-9 Ox",maker:"State surplus",note:"Dense, slow, very low exponent. Built for big boosters.",
    rRef:4.0,n:0.24,rho:1820,cStar:1520,gamma:1.17,sigmaP:0.0012,pMin:0.6,aVar:0.012,kE:5e-5,gTh:1300,cost:95,tier:3},
  "steppefire":{name:"Steppefire X",maker:"Startup grade",note:"Very fast for boost phases. Respect the margins.",
    rRef:14.0,n:0.48,rho:1740,cStar:1500,gamma:1.18,sigmaP:0.0026,pMin:1.0,aVar:0.030,kE:1e-4,gTh:900,cost:150,tier:3}
};
Object.assign(SIM,{PROPELLANTS});
