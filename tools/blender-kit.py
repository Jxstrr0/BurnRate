"""Burn Rate: build models/kit.glb, the motor and rocket hardware kit (stage 7, the textured pass), with scripted Blender.

Every part is modelled once, here, at UNIT size, and src/vis/stand3d.js (s3Setup) clones and scales the parts to each
design: it stretches the case tube to the case length and scales the closures, the nozzle housing and the saddles to the
case radius. Nothing is modelled by hand. Run it headless from the repo root, either way:

    blender -b -P tools/blender-kit.py        (a Blender install, 4.2 or newer)
    python tools/blender-kit.py               (the bpy module from PyPI: pip install bpy)

It writes models/kit.glb (commit it with this script). The shared helpers and conventions (materials with a texture key
and tile, the AO bake into COLOR_0, Y-up export) are in tools/blender_lib.py.

AXES. Blender is Z-up; the exporter turns it Y-up, so Blender (x, y, z) is three.js (x, z, -y).
  - MOTOR parts lie along Blender +X = three.js +X, forward end toward -X, up is Blender +Z = three.js +Y. On the stand
    the motor lies along three.js +X with its forward end on the load cell (motorMount). The camera side is Blender +Y
    (three.js -Z), so labels and the thermocouple face it.
  - ROCKET parts stand along Blender +Z = three.js +Y (the body axis, nose up). The rail is on the rocket's +X side
    (Blender and three.js). The launch cameras look from three.js -Z, which is Blender +Y.
  - Each node's mesh is in its own unit frame with its origin at the anchor below (node transforms are identity).

UNITS. "r" = the motor case's outer radius (case radius 1). "R" = the rocket body's outer radius (body radius 1).
"cm" = real centimetres (the game scales by 0.01, or a little less on tiny motors). Nodes, their unit and anchor:

  MOTOR (axis +X)
  caseTube      r; a unit tube, radius 1, x 0..1 (outer skin only). Cylindrical UVs: u = arc length round (r), v = x.
                The game stretches x to the tube length and multiplies the uv attribute by (r, length). Material tile 1
                (the game re-materials it per case material). AO is a flat 1 (it is stretched).
  caseBand      r; a stencil band, radius 1.003, x 0..1 (the game stretches x to the band width). Flat AO, tile 1.
  caseLabel     r; the range's test label, a curved patch facing Blender +Y (the camera side), slightly up: radius
                1.004..1.008, x 0..1.6, angle -10..50 degrees from +Y toward +Z. Paper, a stencil-red header, ink lines
                and a hazard square (no text). Anchor: its forward edge on the axis line (x = 0).
  fwdClosure    r; the forward closure: a flange flush with the tube's forward end (x -0.12..0, radius 1), the thrust
                boss (radius 0.44, x -0.28..-0.12) and its load button (radius 0.18, face at x = -0.30), a hex pressure
                port on top of the boss. Anchor x = 0 = the tube's forward end; the forward-most point is x = -0.30
                (FWD_LEN): the game puts the load-cell face there.
  transducer    cm; the pressure transducer screwed into the port: hex fitting, stainless body (19 mm), connector and
                a braided cable leaving it up and away (Blender -Y, -X). Axis +Z (up), origin at its base. The game puts
                it at fwdClosure's PORT = (-0.20, 0, 0.56) r (Blender), i.e. three.js (-0.20, 0.56, 0) r.
  bolt          head diameter; one socket-head cap screw head, axis +Z (outward), base at z = 0 on the surface (buried
                to -0.15). Head diameter 1, height 0.62. The game instances it round the case: forward ring at
                x = +0.16 r from the tube's forward end, aft ring at x = -0.18 r from the aft face.
  aftClosure    r; the aft closure: flange x -0.12..0 (radius 1) with its aft face at x = 0 (the case length's end),
                a bore of radius 0.70, a spiral retaining ring (radius 0.78..0.86) and two spanner holes. Anchor x = 0
                = the aft face, where the nozzle housing seats. The tube ends at x = -0.12 (AFT_LEN).
  nozzleHousing r; the steel nozzle housing: round collar (radius 0.74, x 0..0.14) and a hex body (circumradius 0.76)
                to its aft face at x = 0.50 (NOZ_LEN); a clean bore of radius 0.56 (NOZ_BORE) all through, where the
                game's lathed graphite bell sits. Anchor x = 0 = its seat on the aft closure.
  igniter       cm; the igniter leads out of the nozzle: twin leads from x = -3 (inside the nozzle) out through the
                exit plane (x = 0), a clip, then a short run of red/black twin wire drooping down and away (to about
                x 8, y -6, z -30). Anchor: the nozzle exit centre. Hidden once the motor lights.
  saddleBand    r (x scaled separately, see below); the clamp strap over the case: radius 1.0..1.05, x -0.10..0.10, its
                ears at z -0.30 bolted to the saddle block. Anchor: the case axis at the clamp's middle.
  saddleBlock   r (x scaled separately); the cradle block under the case with a round cut-out of radius 1.02: x
                -0.16..0.16, y -1.3..1.3, z -1.15..-0.30. Anchor as saddleBand. The game stands a post under it.
  tcPatch       r; a thermocouple under aluminium tape on the case (angle 40..70 degrees from +Y, x -0.18..0.18) and
                its yellow lead running forward along the case then lifting away. Anchor: the axis line under it.

  ROCKET (axis +Z)
  railButton    x: 1 = 30 mm (body surface to the rail centre); y, z: 1 = the button head's radius. A delrin rail
                button on a spacer, axis +X (toward the rail), base on the body surface at x = 0, top at x = 0.555.
  launchLug     R units of the lug: a tube along +Z (length 1, radius 0.5, centre x = 0.5) on a standoff; origin at its
                contact line on the body surface. (Not used by the rail; for a rod.)
  motorRetainer r (the MOTOR's case radius); a screw-on retainer: its body flange (radius 1.5) against the aft
                centering ring at z = 0, the knurled cap (radius 1.32) down to its aft face at z = -0.50 with an
                opening of radius 0.76. Axis -Z (aft is down), origin at the airframe's aft plane on the axis.
  finFillet     unit cove: a concave fillet strip filling the corner between the body (the plane x = 0) and a fin side
                (the plane y = 0): x 0..1 out from the body, y 0..1 off the fin, z 0..1 along the root, tapering to
                nothing at both ends. Origin: the root's aft end (z = 0) at the corner. In three.js
                its side is -Z: mirror it (z -> -z) for the other side of the fin.
  noseTip       a metal nose tip: base radius 1 at z = 0 (a little step to 0.97), rounded point at z = 1. The game scales
                it to the nose profile where the tip starts.
  shearPins     R; three pan-head screws at the nose shoulder joint, on the surface at z = 0 (one facing the camera).
  switchBand    R; the avionics switch band: a band of radius 1, z 0..0.8 with seam grooves at both ends, an arming
                switch plate facing Blender +Y (the camera) with a key switch and two screws. Uniform scale by R.
  ventRing      R; four static-port vent holes round the surface at z = 0.
  rollBand      R; the black roll-pattern quadrants (0..90 and 180..270 degrees) at radius 1.003, z 0..1 (stretched).
  camShroud     cm; an onboard camera pod (6 cm long, lens looking aft), radial +X from the surface point at the
                origin; the game turns it round the axis to face the camera.

MATERIALS: the palette of tools/blender-range.py plus a few hardware finishes, each with a texture key (textures/) and
a tile in metres (correct once the game multiplies a part's UVs by its scale). Parts the game re-materials (caseTube,
caseBand, finFillet) use tile 1 so the loader leaves their UVs in unit size.

AO is baked part by part in isolation, each with a few temporary neighbours (the case tube beside a closure, the surface
under a bolt, the body beside a rail button), so it doesn't depend on any one motor's size.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_lib import *

OUT = os.path.join(ROOT, "models", "kit.glb")
PI = math.pi
RX = (0, PI / 2, 0)           # rotate a Z-axis primitive onto +X

reset()

# ---- materials: name, colour, texture key, tile (m), roughness, metalness ----
mat("caseSkin", "#B4B9BF", "metal", 1.0, 0.45, 0.6)           # re-materialled per case material by the game
mat("bandPaint", "#A8322A", "paint", 1.0, 0.8)                # re-materialled by the game
mat("alu", "#B9BDC2", "metal", 0.15, 0.4, 0.7)
mat("steel", "#7A7F86", "metal", 0.12, 0.5, 0.6)
mat("steelDark", "#4A4E54", "metal", 0.2, 0.55, 0.55)
mat("blackOxide", "#2C2E33", "metal", 0.05, 0.45, 0.6)
mat("stainless", "#A6ABB1", "metal", 0.08, 0.35, 0.7)
mat("braid", "#8E9298", "metal", 0.02, 0.5, 0.6)
mat("ink", "#23262A", None, 1.0, 0.8)
mat("rubber", "#2A2B2D", None, 1.0, 0.9)
mat("wireRed", "#B8322A", None, 1.0, 0.6)
mat("wireBlack", "#1E2023", None, 1.0, 0.6)
mat("brass", "#B39050", "metal", 0.04, 0.4, 0.7)
mat("stateGreen", "#5E7F6E", "paint", 0.5, 0.85)
mat("paintDark", "#3E4247", "paint", 0.4, 0.7, 0.3)
mat("tape", "#C9CDD2", "metal", 0.1, 0.35, 0.6)
mat("tcWire", "#D9B23A", None, 1.0, 0.6)
mat("paper", "#EDEBE5", "paint", 0.3, 0.8)
mat("stencil", "#A8322A", "paint", 0.3, 0.8)
mat("hazard", "#E0A526", "paint", 0.3, 0.7)
mat("delrin", "#1F2124", None, 1.0, 0.5)
mat("anod", "#2E3238", "metal", 0.08, 0.35, 0.6)
mat("cobalt", "#2A55C9", "paint", 0.3, 0.6)
mat("fillet", "#FFFFFF", None, 1.0, 0.6)                       # re-materialled to match the fins
mat("lens", "#2B3440", None, 1.0, 0.2, 0.1)


# ---- shape helpers ----------------------------------------------------------------------------------------------------
def latheX(profile, m, verts=32):
    """a surface of revolution about +X from (radius, x) points. Order them counter-clockwise in the (r, x) plane (up
    the outside, in across the aft end, back down the bore, out across the front) so the faces point outward"""
    return lathe(profile, m, verts, rot=RX)


def revolve(rings, m, verts, axis="Z", loc=(0, 0, 0)):
    """like lathe, but each ring's radius may be a function of the vertex index (knurling)"""
    V, F = [], []
    for (r, z) in rings:
        for i in range(verts):
            a = 2 * PI * i / verts
            rr = r(i) if callable(r) else r
            p = (rr * math.cos(a), rr * math.sin(a), z)
            if axis == "X":
                p = (p[2], p[1], -p[0])
            V.append((p[0] + loc[0], p[1] + loc[1], p[2] + loc[2]))
    for j in range(len(rings) - 1):
        for i in range(verts):
            a, b = j * verts + i, j * verts + (i + 1) % verts
            F.append([a, b, b + verts, a + verts])
    return mesh_obj("rev", V, F, m)


