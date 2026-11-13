/* ===================== data/daily.js: the Daily Spec's tables (stage 8) =====================
   The Daily Spec is one work order a day, the same on every phone, built by sim/daily.js from the date alone. Kelbo's
   rules (13 November 2026): unlimited firings with the best grade kept, and a fixed kit of parts per day that doesn't
   depend on the career. These tables say what a day can be:
     epoch     the date of Daily Spec No. 1
     kit       the parts a kit draws from: how many grades, extra grain shapes and case materials it offers (BATES is in
               every kit; liners, throats, closures and igniters are all open)
     size      the reference motor's ranges: bores (mm) with the wall per case material, segments and lengths, the peak
               pressure (MPa) it is tuned to, the expansion ratio, and how far past the weak-igniter line its igniter sits
     band      each criterion's half-width as a share of the reference's value (a two-sided band) or the margin for a
               one-sided limit, and what to round the numbers to
     orders    the kinds of order: which criteria, and the brief's wording ({client} is filled in)
     clients   who orders it */
const DAILY={
  epoch:"2026-11-13",
  kit:{props:["tr2","swift9","tr5","clearsky"],nProps:2,shapes:["tube","end","star","slots"],nShapes:2,cases:["phenolic","mild","al6061","cromo"],nCases:2},
  size:{bores:[29,35,44],wall:{phenolic:2.6,mild:1.6,al6061:1.6,cromo:1.4},segs:[1,4],segLen:[38,70],tubeLen:[70,160],endLen:[30,70],
    core:[0.32,0.48],ignMargin:1.4,pMPa:[2.6,4.6],eps:[3.5,6],stand:"s3",tries:40},
  band:{I:{w:0.14,r:5},Fav:{w:0.15,r:1},tb:{w:0.18,r:0.05},mass:{up:0.08,r:5},Pmax:{up:0.2,r:0.1},prog:{w:0.16,r:0.05}},
  orders:[
    {spec:["I","tb"],title:"A motor for the weekend",brief:"{client} flies on Saturday and needs a batch they can trust: the right impulse, burning for the right time."},
    {spec:["Fav","I"],title:"Match the label",brief:"{client} is printing the label before the motor exists. Average thrust and total impulse have to match it."},
    {spec:["Fav","tb"],title:"A steady push",brief:"{client} wants a set push for a set time: average thrust and burn time, nothing else."},
    {spec:["I","mass"],title:"Light and strong",brief:"{client} counts every gram. The impulse they asked for, and the motor no heavier than the limit."},
    {spec:["Fav","Pmax"],title:"Easy on the hardware",brief:"{client} reuses its cases, so the peak pressure has a ceiling. The thrust still has to be there."},
    {spec:["I","prog"],title:"Shape the curve",brief:"{client} has a flight profile that wants a particular curve: the impulse, and thrust that ends where it should against where it started."}],
  clients:["The Aqsor Steppe Rocketry Club","Dala Hobby Supply","The Kumtal Weather Service","Saryk Polytechnic","Bürkit Aerospace",
    "A film crew from the capital","The range's own instrument team","A university balloon group","Tengri Model Works","An old programme engineer, retired"]
};
Object.assign(SIM,{DAILY});
