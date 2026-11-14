# Textures

The shared tileable texture set for the 3D range and the motor. Every file is made by `tools/blender-textures.py`
(procedural Cycles node graphs baked in Blender, no photos or third-party images), so there is nothing to credit and
any texture can be remade by editing that script and running `python3 tools/blender-textures.py` from the repo root.

Each key has `<key>.jpg` (colour, sRGB) and `<key>-n.jpg` (tangent-space normal map, OpenGL convention: green = +v).
Every file tiles seamlessly. Neutral textures are near-grey and are multiplied by the material's palette colour;
coloured ones carry their real colour and go on a white or light material. The tile size is the real-world size one
copy covers (the model's material sets it).

| Key | What it is | Tile | Kind |
| --- | --- | --- | --- |
| `concrete` | cast concrete pad: fine pores, aggregate speckle, faint formwork board marks, light water stains | 2 m | neutral |
| `concreteOld` | weathered 1960s state concrete: rain streaks, damp patches, spalls, hairline cracks | 3 m | neutral |
| `paint` | worn near-white industrial paint on steel: scratches, chips showing dark steel, dust, faint drips | 1 m | neutral |
| `metal` | bare steel or aluminium: brushed streaks along u, faint mill-scale mottling, a few scuffs | 0.5 m | neutral |
| `burlap` | sandbag hessian: coarse plain weave, hairy and dusty | 0.5 m | neutral |
| `graphite` | machined graphite: fine lathe rings running along u, soot smudges | 0.2 m | neutral |
| `glass` | fibreglass cloth weave under resin, faint | 0.2 m | neutral |
| `carbon` | 2x2 twill carbon fibre (for a near-black material; keeps its weave contrast) | 0.1 m | neutral |
| `salt` | salt-flat crust: raised polygon ridges, fine cracks, mottled damp patches (1024 px) | 20 m | neutral |
| `rust` | rusty steel: orange-brown, pitting, flakes, a few flecks of old dark paint | 1 m | coloured |
| `earth` | dry steppe earth berm: cracked tan clay, pebbles, sparse straw-coloured grass tufts | 4 m | coloured |
| `wood` | sun-greyed weathered planks, grain along v, a butt joint and nails per board | 1 m | coloured |
| `kraft` | spiral-wound kraft paper tube, seams about 31 degrees off u | 0.3 m | coloured |

Rings (`graphite`), brushing (`metal`) and the kraft spiral follow `uv_cyl` in `tools/blender_lib.py`, where u goes
around a tube and v runs along it.