def patchX(r, x0, x1, a0, a1, m, nu=8, nx=1):
    """a curved patch on a cylinder about X (a decal): angle a (degrees) from +Y toward +Z, facing outward"""
    V, F = [], []
    for i in range(nu + 1):
        a = math.radians(a0 + (a1 - a0) * i / nu)
        for j in range(nx + 1):
            V.append((x0 + (x1 - x0) * j / nx, r * math.cos(a), r * math.sin(a)))
    for i in range(nu):
        for j in range(nx):
            p = lambda ii, jj: ii * (nx + 1) + jj
            F.append([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)])
    return mesh_obj("patch", V, F, m)


def patchZ(r, z0, z1, a0, a1, m, nu=8, nz=1):
    """a curved patch on a cylinder about Z: angle a (degrees) from +X toward +Y, facing outward"""
    V, F = [], []
    for i in range(nu + 1):
        a = math.radians(a0 + (a1 - a0) * i / nu)
        for j in range(nz + 1):
            V.append((r * math.cos(a), r * math.sin(a), z0 + (z1 - z0) * j / nz))
    for i in range(nu):
        for j in range(nz):
            p = lambda ii, jj: ii * (nz + 1) + jj
            F.append([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)])
    return mesh_obj("patch", V, F, m)


def catmull(pts, n=6):
    """a smooth curve through the points (Catmull-Rom, n steps per span)"""
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(P[-2])
    return out


