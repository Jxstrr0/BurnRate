/* ===================== data/contracts.js: the first playable's fixed contracts (stage 3) =====================
   Stage 4 replaces this list with the career's contract board. Each contract:
     id, client, title, brief (the work order's text), tier (highest part tier allowed), stand (what fits),
     slot (null: the player picks dawn, noon or dusk; or a fixed SLOTS id), spec (criteria, sim/grade.js),
     start (the design the bench opens with: a REF_DESIGNS name or a design), solution (a design that passes: the balance check in
     tools/sim-tests/fire.js fires it across seeds and slots, so every contract stays solvable). */
const GRADING={a:0.5,b:0.2};   // grade A: every two-sided criterion in the middle half of its band; B: the middle 80%
const STANDS={s3:{name:"Stand 3",len:420,dia:64,note:"The smallest stand: a concrete pad, a load cell rated 2 kN, one camera."}};
const CONTRACTS=[
  {id:"first-light",client:"Aqsor Steppe Rocketry Club",title:"A G for field day",tier:1,stand:"s3",slot:null,
    brief:"The club flies on Saturday and their usual supplier has sold out. Any G motor that burns for a second or more. They will fly whatever passes.",
    spec:[{k:"I",lo:80,hi:160},{k:"tb",lo:1.0,hi:3.5}],start:"29mm 2-seg BATES, Mule",
    solution:{grain:{prop:"tr2",shape:"bates",segs:2,segLen:42,coreD:10},case:{mat:"al6061",id:29,wall:1.5,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:6.5,exitD:13,half:15},igniter:"s"}},
  {id:"dala-g48",client:"Dala Hobby Supply",title:"Catalogue G48",tier:1,stand:"s3",slot:null,
    brief:"A hobby shop in town wants a motor for its catalogue: a G averaging close to 48 N. Customers read the label, so the motor has to match it.",
    spec:[{k:"Fav",lo:42,hi:54},{k:"I",lo:110,hi:150}],start:"29mm 2-seg BATES, Mule",
    solution:{grain:{prop:"tr2",shape:"bates",segs:2,segLen:44,coreD:10},case:{mat:"al6061",id:29,wall:1.5,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:6.5,exitD:12,half:15},igniter:"s"}},
  {id:"kumtal-tow",client:"Kumtal Weather Service",title:"A long, gentle push",tier:1,stand:"s3",slot:null,
    brief:"The weather station sends instruments up on small gliders that drift home. They want a gentle motor that pushes for ten seconds or more, without shaking the instruments.",
    spec:[{k:"tb",lo:10,hi:16},{k:"Fav",lo:5,hi:12}],
    start:{grain:{prop:"swift9",shape:"end",segs:1,segLen:60,coreD:0},case:{mat:"mild",id:35,wall:2.0,liner:"paper",linerThk:3.0,closure:"bolts",bolts:6},nozzle:{mat:"graphite",throatD:2.5,exitD:5,half:15},igniter:"xs"},
    solution:{grain:{prop:"tr2",shape:"end",segs:1,segLen:40,coreD:0},case:{mat:"mild",id:40,wall:2.0,liner:"paper",linerThk:5.5,closure:"bolts",bolts:6},nozzle:{mat:"graphite",throatD:2.0,exitD:4,half:15},igniter:"xs"}},
  {id:"saryk-h",client:"Saryk Polytechnic rocket team",title:"Off the rail, fast",tier:1,stand:"s3",slot:null,
    brief:"The students' rocket is heavy and their launch rail is short. They need a hard push: 180 N or more on average, all of it inside 1.8 seconds.",
    spec:[{k:"Fav",lo:180,hi:280},{k:"I",lo:200,hi:400},{k:"tb",hi:1.8}],start:"38mm 3-seg BATES, Mule",
    solution:{grain:{prop:"swift9",shape:"bates",segs:3,segLen:48,coreD:16},case:{mat:"al6061",id:35,wall:1.6,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:9,exitD:20,half:15},igniter:"s"}},
  {id:"burkit-light",client:"Bürkit Aerospace",title:"A light 38 mm I",tier:1,stand:"s3",slot:null,
    brief:"A small launch company is testing an upper stage on a tight budget. Every gram counts: an I motor that weighs 330 g or less, all up.",
    spec:[{k:"I",lo:340,hi:440},{k:"mass",hi:330}],start:"38mm 3-seg BATES, Mule",
    solution:{grain:{prop:"tr2",shape:"bates",segs:3,segLen:55,coreD:12},case:{mat:"phenolic",id:35,wall:1.5,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:8,exitD:20,half:15},igniter:"s"}},
  {id:"range-dawn",client:"Aqsor Range Authority",title:"Cold qualification",tier:1,stand:"s3",slot:"dawn",
    brief:"Before the range signs off its new stands, R. Abenov wants to see a motor behave on a cold morning. Fired at dawn, whatever the weather: 120 to 160 N on average, and gentle on the case.",
    spec:[{k:"Fav",lo:120,hi:160},{k:"I",lo:320,hi:450},{k:"Pmax",hi:3.0}],start:"38mm 3-seg BATES, Mule",
    solution:{grain:{prop:"tr2",shape:"bates",segs:3,segLen:55,coreD:12},case:{mat:"al6061",id:35,wall:1.6,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:7.5,exitD:18,half:15},igniter:"s"}}
];
Object.assign(SIM,{GRADING,STANDS,CONTRACTS});
