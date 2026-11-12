/* ===================== data/designs.js: the default design and the reference motors =====================
   A design is what the player edits, in friendly units (mm, counts, table ids). sim/motor.js turns it into SI.
     grain   prop (PROPELLANTS id), shape ("bates" | "tube" | "end"), segs, segLen (mm), coreD (mm; ignored by "end")
     case    mat (CASES id), id (bore, mm), wall (mm), liner (LINERS id), linerThk (mm), closure (CLOSURES id), bolts
     nozzle  mat (THROATS id), throatD (mm), exitD (mm), half (divergence half-angle, degrees)
     igniter IGNITERS id
   REF_DESIGNS are the yardstick motors tools/sim-test.js prints with --brief (keep them stable). */
const DEFAULT_DESIGN={
  grain:{prop:"tr2",shape:"bates",segs:2,segLen:48,coreD:10},
  case:{mat:"al6061",id:29,wall:1.5,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},
  nozzle:{mat:"graphite",throatD:6.5,exitD:13,half:15},
  igniter:"s"
};
const REF_DESIGNS={
  "29mm 2-seg BATES, Mule":DEFAULT_DESIGN,
  "38mm 3-seg BATES, Mule":{grain:{prop:"tr2",shape:"bates",segs:3,segLen:55,coreD:12},case:{mat:"al6061",id:35,wall:1.6,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:8,exitD:20,half:15},igniter:"s"},
  "38mm tube, Swift 9 (progressive)":{grain:{prop:"swift9",shape:"tube",segs:1,segLen:120,coreD:12},case:{mat:"al6061",id:35,wall:1.6,liner:"paper",linerThk:1.0,closure:"ring",bolts:6},nozzle:{mat:"graphite",throatD:9,exitD:17,half:15},igniter:"s"},
  "38mm end burner, Swift 9":{grain:{prop:"swift9",shape:"end",segs:1,segLen:60,coreD:0},case:{mat:"mild",id:35,wall:2.0,liner:"rubber",linerThk:3.0,closure:"bolts",bolts:6},nozzle:{mat:"graphite",throatD:2.5,exitD:5,half:15},igniter:"xs"},
  "54mm 4-seg BATES, Dray, steel throat":{grain:{prop:"tr5",shape:"bates",segs:4,segLen:80,coreD:20},case:{mat:"cromo",id:51,wall:2.0,liner:"rubber",linerThk:1.5,closure:"bolts",bolts:8},nozzle:{mat:"steel",throatD:14,exitD:36,half:15},igniter:"m"},
  "98mm 5-seg BATES, Ox, composite":{grain:{prop:"tr9",shape:"bates",segs:5,segLen:150,coreD:42},case:{mat:"composite",id:94,wall:3.0,liner:"ablative",linerThk:2.5,closure:"bolts",bolts:12},nozzle:{mat:"insert",throatD:28,exitD:60,half:15},igniter:"l"}
};
Object.assign(SIM,{DEFAULT_DESIGN,REF_DESIGNS});