def sweep(pts, rad, m, sides=6, n=6, caps=True):
    """a round wire or cable along a smooth curve through pts"""
    C = catmull(pts, n)
    T = [(C[min(i + 1, len(C) - 1)] - C[max(i - 1, 0)]).normalized() for i in range(len(C))]
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = (up - T[0] * up.dot(T[0])).normalized()
    V, F = [], []
    for k, c in enumerate(C):
        N = (N - T[k] * N.dot(T[k])).normalized()
        B = T[k].cross(N)
        for i in range(sides):
            a = 2 * PI * i / sides
            V.append(tuple(c + rad * (math.cos(a) * N + math.sin(a) * B)))
    for k in range(len(C) - 1):
        for i in range(sides):
            a, b = k * sides + i, k * sides + (i + 1) % sides
            F.append([a, b, b + sides, a + sides])
    if caps:
        F.append(list(range(sides))[::-1])
        F.append([(len(C) - 1) * sides + i for i in range(sides)])
    return mesh_obj("wire", V, F, m)


def disc(c, nrm, r, m, n=8):
    """a flat round dot (a hole, a screw head seen from afar) facing along nrm"""
    nv = Vector(nrm).normalized()
    a = Vector((0, 0, 1)) if abs(nv.z) < 0.9 else Vector((1, 0, 0))
    u = nv.cross(a).normalized()
    w = nv.cross(u)
    V = [tuple(Vector(c) + r * (math.cos(2 * PI * i / n) * u + math.sin(2 * PI * i / n) * w)) for i in range(n)]
    return mesh_obj("dot", V, [list(range(n))], m)


def weld(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()


def part(name, uv="box", smooth=35, max_edge=0):
    """join the current group into one named node (one mesh, one primitive per material), weld, UV, smooth, AO layer"""
    objs = list(GROUP)
    GROUP.clear()
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    weld(o)
    finish(o, smooth, uv, max_edge)
    PARTS.append(o)
    return o


def flat_ao(o):
    """no bake for parts the game stretches: AO 1 everywhere"""
    for d in o.data.color_attributes["Color"].data:
        d.color = (1, 1, 1, 1)
    del o["_bake"]


PARTS = []

# =============================== MOTOR (axis +X, case radius 1) ===============================

# the case tube: a unit tube the game stretches
latheX([(1.0, 0.0), (1.0, 1.0)], "caseSkin", verts=48)
o = part("caseTube", uv="X")
flat_ao(o)

latheX([(1.003, 0.0), (1.003, 1.0)], "bandPaint", verts=48)
o = part("caseBand", uv="X")
flat_ao(o)

# the test label: paper, a red header, three ink lines, a hazard square
patchX(1.004, 0.0, 1.6, -10, 50, "paper", nu=10, nx=2)
patchX(1.006, 0.06, 1.54, 40, 47, "stencil", nu=2)
for (a0, a1, x1) in ((28, 31.5, 1.15), (19, 22.5, 1.0), (10, 13.5, 1.12), (1, 4.5, 0.7)):
    patchX(1.006, 0.1, x1, a0, a1, "ink", nu=1)
patchX(1.007, 1.24, 1.5, 4, 33, "hazard", nu=4)
patchX(1.008, 1.31, 1.43, 12, 25, "ink", nu=2)
caseLabel = part("caseLabel", uv="X")

# forward closure: load button, boss, flange; hex pressure port on the boss
latheX([(0.0, -0.30), (0.17, -0.30), (0.17, -0.28), (0.40, -0.28), (0.44, -0.245), (0.44, -0.12), (0.955, -0.12),
        (1.0, -0.08), (1.0, 0.0), (0.0, 0.0)], "alu", verts=28)
cyl(0.1, 0.17, (-0.20, 0, 0.47), "steel", verts=6, bevel=0.01)
cyl(0.065, 0.03, (-0.20, 0, 0.565), "steel", verts=10)
fwdClosure = part("fwdClosure", uv="X")

# the pressure transducer (cm): hex fitting, body, knurled ring, connector, braided cable away from the camera
cyl(1.25, 0.8, (0, 0, 0.4), "stainless", verts=6, bevel=0.08)
lathe([(0.0, 0.8), (0.95, 0.8), (0.95, 5.4), (1.0, 5.45), (1.0, 5.85), (0.95, 5.9), (0.0, 5.9)], "stainless", verts=12)
lathe([(0.0, 5.9), (0.78, 5.9), (0.78, 7.6), (0.6, 7.9), (0.45, 8.3), (0.0, 8.3)], "ink", verts=12)
sweep([(0, 0, 8.0), (0, 0, 11), (-1.5, -2.5, 14), (-5, -9, 13), (-8, -16, 4), (-10, -21, -12), (-11, -24, -30)],
      0.28, "braid", sides=6, n=2)
transducer = part("transducer", uv="box")

# one bolt head (unit head diameter), axis +Z, buried a little
lathe([(0.0, -0.15), (0.5, -0.15), (0.5, 0.55), (0.45, 0.62), (0.26, 0.62), (0.26, 0.36), (0.0, 0.36)],
      "blackOxide", verts=10)
bolt = part("bolt", uv="box")

# aft closure: flange with its bore, retaining ring with ears, spanner holes
latheX([(0.70, -0.12), (1.0, -0.12), (1.0, -0.03), (0.97, 0.0), (0.70, 0.0), (0.70, -0.12)], "alu", verts=28)
V, F = [], []
N = 16
for i in range(N + 1):                          # the spiral ring: 20..340 degrees (a gap at the top)
    a = math.radians(110 + 320 * i / N)
    c, s = math.cos(a), math.sin(a)
    for (rr, xx) in ((0.78, 0.0), (0.86, 0.0), (0.86, 0.022), (0.78, 0.022)):
        V.append((xx, rr * c, rr * s))
for i in range(N):
    for k in range(4):
        a0, a1 = i * 4 + k, i * 4 + (k + 1) % 4
        F.append([a1, a0, a0 + 4, a1 + 4])
F.append([0, 1, 2, 3])
F.append([N * 4 + k for k in range(4)][::-1])
mesh_obj("ring", V, F, "steel")
for a in (100, 80):                             # ears at the gap
    ar = math.radians(a)
    box((0.03, 0.06, 0.06), (0.012, 0.82 * math.cos(ar), 0.82 * math.sin(ar)), "steel")
for a in (0, 180):                              # spanner holes
    ar = math.radians(a)
    disc((0.002, 0.925 * math.cos(ar), 0.925 * math.sin(ar)), (1, 0, 0), 0.035, "ink")
aftClosure = part("aftClosure", uv="X")

# nozzle housing: round collar, hex body, clean bore of 0.56
latheX([(0.56, 0.0), (0.74, 0.0), (0.74, 0.12), (0.72, 0.14), (0.60, 0.14)], "steelDark", verts=28)
latheX([(0.60, 0.14), (0.76, 0.14), (0.76, 0.45), (0.70, 0.50), (0.60, 0.50)], "steelDark", verts=6)
latheX([(0.66, 0.5005), (0.56, 0.5005), (0.56, 0.0)], "steelDark", verts=28)
nozzleHousing = part("nozzleHousing", uv="X")

# igniter (cm): twin leads out of the throat, a clip, then twin wire drooping down and away
for (dy, m) in ((0.06, "wireRed"), (-0.06, "wireBlack")):
    sweep([(-3, dy, 0), (0, dy, 0), (0.8, dy * 2, -0.1), (1.5, dy * 3, -0.2)], 0.045, m, sides=4, n=1)
box((1.1, 0.55, 0.42), (2.0, 0, -0.25), "brass", bevel=0.06)
box((0.9, 0.62, 0.48), (3.0, 0, -0.3), "ink", bevel=0.08)
for (dy, m) in ((0.09, "wireRed"), (-0.09, "wireBlack")):
    sweep([(3.4, dy, -0.3), (4.5, dy, -0.8), (5.6, dy - 0.6, -3.0), (6.4, dy - 2.0, -8), (7.0, dy - 4.0, -16),
           (7.6, dy - 6.0, -26), (7.9, dy - 6.5, -30)], 0.075, m, sides=4, n=2)
igniter = part("igniter", uv="box")

# saddle: the clamp strap with ears and bolts, and the cradle block under it
V, F = [], []
N = 14
a0, a1 = -17.5, 197.5
for i in range(N + 1):
    a = math.radians(a0 + (a1 - a0) * i / N)
    c, s = math.cos(a), math.sin(a)
    for (rr, xx) in ((1.0, -0.10), (1.0, 0.10), (1.05, 0.10), (1.05, -0.10)):
        V.append((xx, rr * c, rr * s))
for i in range(N):
    for k in range(4):
        b0, b1 = i * 4 + k, i * 4 + (k + 1) % 4
        F.append([b0, b1, b1 + 4, b0 + 4])
mesh_obj("strap", V, F, "paintDark")
for sy in (1, -1):
    box((0.2, 0.30, 0.05), (0, sy * 1.10, -0.275), "paintDark", bevel=0.01)
    cyl(0.07, 0.07, (0, sy * 1.15, -0.215), "steel", verts=6)
saddleBand = part("saddleBand", uv="box")

pts = [(1.3, -1.15), (1.3, -0.30), (0.975, -0.30)]
for i in range(1, 16):                          # the cut-out: from (0.975, -0.30) round the bottom to (-0.975, -0.30)
    a = math.radians(-17.1 - (180 - 2 * 17.1) * i / 16)
    pts.append((1.02 * math.cos(a), 1.02 * math.sin(a)))
pts += [(-1.3, -0.30), (-1.3, -1.15)]
n = len(pts)
V = [(-0.16, y, z) for (y, z) in pts] + [(0.16, y, z) for (y, z) in pts]
F = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
mesh_obj("block", V, F, "stateGreen")
saddleBlock = part("saddleBlock", uv="box")

# thermocouple under aluminium tape, and its lead
patchX(1.004, -0.18, 0.18, 40, 70, "tape", nu=4)
ar = math.radians(55)
c, s = math.cos(ar), math.sin(ar)
sweep([(0.0, 1.012 * c, 1.012 * s), (-0.25, 1.016 * c, 1.016 * s), (-0.6, 1.02 * c, 1.02 * s), (-0.85, 1.12 * c, 1.18 * s),
       (-1.1, 1.0, 1.6), (-1.3, 0.9, 2.2)], 0.022, "tcWire", sides=4, n=3)
tcPatch = part("tcPatch", uv="box")

# =============================== ROCKET (axis +Z) ===============================

# rail button: x 1 = 30 mm, y/z 1 = head radius
latheX([(0.5, 0.0), (0.5, 0.25), (1.0, 0.25), (1.0, 0.33), (0.55, 0.33), (0.55, 0.42), (1.0, 0.42),
        (1.0, 0.49), (0.92, 0.52), (0.42, 0.52), (0.0, 0.555)], "delrin", verts=12)
railButton = part("railButton", uv="X")

lathe([(0.42, 0.0), (0.5, 0.0), (0.5, 1.0), (0.42, 1.0), (0.42, 0.0)], "alu", verts=12, loc=(0.5, 0, 0))
box((0.12, 0.3, 0.8), (0.06, 0, 0.5), "alu")
launchLug = part("launchLug", uv="Z")

# motor retainer (motor r): flange, threaded body, knurled cap
knurl = lambda i: 1.32 if i % 2 == 0 else 1.285
revolve([(0.76, -0.50), (1.26, -0.50), (1.32, -0.46), (knurl, -0.44), (knurl, -0.16), (1.32, -0.14), (1.28, -0.12),
         (1.22, -0.12), (1.22, -0.05), (1.48, -0.05), (1.50, -0.03), (1.50, 0.0), (1.0, 0.0), (1.0, -0.42),
         (0.76, -0.42), (0.76, -0.50)], "anod", verts=28)
motorRetainer = part("motorRetainer", uv="Z", smooth=70)

# fin fillet: a cove section swept along z, tapering at the ends
ring_z = [0.0, 0.03, 0.08, 0.15, 0.5, 0.85, 0.92, 0.97, 1.0]
ring_s = [0.0, 0.45, 0.8, 1.0, 1.0, 1.0, 0.8, 0.45, 0.0]
arc = [(1 + math.cos(math.radians(a)), 1 + math.sin(math.radians(a))) for a in range(180, 271, 15)]
V, F = [], []
for z, s in zip(ring_z, ring_s):
    for (x, y) in arc:
        V.append((x * s, y * s, z))
na = len(arc)
for j in range(len(ring_z) - 1):
    for k in range(na - 1):
        F.append([j * na + k, (j + 1) * na + k, (j + 1) * na + k + 1, j * na + k + 1])
mesh_obj("fillet", V, F, "fillet")
finFillet = part("finFillet", uv="box", smooth=60)

lathe([(1.0, 0.0), (1.0, 0.03), (0.97, 0.06), (0.73, 0.29), (0.46, 0.56), (0.24, 0.78), (0.06, 0.95), (0.0, 1.0)],
      "alu", verts=16)
noseTip = part("noseTip", uv="Z")

for a in (90, 210, 330):
    ar = math.radians(a)
    lathe([(0.05, 0.0), (0.045, 0.012), (0.0, 0.022)], "steel", verts=8,
          loc=(math.cos(ar), math.sin(ar), 0), rot=(0, PI / 2, ar))
shearPins = part("shearPins", uv="box")

# switch band: band with seam grooves, arming plate, key switch and screws
lathe([(0.985, 0.0), (0.985, 0.012), (1.0, 0.016), (1.0, 0.784), (0.985, 0.788), (0.985, 0.8)], "cobalt", verts=28)
patchZ(1.006, 0.30, 0.50, 80, 100, "alu", nu=3)
ar = math.radians(90)
cyl(0.045, 0.06, (0, 1.03, 0.40), "steel", rot=(-PI / 2, 0, 0), verts=12)
box((0.012, 0.004, 0.05), (0, 1.061, 0.40), "ink")
for z in (0.33, 0.47):
    disc((0, 1.008, z), (0, 1, 0), 0.016, "ink", n=6)
switchBand = part("switchBand", uv="Z")

for a in (60, 150, 240, 330):
    ar = math.radians(a)
    disc((1.002 * math.cos(ar), 1.002 * math.sin(ar), 0), (math.cos(ar), math.sin(ar), 0), 0.035, "ink")
ventRing = part("ventRing", uv="box")

patchZ(1.003, 0.0, 1.0, 0, 90, "ink", nu=8)
patchZ(1.003, 0.0, 1.0, 180, 270, "ink", nu=8)
rollBand = part("rollBand", uv="Z")
flat_ao(rollBand)

sphere(1.0, (0, 0, 0), "paper", segs=10, rings=7, scale=(1.3, 1.2, 3.0))
cyl(0.4, 0.5, (0.42, 0, -2.55), "ink", verts=12)
cyl(0.28, 0.05, (0.42, 0, -2.81), "lens", verts=12)
camShroud = part("camShroud", uv="box")

# =============================== AO bake, each part in isolation ===============================
# temporary neighbours, in each part's own units: [kind, args]
NEIGH = {
    "fwdClosure": [("cylx", 1.0, 0.0, 1.5), ("cylx", 2.0, -0.40, -0.31)],     # the case tube; the load-cell plate
    "transducer": [("cylx", 1.4, -3, 3, -1.4)],                               # the boss under it (cm)
    "bolt": [("box", (6, 6, 1), (0, 0, -0.5))],
    "aftClosure": [("cylx", 1.0, -1.5, -0.12), ("cylx", 0.74, 0.0, 0.5)],     # tube ahead, housing aft
    "nozzleHousing": [("cylx", 1.0, -0.4, 0.0)],
    "saddleBand": [("cylx", 1.0, -1.5, 1.5)],
    "saddleBlock": [("cylx", 1.0, -1.5, 1.5)],
    "caseLabel": [("cylx", 1.0, -0.5, 2.1)],
    "tcPatch": [("cylx", 1.0, -1.5, 1.0)],
    "railButton": [("box", (1, 8, 8), (-0.5, 0, 0))],
    "launchLug": [("box", (1, 4, 3), (-0.5, 0, 0.5))],
    "motorRetainer": [("cylz", 3.0, 0.0, 0.3), ("cylz", 0.98, -0.6, 0.0)],   # aft centering ring; the motor inside
    "finFillet": [("box", (1, 3, 3), (-0.5, 1, 0.5)), ("box", (3, 1, 3), (1, -0.5, 0.5))],
    "noseTip": [("cylz", 1.0, -1.0, 0.0)],
    "shearPins": [("cylz", 0.995, -1.0, 1.0)],
    "switchBand": [("cylz", 1.0, -1.0, 0.0), ("cylz", 1.0, 0.8, 1.8)],
    "ventRing": [("cylz", 0.995, -0.5, 0.5)],
    "camShroud": [("box", (1, 6, 10), (-0.5, 0, 0))],
}
occ = []
bake_list = [p for p in PARTS if p.get("_bake")]
y = 0.0
for p in bake_list:
    p.location = (0, y, 0)
    for nb in NEIGH.get(p.name, []):
        if nb[0] == "cylx":
            r, x0, x1 = nb[1], nb[2], nb[3]
            zc = nb[4] if len(nb) > 4 else 0.0
            o = cyl(r, x1 - x0, ((x0 + x1) / 2, y, zc), "ink", rot=RX, verts=32)
        elif nb[0] == "cylz":
            r, z0, z1 = nb[1], nb[2], nb[3]
            o = cyl(r, z1 - z0, (0, y, (z0 + z1) / 2), "ink", verts=32)
        else:
            sz, c = nb[1], nb[2]
            o = box(sz, (c[0], y + c[1], c[2]), "ink")
        GROUP.remove(o)
        occ.append(o)
    y += 120.0
bake_ao(samples=32, distance=0.35, ground=False, objects=bake_list)
for o in occ:
    bpy.data.objects.remove(o, do_unlink=True)
for p in PARTS:
    p.location = (0, 0, 0)
# one AO value per vertex: the bake writes each face corner its own value, and corners that differ make the exporter
# split the vertex (doubling the file). Average the corners of each vertex instead.
for p in PARTS:
    ca = p.data.color_attributes["Color"]
    acc = {}
    for lp in p.data.loops:
        acc.setdefault(lp.vertex_index, []).append(ca.data[lp.index].color[0])
    avg = {k: sum(v) / len(v) for k, v in acc.items()}
    for lp in p.data.loops:
        g = avg[lp.vertex_index]
        ca.data[lp.index].color = (g, g, g, 1.0)
lift_ao(floor=0.42, gamma=0.8)

export(OUT)
