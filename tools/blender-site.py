"""Burn Rate: build models/site.glb, the far scenery of Site 41 round the test compound, with scripted Blender.

Like tools/blender-range.py, nothing is modelled by hand: every hangar, pole, rail and scrub bush is placed by numbers in
this script. Run it headless from the repo root (about 20 seconds):

    python3 tools/blender-site.py               (the bpy module from PyPI: pip install bpy)
    blender -b -P tools/blender-site.py         (a Blender install, 4.2 or newer)

It writes models/site.glb. It builds in the same world frame as range.glb (Blender Z up, metres, Stand 2 at the origin,
exhausts along +X), so the game loads it unmoved. The compound itself (about x -90..100, y -75..80) is left empty: only
roads and a power line end at its edge.

What is in it: the decommissioned state test range round the compound, out to about 1.2 km, faded and mostly abandoned.
  - siteW: the main approach. A cracked asphalt road raised on a low causeway from the far west to the west fence near
    (-95, -20), the gatehouse with a red and white barrier arm and a "41" plate, a bus shelter, a billboard frame with a
    painted rocket, a wooden power line with sagging wires along the road, concrete road blocks and a truck shell.
  - siteNW: the old aviation corner. A concrete apron with three hangars (two arched, one gabled; the big arched one
    with its doors half open on a dark interior), a concrete water tower, four two-storey barracks with broken windows,
    and the slab road that joins them to the main road.
  - siteN: the rail spur on a low embankment along y = 300 (broad-gauge rails, sleepers by the platform), a concrete
    loading platform with a station hut, two box wagons and a tank wagon, a buffer stop, leaning telegraph poles and the
    slab road north out of the compound.
  - siteE: downrange (the way the exhausts point), open and sparse: striped range marker masts with diamond boards, the
    lattice telemetry tower at (700, 150) with dishes and a beacon, a derelict observation post on legs, instrument pads,
    a car shell, and the dirt track out to them.
  - siteS: behind the blockhouse. The range control tower (five storeys, a glazed cab, an antenna mast with a beacon) at
    (-60, -260) with its annex, a car park with an old bus, prefab huts, a substation, concrete-pole power lines to it
    and on to the compound, and far off the old range town (panel blocks and a boiler-house chimney).
  - siteScrub: low scrub bushes and dirt tracks scattered over the whole flat.

The salt flat is the game's own ground plane at z = 0, and the game's depth buffer is coarse far out (its near plane is
5 cm), so nothing here lies flat on the ground: roads are low causeways with sloped shoulders, aprons are slabs, and the
few flat things (tracks, windows) are lifted more the farther out they are (lift()).

Nodes the game may read: siteBeaconTower, siteBeaconTelemetry (the two red beacons, for blinking lights), siteGate (the
gatehouse barrier pivot), siteRoadEnd (where the main road meets the west fence), siteNorthRoadEnd, siteSouthRoadEnd.

Budget: at most 700 kB. No AO bake (far things don't show it) and no vertex colour layer, so a vertex costs about 32
bytes (position, normal, UV) and a triangle 6. tally() prints what each part costs.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_parts import *          # noqa: F401,F403
from blender_parts import GROUP, MATS, keep, _box, _cyl
import bpy, bmesh
from mathutils import Vector, Matrix

T0 = time.time()
OUT = os.path.join(ROOT, "models", "site.glb")
scene = reset()
palette()
# a few colours of our own on the shared textures
mat("asphalt", "#9C978E", tex="concreteOld", tile=4.0)                     # old cracked road surface
mat("scrub", "#77745A", tex="earth", tile=4.0, rough=1.0)                  # dry steppe scrub
mat("oxide", "#7E4E3A", tex="paint", tile=1.0, rough=0.85)                 # faded wagon red-brown

RND = random.Random(41)


# =====================================================================================================================
# small helpers for far scenery
# =====================================================================================================================
def lift(x, y):
    """how far a flat thing must sit off the ground (or a wall) at this distance from the stand to stay clear of
    depth fighting in the game's coarse depth buffer"""
    return 0.04 + 0.00025 * math.hypot(x, y)


def poly(pts, m, n):
    """one flat polygon (concave is fine) through 3D points, turned to face the wanted normal n"""
    P = [Vector(p) for p in pts]
    nn = Vector((0, 0, 0))
    for i in range(len(P)):
        a, b = P[i], P[(i + 1) % len(P)]
        nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    if nn.dot(Vector(n)) < 0:
        P = P[::-1]
    return mk("poly", P, [list(range(len(P)))], m)


def quad(c, u, v, w, h, m, lift_=0.05):
    """a w by h rectangle centred on c in the plane of u, v, lifted along u x v: windows, boards, patches (4 vertices)"""
    c, u, v = Vector(c), Vector(u).normalized(), Vector(v).normalized()
    n = u.cross(v)
    c = c + n * lift_
    return mk("quad", [c - u * w / 2 - v * h / 2, c + u * w / 2 - v * h / 2, c + u * w / 2 + v * h / 2,
                       c - u * w / 2 + v * h / 2], [[0, 1, 2, 3]], m)


def path_pts(pts, step):
    """a smooth path through pts (Catmull-Rom), resampled about every step metres"""
    P = [Vector((x, y, 0)) for x, y in pts]
    D = catmull(P, 16)
    out, acc = [D[0]], 0.0
    for i in range(1, len(D)):
        acc += (D[i] - D[i - 1]).length
        if acc >= step or i == len(D) - 1:
            out.append(D[i])
            acc = 0.0
    return out


def causeway(pts, w, m_top, m_side, step=20.0, shoulder=1.6, jitter=0.25, ramp=(), seed=3, base=0.12):
    """a road on a low causeway: the top (w wide, edges crumbled by jitter) and sloped shoulders down to the ground.
    Its height grows with distance (lift) so the far stretches never fight the ground plane. ramp: path ends ("start",
    "end") that slope down to the ground where the road meets the compound"""
    rnd = random.Random(seed)
    P = path_pts(pts, step)
    n = len(P)
    T, S = [], []
    for i, p in enumerate(P):
        d = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        L = Vector((-d.y, d.x, 0))
        h = base + 0.0004 * math.hypot(p.x, p.y)
        if ("start" in ramp and i == 0) or ("end" in ramp and i == n - 1):
            h = 0.02
        a, b = w / 2 + rnd.uniform(-jitter, jitter), w / 2 + rnd.uniform(-jitter, jitter)
        s = shoulder + h * 2
        T.append((p + L * a + Vector((0, 0, h)), p - L * b + Vector((0, 0, h))))
        S.append((p + L * (a + s), p - L * (b + s)))
    V, F = [], []
    for i in range(n):
        V += [T[i][0], T[i][1]]
    for i in range(n - 1):
        F.append([2 * i + 1, 2 * i + 3, 2 * i + 2, 2 * i])
    top = mk("road", V, F, m_top, recalc=True)
    V, F = [], []
    for i in range(n):
        V += [S[i][0], T[i][0], T[i][1], S[i][1]]
    for i in range(n - 1):
        a, b = 4 * i, 4 * (i + 1)
        F.append([a, a + 1, b + 1, b][::-1])
        F.append([a + 2, a + 3, b + 3, b + 2][::-1])
    sh = mk("shoulder", V, F, m_side)
    for o in (top, sh):          # make every face point up
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
        bm.to_mesh(o.data)
        bm.free()
    return P


def track(pts, w, m="worn", step=15.0):
    """a dirt track: a flat ribbon lifted by distance"""
    P = path_pts(pts, step)
    V, F = [], []
    n = len(P)
    for i, p in enumerate(P):
        d = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        L = Vector((-d.y, d.x, 0)) * (w / 2)
        z = Vector((0, 0, lift(p.x, p.y) * 1.2))
        V += [p + L + z, p - L + z]
    for i in range(n - 1):
        F.append([2 * i + 1, 2 * i + 3, 2 * i + 2, 2 * i])
    return mk("track", V, F, m)


def sag(a, b, s, k=6):
    """points along a hanging wire from a to b with sag s at mid-span"""
    a, b = Vector(a), Vector(b)
    return [a + (b - a) * (i / k) - Vector((0, 0, s * 4 * (i / k) * (1 - i / k))) for i in range(k + 1)]


def wire(a, b, s, m="steelDark", r=0.025, k=4):
    tube(sag(a, b, s, k), r, m, sides=3, caps=False)


def pole_line(pts, kind, step, wires=3, m_wire="steelDark", sagm=1.1, gaps=(), lean=0.0, seed=7, wire_max=650.0):
    """a power or telegraph line along a path: a pole every step metres, crossarm across the line, wires between.
    kind: "wood" (a timber pole), "concrete" (a tapered square concrete pole) or "tele" (a short telegraph pole).
    gaps: span numbers with no wires (broken lines). Returns the pole tops."""
    rnd = random.Random(seed)
    P = path_pts(pts, step)
    n = len(P)
    tops = []
    H = {"wood": 9.0, "concrete": 10.0, "tele": 6.5}[kind]
    span = {3: (-1.05, -0.35, 1.05), 2: (-0.5, 0.5)}[wires]
    for i, p in enumerate(P):
        d = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        rz = math.atan2(d.y, d.x)
        lx, ly = rnd.uniform(-lean, lean), rnd.uniform(-lean, lean)
        M = Matrix.Translation(p) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(lx, 4, "X") @ Matrix.Rotation(ly, 4, "Y")
        with frame(M=M):
            if kind == "concrete":
                cyl(0.2, H, (0, 0, H / 2), "concrete", verts=4, r2=0.11, rot=(0, 0, math.pi / 4))
                box((0.14, 2.5, 0.14), (0, 0, H - 0.4), "steelDark")
            elif kind == "wood":
                cyl(0.14, H, (0, 0, H / 2), "wood", verts=7, r2=0.11)
                box((0.12, 2.5, 0.12), (0, 0, H - 0.4), "wood")
            else:
                cyl(0.11, H, (0, 0, H / 2), "wood", verts=6, r2=0.09)
                box((0.1, 1.3, 0.1), (0, 0, H - 0.3), "wood")
            ins = []
            for y in span:
                ins.append(M @ Vector((0, y, H - 0.25)))
        tops.append(ins)
    for i in range(n - 1):
        mid = (P[i] + P[i + 1]) / 2
        if i in gaps or mid.length > wire_max:          # far wires are thinner than a pixel: leave them off
            continue
        for k in range(len(span)):
            wire(tops[i][k], tops[i + 1][k], sagm * (1 + rnd.uniform(-0.15, 0.25)), m_wire)
    return tops


def site_prep(sharp=61, flat_below=3.0):
    """like blender_parts.prep_parts, tuned for far scenery: every part under flat_below metres (and every long thin
    pole, rod or wire) gets one UV, since its texture can't be seen from the compound and box-projected seams each cost
    vertices; round slender parts (ext under 0.4 m across) are shaded smooth"""
    import numpy as np
    for i, o in enumerate(GROUP):
        me = o.data
        n = len(me.vertices)
        co = np.empty(n * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        co = co.reshape(n, 3)
        if n >= 3:
            c = co - co.mean(axis=0)
            _, vec = np.linalg.eigh(c.T @ c)
            ext = np.sort(np.ptp(c @ vec, axis=0))
        else:
            ext = np.zeros(3)
        slender = ext[1] < 0.4 and len(me.polygons) > 4
        flat = ext[2] < flat_below or ext[1] < 0.5
        bm = bmesh.new()
        bm.from_mesh(me)
        lim = math.radians(140 if slender else sharp)
        for e in bm.edges:
            if e.is_manifold and e.calc_face_angle(0.0) > lim:
                e.smooth = False
        bm.to_mesh(me)
        bm.free()
        a = me.attributes.get("part") or me.attributes.new("part", "INT", "FACE")
        a.data.foreach_set("value", [i + 1 if flat else 0] * len(me.polygons))


def site_group(name, levels=(0.0,), sharp=61):
    tally("end")
    cull_resting(levels)
    site_prep(sharp)
    o = join(name, smooth_angle=180, max_edge=0)
    flat_uvs(o)
    return o


def scrub_patch(cx, cy, r, count, seed, mz="scrub"):
    """a clump of low scrub: flat cones, a few metres across, half a metre high"""
    rnd = random.Random(seed)
    for k in range(count):
        a, d = rnd.uniform(0, 6.3), r * math.sqrt(rnd.random())
        x, y = cx + d * math.cos(a), cy + d * math.sin(a)
        rr = rnd.uniform(0.5, 1.6)
        h = rr * rnd.uniform(0.3, 0.5)
        cyl(rr, h, (x, y, h / 2), mz, verts=6, r2=0.0, rot=(0, 0, rnd.uniform(0, 1)))


def windows(o, u, along, cols, rows, w, h, dx, dz, mats, seed, lift_):
    """a grid of window quads on a facade: o is the bottom-left window centre, u along the facade, rows up"""
    rnd = random.Random(seed)
    o, u = Vector(o), Vector(u).normalized()
    up = Vector((0, 0, 1))
    for r in range(rows):
        for c in range(cols):
            m = rnd.choices([q[0] for q in mats], [q[1] for q in mats])[0]
            if m:
                quad(o + u * (c * dx) + up * (r * dz), u, up, w, h, m, lift_)


def concrete_block(x, y, rz, m="concrete"):
    with frame((x, y, 0), rz=rz):
        plate([(-0.3, 0), (0.3, 0), (0.15, 0.8), (-0.15, 0.8)], (0, -0.9, 0), (1, 0, 0), (0, 0, 1), 1.8, m)


# =====================================================================================================================
# siteW: the main road from the west, the gatehouse, the bus shelter, the billboard, the power line
# =====================================================================================================================
def build_west():
    tally("main road")
    road = [(-1450, -110), (-1000, -72), (-640, -40), (-380, -26), (-200, -21), (-95, -20)]
    causeway(road, 7.0, "asphalt", "earth", step=22.0, ramp=("end",), seed=11)
    tally("gatehouse")
    # the gatehouse: a white block on a plinth with a flat roof, windows all round, a door; the barrier across the road
    with frame((-114.0, -9.6, 0)):
        box((4.6, 3.6, 0.4), (0, 0, 0.2), "concrete")
        box((4.2, 3.2, 2.5), (0, 0, 1.65), "white")
        box((5.2, 4.4, 0.25), (0, 0, 3.02), "concrete")
        for (c, u, w) in (((0, -1.6, 1.9), (1, 0, 0), 2.6), ((2.1, 0, 1.9), (0, 1, 0), 2.0), ((-2.1, 0, 1.9), (0, -1, 0), 2.0)):
            quad(c, u, (0, 0, 1), w, 1.0, "glass", 0.03)
        quad((-1.2, 1.6, 1.4), (-1, 0, 0), (0, 0, 1), 0.9, 2.0, "steelDark", 0.03)
        box((0.7, 0.5, 0.25), (1.2, 1.2, 3.27), "concrete")                     # a vent box on the roof
        stencil("41", (-0.45, -1.6, 2.45), (1, 0, 0), (0, 0, 1), 0.36, m="stencil")
    with frame((-108.5, -15.2, 0)):
        box((0.5, 0.5, 1.1), (0, 0, 0.55), "concrete")
        box((0.25, 0.25, 0.9), (0, 0, 1.55), "white")
        box((0.4, 0.5, 0.45), (0, 0.55, 1.95), "steelDark")                     # counterweight
        for k in range(8):                                                       # the arm, red and white
            box((0.12, 1.1, 0.12), (0, -0.55 - k * 1.1, 1.9), "stencil" if k % 2 else "white")
        box((0.18, 0.18, 1.0), (0, -9.3, 0.95), "white")                         # the rest on the far side
        box((0.3, 0.12, 0.1), (0, -9.3, 1.75), "steelDark")
    empty("siteGate", (-108.5, -15.2, 1.9))
    for (x, y, r) in ((-104, -13.8, 0.1), (-104, -26.6, -0.1), (-120, -27.5, 0.4), (-121.5, -28.6, 0.2), (-99, -12.9, 1.3)):
        concrete_block(x, y, r)
    with frame((-101.0, -27.0, 0), rz=-math.pi / 2):                             # the old range sign: faces the way in
        for sx in (-1.2, 1.2):
            box((0.1, 0.1, 2.6), (sx, 0, 1.3), "steelDark")
        box((3.0, 0.08, 1.2), (0, 0, 2.2), "white")
        quad((0, -0.04, 2.6), (1, 0, 0), (0, 0, 1), 2.8, 0.3, "stencil", 0.01)
        stencil("CAIT 41", (-1.3, -0.05, 1.8), (1, 0, 0), (0, 0, 1), 0.42, m="stencil", gap=0.25)
    tally("bus shelter")
    with frame((-168.0, -27.4, 0)):                                              # open side faces the road (+y)
        box((5.0, 2.2, 0.25), (0, 0, 0.125), "concrete")
        box((5.0, 0.22, 2.6), (0, -0.95, 1.55), "concrete")
        for sx in (-2.4, 2.4):
            box((0.2, 1.8, 2.6), (sx, -0.2, 1.55), "concrete")
        box((5.6, 2.8, 0.2), (0, 0.1, 2.95), "concrete")
        box((3.6, 0.4, 0.08), (0, -0.6, 0.7), "wood")
        quad((0, -0.84, 1.7), (-1, 0, 0), (0, 0, 1), 3.4, 1.2, "white", 0.02)     # faded painted panel
        plate([(0, 0), (0.5, 0), (0.25, 1.0)], (1.2, -0.81, 1.25), (-1, 0, 0), (0, 0, 1), 0.02, "stencil")
        box((0.08, 0.08, 2.4), (3.4, 0.9, 1.2), "steelDark")                     # the bus stop sign
        box((0.5, 0.04, 0.5), (3.4, 0.9, 2.5), "white")
    tally("billboard")
    with frame((-236.0, -40.0, 0), rz=math.radians(-62)):                       # its face looks east, over the road
        for sx in (-3.0, 3.0):
            box((0.3, 0.3, 4.4), (sx, 0, 2.2), "steelDark")
            rod((sx, -1.6, 0), (sx, -0.1, 3.4), 0.06, "steelDark", 4)
        box((9.4, 0.25, 4.8), (0, 0.05, 6.5), "steelDark")
        box((9.0, 0.06, 4.4), (0, 0.2, 6.5), "white")
        quad((0, 0.24, 4.6), (-1, 0, 0), (0, 0, 1), 9.0, 0.5, "concrete", 0.01)  # the faded lower band
        # the painted rocket climbing (on the face, which looks +y in the frame)
        f = lambda pts: plate(pts, (0.6, 0.235, 5.0), (-1, 0, 0), (0, 0, 1), 0.02, "stencil")
        f([(-0.25, 0), (0.25, 0), (0.25, 2.6), (0, 3.4), (-0.25, 2.6)])
        f([(-0.25, 0), (-0.75, -0.4), (-0.25, 0.9)])
        f([(0.25, 0), (0.25, 0.9), (0.75, -0.4)])
        plate([(-0.15, -0.1), (0.15, -0.1), (0.0, -0.9)], (0.6, 0.236, 5.0), (-1, 0, 0), (0, 0, 1), 0.02, "white")
        stencil("41", (-1.2, 0.24, 5.5), (-1, 0, 0), (0, 0, 1), 1.6, m="stencil", t=0.02, gap=0.25)
        for k in range(8):                                                       # a catwalk under the board
            box((0.04, 0.6, 0.04), (-4.2 + k * 1.2, 0.4, 4.1), "steelDark")
        box((9.0, 0.04, 0.05), (0, 0.7, 4.95), "steelDark")
    tally("power line")
    # the wooden power line, 14 m north of the road, from the far west to the compound fence
    line = [(-1400, -88), (-1000, -55), (-640, -24), (-380, -11), (-200, -7), (-100, -6)]
    tops = pole_line(line, "wood", 48.0, wires=3, sagm=1.2, gaps=(3, 11), lean=0.03, seed=17)
    global W_TOPS
    W_TOPS = tops
    tally("vehicles and blocks")
    with frame((-152.0, 28.0, 0), rz=0.7, ry=0.03):                             # a stripped truck shell in the scrub
        box((2.3, 2.3, 1.9), (2.5, 0, 1.75), "steelDark")
        quad((3.66, 0, 2.15), (0, 1, 0), (0, 0, 1), 1.9, 0.7, "glass", 0.01)
        box((5.0, 2.2, 0.25), (-1.3, 0, 1.0), "steelDark")
        for sy in (-1.1, 1.1):
            box((5.0, 0.08, 0.6), (-1.3, sy, 1.42), "wood")
        for (wx, wy) in ((2.5, -1.0), (2.5, 1.0), (-2.6, -1.0)):
            cyl(0.5, 0.35, (wx, wy, 0.42), "steelDark", rot=(math.pi / 2, 0, 0), verts=8)
        box((0.4, 0.4, 0.42), (-2.6, 1.0, 0.21), "concrete")                     # propped on a block
    with frame((-290.0, -48.0, 0), rz=2.4):                                      # a car shell off the road
        box((4.1, 1.7, 0.75), (0, 0, 0.6), "white")
        box((2.0, 1.5, 0.6), (-0.2, 0, 1.25), "white")
        quad((0.82, 0, 1.25), (0, 1, 0), (0, 0, 1), 1.4, 0.5, "glass", 0.01)
    for k in range(6):
        concrete_block(-330 - k * 1.9, -12.5 + RND.uniform(-0.3, 0.3), RND.uniform(-0.3, 0.3))


# =====================================================================================================================
# siteNW: the apron and hangars, the water tower, the barracks, the slab road to them
# =====================================================================================================================
def arch_profile(W, Hw, H, n=12):
    """the cross-section of an arched hangar: walls Hw high, then a half ellipse up to H"""
    pts = [(-W / 2, 0.0)]
    for k in range(n + 1):
        t = math.pi * k / n
        pts.append((-W / 2 * math.cos(t), Hw + (H - Hw) * math.sin(t)))
    pts.append((W / 2, 0.0))
    return pts


def extrude_y(prof, y0, y1, m, inward=False):
    V = [(x, y0, z) for x, z in prof] + [(x, y1, z) for x, z in prof]
    n = len(prof)
    F = []
    for i in range(n - 1):
        f = [i, i + 1, n + i + 1, n + i]
        F.append(f[::-1] if inward else f)
    return mk("skin", V, F, m)


def arched_hangar(loc, W, D, H, door=0.0, rz=0.0, ribs=4, z0=0.2):
    """an arched hangar on the apron: rust skin with raised ribs, a dark inside, a front wall round a door opening and
    four sliding leaves (door: 0 shut, 1 the middle half open)"""
    Hw, t = 2.5, 0.35
    dw, dh = W * 0.78, H * 0.62
    out = arch_profile(W, Hw, H)
    inn = arch_profile(W - 2 * t, Hw, H - t)
    y0, y1 = -D / 2, D / 2
    with frame((loc[0], loc[1], z0), rz=rz):
        extrude_y(out, y0, y1, "rust")
        if door:
            extrude_y(inn, y0 + t, y1 - t, "ink", inward=True)
            poly([(x, y1 - t, z) for x, z in inn], "ink", (0, -1, 0))
        for k in range(ribs + 1):
            yy = y0 + 0.3 + (D - 0.6) * k / ribs
            tube([(x * 1.012, yy, z * 1.01 + 0.02) for x, z in out[1:-1]], 0.18, "rust", sides=4, caps=False)
        poly([(x, y1, z) for x, z in out], "rust", (0, 1, 0))
        front = [(-W / 2, 0)] + out[1:-1] + [(W / 2, 0), (dw / 2, 0), (dw / 2, dh), (-dw / 2, dh), (-dw / 2, 0)]
        poly([(x, y0, z) for x, z in front], "rust", (0, -1, 0))
        if door:
            fi = [(-W / 2 + t, 0)] + inn[1:-1] + [(W / 2 - t, 0), (dw / 2, 0), (dw / 2, dh), (-dw / 2, dh), (-dw / 2, 0)]
            poly([(x, y0 + t, z) for x, z in fi], "ink", (0, 1, 0))
            for sx in (-1, 1):
                poly([(sx * dw / 2, y0, 0), (sx * dw / 2, y0 + t, 0), (sx * dw / 2, y0 + t, dh), (sx * dw / 2, y0, dh)], "ink", (-sx, 0, 0))
            poly([(-dw / 2, y0, dh), (dw / 2, y0, dh), (dw / 2, y0 + t, dh), (-dw / 2, y0 + t, dh)], "ink", (0, 0, -1))
        box((dw + 2.0, 0.5, 0.6), (0, y0 - 0.3, dh + 0.3), "stateGreen")           # the door track beam
        lw = dw / 4
        for k in range(4):
            side = -1 if k < 2 else 1
            if door:
                xc = side * (dw / 2 - lw / 2 - (0.0 if k in (0, 3) else lw * (1 - door) * 1.0))
            else:
                xc = -dw / 2 + lw / 2 + k * lw
            yy = y0 - 0.15 - (0.25 if k in (1, 2) else 0.0)
            box((lw, 0.18, dh - 0.05), (xc, yy, dh / 2), "stateGreen")
            for zz in (dh * 0.33, dh * 0.66):
                quad((xc, yy - 0.09, zz), (-1, 0, 0), (0, 0, 1), lw - 0.3, 0.3, "concrete", 0.02)


def gabled_hangar(loc, W, D, Hw, H, rz=0.0, z0=0.2):
    with frame((loc[0], loc[1], z0), rz=rz):
        box((W, D, 1.2), (0, 0, 0.6), "concrete")
        box((W - 0.2, D - 0.2, Hw - 1.2), (0, 0, 1.2 + (Hw - 1.2) / 2), "rust")
        for sy in (-1, 1):
            poly([(-W / 2 + 0.1, sy * (D / 2 - 0.1), Hw), (W / 2 - 0.1, sy * (D / 2 - 0.1), Hw), (0, sy * (D / 2 - 0.1), H)], "rust", (0, sy, 0))
        L = math.hypot(W / 2 + 0.6, H - Hw + 0.3)
        a = math.atan2(H - Hw + 0.3, W / 2 + 0.6)
        for sx in (-1, 1):
            box((L, D + 1.0, 0.2), (sx * (W / 4 + 0.3) - 0 * sx, 0, (H + Hw - 0.3) / 2 + 0.1), "rust", rot=(0, sx * a, 0))
        # shut doors on the front, one leaf hanging askew
        dw = W * 0.7
        lw = dw / 3
        for k in range(3):
            xc = -dw / 2 + lw / 2 + k * lw
            r = (0, 0.06, 0) if k == 2 else (0, 0, 0)
            box((lw - 0.1, 0.2, Hw - 0.6), (xc, -D / 2 - 0.12, (Hw - 0.4) / 2 + 0.1 - (0.25 if k == 2 else 0)), "stateGreen", rot=r)
        box((dw + 1.0, 0.4, 0.5), (0, -D / 2 - 0.2, Hw - 0.1), "stateGreen")
        windows((-W / 2 + 0.1, D / 2 - 3, Hw - 1.2), (0, -1, 0), 0, 8, 1, 2.6, 1.0, D / 8.5, 0,
                [("glass", 3), ("ink", 3), ("wood", 1)], 9, 0.06)


def barracks(loc, rz, seed, L=36.0, Wd=11.0):
    """a two-storey barracks block with a low hipped roof, windows broken or boarded, two porches"""
    rnd = random.Random(seed)
    with frame((loc[0], loc[1], 0), rz=rz):
        box((L + 0.4, Wd + 0.4, 0.6), (0, 0, 0.3), "concrete")
        box((L, Wd, 6.2), (0, 0, 3.7), "concrete")
        box((L + 0.8, Wd + 0.8, 0.25), (0, 0, 6.9), "concrete")
        poly([(-L / 2, -Wd / 2, 7.02), (L / 2, -Wd / 2, 7.02), (L / 2 - 4, 0, 8.6), (-L / 2 + 4, 0, 8.6)], "rust", (0, -1, 1))
        poly([(L / 2, Wd / 2, 7.02), (-L / 2, Wd / 2, 7.02), (-L / 2 + 4, 0, 8.6), (L / 2 - 4, 0, 8.6)], "rust", (0, 1, 1))
        poly([(L / 2, -Wd / 2, 7.02), (L / 2, Wd / 2, 7.02), (L / 2 - 4, 0, 8.6)], "rust", (1, 0, 1))
        poly([(-L / 2, Wd / 2, 7.02), (-L / 2, -Wd / 2, 7.02), (-L / 2 + 4, 0, 8.6)], "rust", (-1, 0, 1))
        mats = [("glass", 4), ("ink", 3), ("wood", 1)]
        for sy, u in ((-1, (1, 0, 0)), (1, (-1, 0, 0))):
            x0 = -L / 2 + 2.0 if sy < 0 else L / 2 - 2.0
            windows((x0, sy * Wd / 2, 2.1), u, 0, 12, 2, 1.4, 1.5, 2.92, 3.0, mats, seed + sy, 0.07)
        for sx in (-1, 1):
            windows((sx * L / 2, sx * -2.5, 2.1), (0, sx, 0), 0, 3, 2, 1.2, 1.5, 2.5, 3.0, mats, seed + 5 + sx, 0.07)
        for px in (-L / 4, L / 4):                                                # porches on the -y side
            box((3.0, 1.8, 0.25), (px, -Wd / 2 - 0.9, 3.0), "concrete")
            box((2.6, 1.6, 0.5), (px, -Wd / 2 - 0.8, 0.25), "concrete")
            quad((px, -Wd / 2, 1.5), (1, 0, 0), (0, 0, 1), 1.4, 2.2, "stateGreen", 0.06)


def build_northwest():
    tally("slab road")
    causeway([(-205, -24), (-222, 30), (-246, 92), (-262, 140), (-300, 168)], 6.5, "asphalt", "earth", step=18.0, seed=21)
    tally("apron")
    box((210.0, 98.0, 0.2), (-392.0, 214.0, 0.1), "concrete")
    for (x0, x1, y) in ((-497, -287, 165.2), (-497, -287, 262.8)):              # broken edge slabs
        for k in range(5):
            box((RND.uniform(4, 9), 1.6, 0.18), (x0 + (x1 - x0) * (k + RND.random()) / 5, y + RND.uniform(-0.8, 0.8), 0.09),
                "concrete", rot=(0, 0, RND.uniform(-0.2, 0.2)))
    tally("hangars")
    arched_hangar((-405.0, 236.0), 42.0, 52.0, 16.0, door=0.85, ribs=3)
    arched_hangar((-468.0, 232.0), 28.0, 44.0, 11.5, door=0.0, ribs=2)
    gabled_hangar((-330.0, 232.0), 30.0, 46.0, 8.5, 13.0)
    tally("water tower")
    with frame((-238.0, 262.0, 0)):
        box((4.5, 4.5, 0.6), (0, 0, 0.3), "concrete")
        cyl(1.7, 20.0, (0, 0, 10.6), "concrete", verts=10)
        lathe([(1.7, 20.4), (4.2, 22.4), (4.2, 26.8), (3.9, 27.2), (0.6, 28.6)], "concrete", verts=12)
        torus(4.6, 0.04, (0, 0, 23.5), "rust", major=12, minor=3)
        for k in range(6):
            a = k * math.pi / 3
            rod((4.25 * math.cos(a), 4.25 * math.sin(a), 22.45), (4.6 * math.cos(a), 4.6 * math.sin(a), 23.5), 0.03, "rust", 3)
        for sx in (-0.25, 0.25):
            rod((sx, -1.85, 0.6), (sx, -1.85, 20.6), 0.03, "rust", 3)
        quad((0, -1.71, 4), (1, 0, 0), (0, 0, 1), 0.8, 2.0, "stateGreen", 0.04)
    tally("barracks")
    barracks((-214.0, 104.0), math.radians(-72), 30)
    barracks((-226.0, 150.0), math.radians(-72), 31)
    barracks((-292.0, 96.0), math.radians(-72), 32)
    barracks((-304.0, 138.0), math.radians(-72), 33)
    tally("odds")
    for (x, y, r) in ((-262, 176, 0.2), (-268, 179, 1.4), (-350, 175, 0.6), (-352, 177.2, 0.1)):
        concrete_block(x, y, r)
    with frame((-372.0, 182.0, 0.2), rz=0.4):                                    # an old tug on the apron
        box((3.6, 1.9, 1.0), (0, 0, 0.75), "stateGreen")
        box((1.4, 1.7, 1.1), (-0.9, 0, 1.8), "stateGreen")
        quad((-0.18, 0, 1.9), (0, 1, 0), (0, 0, 1), 1.4, 0.6, "glass", 0.01)
        for (wx, wy) in ((1.1, -0.95), (1.1, 0.95), (-1.1, -0.95), (-1.1, 0.95)):
            cyl(0.45, 0.3, (wx, wy, 0.45), "ink", rot=(math.pi / 2, 0, 0), verts=8)


# =====================================================================================================================
# siteN: the rail spur, the platform, wagons, buffer stop, telegraph poles, the north road
# =====================================================================================================================
RAIL_Y, EMB_H = 300.0, 1.2
GAUGE = 1.52


def box_wagon(x, seed, door=0.0):
    z = EMB_H + 0.17
    with frame((x, RAIL_Y, z)):
        for bx in (-4.6, 4.6):
            box((2.6, 2.2, 0.75), (bx, 0, 0.5), "steelDark")
        box((13.8, 2.9, 0.35), (0, 0, 1.05), "steelDark")
        box((13.8, 3.0, 2.9), (0, 0, 2.7), "oxide")
        box((13.9, 3.1, 0.35), (0, 0, 4.25), "oxide")
        for sy in (-1, 1):
            box((3.6, 0.12, 2.6), (door * 3.0, sy * 1.56, 2.65), "oxide")
        for sx in (-1, 1):
            for sy in (-0.85, 0.85):
                cyl(0.18, 0.5, (sx * 7.15, sy, 1.05), "steel", rot=(0, math.pi / 2, 0), verts=6)


def tank_wagon(x):
    z = EMB_H + 0.17
    with frame((x, RAIL_Y, z)):
        for bx in (-3.8, 3.8):
            box((2.6, 2.2, 0.75), (bx, 0, 0.5), "steelDark")
        box((11.6, 2.4, 0.3), (0, 0, 1.0), "steelDark")
        cyl(1.4, 10.6, (0, 0, 2.6), "steelDark", rot=(0, math.pi / 2, 0), verts=14)
        for sx in (-1, 1):
            cyl(1.3, 0.3, (sx * 5.4, 0, 2.6), "steelDark", rot=(0, math.pi / 2, 0), verts=14, r2=0.9)
            for sy in (-0.85, 0.85):
                cyl(0.18, 0.5, (sx * 5.95, sy, 1.0), "steel", rot=(0, math.pi / 2, 0), verts=6)
        cyl(0.55, 0.6, (0, 0, 4.2), "steelDark", verts=10)
        box((2.2, 0.06, 0.06), (0, 1.3, 4.2), "steel")
        box((2.2, 0.06, 0.06), (0, -1.3, 4.2), "steel")
        box((10.4, 0.04, 0.35), (0, -1.38, 2.6), "white")


def build_north():
    X0, X1 = -1350.0, 120.0
    tally("embankment and rails")
    bw, tw = 5.0, 2.4
    V = [(X0, RAIL_Y - bw, 0), (X1, RAIL_Y - bw, 0), (X1, RAIL_Y - tw, EMB_H), (X0, RAIL_Y - tw, EMB_H),
         (X0, RAIL_Y + bw, 0), (X1, RAIL_Y + bw, 0), (X1, RAIL_Y + tw, EMB_H), (X0, RAIL_Y + tw, EMB_H)]
    mk("emb", V, [[0, 1, 2, 3], [5, 4, 7, 6], [1, 5, 6, 2]], "earth")
    mk("ballast", [V[3], V[2], V[6], V[7]], [[0, 1, 2, 3]], "soot")
    for sy in (-GAUGE / 2, GAUGE / 2):
        box((X1 - X0 - 2, 0.08, 0.17), ((X0 + X1) / 2 - 1, RAIL_Y + sy, EMB_H + 0.085), "steel")
    for k in range(70):                                                          # sleepers by the platform
        x = -125.0 + k * 2.0
        V = [(x - 0.13, RAIL_Y - 1.35, EMB_H + 0.07), (x + 0.13, RAIL_Y - 1.35, EMB_H + 0.07),
             (x + 0.13, RAIL_Y + 1.35, EMB_H + 0.07), (x - 0.13, RAIL_Y + 1.35, EMB_H + 0.07)]
        mk("sleeper", V, [[0, 1, 2, 3]], "wood")
    tally("buffer stop")
    with frame((X1 - 2.0, RAIL_Y, EMB_H)):
        for sy in (-0.76, 0.76):
            rod((-2.4, sy, 0.15), (0, sy, 1.1), 0.08, "steelDark", 4)
            box((0.3, 0.3, 1.2), (0, sy, 0.6), "steelDark")
        box((0.4, 2.8, 0.45), (-0.1, 0, 1.0), "oxide")
        for k in range(3):
            box((0.42, 0.4, 0.46), (-0.1, -0.9 + k * 0.9, 1.0), "white")
    cyl(5.0, 2.4, (X1 + 4.0, RAIL_Y, 0.6), "earth", verts=8, r2=1.5)            # the earth heap behind it
    tally("platform and hut")
    PX0, PX1, PY = -110.0, 10.0, RAIL_Y - 7.4
    box((PX1 - PX0, 5.4, 1.3), ((PX0 + PX1) / 2, PY, 0.65), "concrete")
    quad(((PX0 + PX1) / 2, PY + 2.4, 1.3), (1, 0, 0), (0, 1, 0), PX1 - PX0, 0.4, "white", 0.03)
    for x in (PX0 - 4, PX1 + 4):                                                 # ramps at the ends
        sx = -1 if x < PX0 else 1
        V = [(x - sx * 4, PY - 2.7, 1.3), (x + sx * 0, PY - 2.7, 0.0), (x + sx * 0, PY + 2.7, 0.0), (x - sx * 4, PY + 2.7, 1.3)]
        poly(V, "concrete", (sx, 0, 1))
    with frame((-24.0, PY - 0.6, 1.3)):
        box((7.0, 3.6, 3.0), (0, 0, 1.5), "white")
        box((7.8, 4.4, 0.25), (0, 0, 3.12), "concrete")
        for sy in (-1, 1):
            for k in range(3):
                quad((-2.2 + k * 2.2, sy * 1.8, 1.7), (-sy, 0, 0), (0, 0, 1), 1.0, 1.1,
                     "steelDark", 0.04)
        stencil("41", (-1.1, -1.8, 2.4), (1, 0, 0), (0, 0, 1), 0.45, m="oxide")
    for k in range(5):                                                           # platform lamp posts
        x = PX0 + 10 + k * 25
        rod((x, PY - 2.2, 1.3), (x, PY - 2.2, 6.0), 0.07, "steelDark", 5)
        box((0.9, 0.2, 0.15), (x, PY - 2.0, 6.0), "steelDark")
    tally("wagons")
    box_wagon(-80.0, 1, door=0.4)
    box_wagon(-65.6, 2)
    tank_wagon(-40.0)
    with frame((-210.0, RAIL_Y + 12.0, 0), rz=0.25, rx=0.12):                    # an old wagon body dumped off the line
        box((12.0, 2.9, 2.8), (0, 0, 1.3), "oxide")
    tally("telegraph poles")
    pole_line([(-1340, RAIL_Y + 8), (100, RAIL_Y + 8)], "tele", 55.0, wires=2, sagm=0.8, gaps=(2, 3, 9, 16, 20),
              lean=0.12, seed=29, m_wire="steelDark")
    tally("north road")
    causeway([(-40, 85), (-42, 150), (-44, 230), (-46, 286)], 6.0, "concrete", "earth", step=16.0, ramp=("start",), seed=23)
    empty("siteNorthRoadEnd", (-40.0, 85.0, 0.0))


# =====================================================================================================================
# siteE: downrange markers, the telemetry tower, the observation post
# =====================================================================================================================
def lattice(base, top_r, base_r, H, levels, m, r_leg=0.12, r_br=0.05, legs=3, z0=0.0, feet="concreteOld"):
    """a tapering lattice mast: legs, a horizontal ring and cross braces at each level, footings when feet is set"""
    bx, by = base
    def at(k, z):
        f = z / H
        r = base_r + (top_r - base_r) * f
        a = math.pi / 2 + k * 2 * math.pi / legs
        return (bx + r * math.cos(a), by + r * math.sin(a), z0 + z)
    zs = [H * i / levels for i in range(levels + 1)]
    for k in range(legs):
        rod(at(k, 0), at(k, H), r_leg, m, 4)
        if feet:
            box((1.0, 1.0, 0.5), (at(k, 0)[0], at(k, 0)[1], 0.2), feet)
    for i in range(levels):
        for k in range(legs):
            rod(at(k, zs[i + 1]), at((k + 1) % legs, zs[i + 1]), r_br, m, 3)
            rod(at(k, zs[i]), at((k + 1) % legs, zs[i + 1]), r_br * 0.8, m, 3)
            rod(at((k + 1) % legs, zs[i]), at(k, zs[i + 1]), r_br * 0.8, m, 3)


def marker(x, y, seed):
    rnd = random.Random(seed)
    H = 13.0
    with frame((x, y, 0), rx=rnd.uniform(-0.03, 0.03)):
        box((1.4, 1.4, 0.5), (0, 0, 0.25), "concreteOld")
        cyl(0.13, H, (0, 0, 0.5 + H / 2), "white", verts=6)
        for k in range(3):
            tube([(0, 0, 2.5 + k * 3.6), (0, 0, 4.3 + k * 3.6)], 0.14, "stencil", sides=6, caps=False)
        # the diamond board, facing back up the range (-x)
        plate([(0, -1.4), (1.4, 0), (0, 1.4), (-1.4, 0)], (-0.15, 0, H + 1.0), (0, -1, 0), (0, 0, 1), 0.08, "white")
        plate([(0, -0.8), (0.8, 0), (0, 0.8), (-0.8, 0)], (-0.17, 0, H + 1.0), (0, -1, 0), (0, 0, 1), 0.02, "stencil")
        for k in range(3):
            a = k * 2 * math.pi / 3 + 0.4
            rod((0, 0, H * 0.75), (7.0 * math.cos(a), 7.0 * math.sin(a), 0.0), 0.015, "steelDark", 3)


def build_east():
    tally("markers")
    for i, (x, y) in enumerate(((190, 70), (330, -110), (520, 40), (790, -150), (1090, 60), (960, 260))):
        marker(x, y, 100 + i)
    tally("telemetry tower")
    TX, TY, TH = 700.0, 150.0, 38.0
    lattice((TX, TY), 1.2, 4.2, TH, 7, "steel")
    with frame((TX, TY, TH)):
        box((3.6, 3.6, 0.25), (0, 0, 0.12), "steelDark")
        box((2.2, 2.2, 2.0), (0, 0, 1.25), "white")
        for k in range(4):
            a = k * math.pi / 2
            rod((1.8 * math.cos(a) - 1.8 * math.sin(a), 1.8 * math.sin(a) + 1.8 * math.cos(a), 0.25),
                (1.8 * math.cos(a) - 1.8 * math.sin(a), 1.8 * math.sin(a) + 1.8 * math.cos(a), 1.3), 0.03, "steelDark", 3)
        for k in range(4):
            a = k * math.pi / 2
            p0 = (1.8 * math.cos(a) - 1.8 * math.sin(a), 1.8 * math.sin(a) + 1.8 * math.cos(a), 1.2)
            p1 = (1.8 * math.cos(a + math.pi / 2) - 1.8 * math.sin(a + math.pi / 2), 1.8 * math.sin(a + math.pi / 2) + 1.8 * math.cos(a + math.pi / 2), 1.2)
            rod(p0, p1, 0.03, "steelDark", 3)
        for (dx, dz, rz, ry) in ((-1.3, 1.6, math.pi, 0.5), (1.3, 1.0, 0.3, 0.3)):
            with frame((dx, 0, dz), rz=rz, ry=math.pi / 2 - ry):
                lathe([(0.0, 0.0), (0.6, 0.12), (1.1, 0.4), (1.05, 0.38), (0.0, -0.02)], "white", verts=10)
                rod((0, 0, 0), (0, 0, 0.9), 0.03, "steelDark", 3)
        rod((0.5, 0.5, 2.25), (0.5, 0.5, 8.0), 0.06, "steelDark", 4)
        sphere(0.25, (0.5, 0.5, 8.2), "beacon", segs=6, rings=4)
    empty("siteBeaconTelemetry", (TX + 0.5, TY + 0.5, TH + 8.2))
    with frame((TX - 9.0, TY - 4.0, 0), rz=0.1):                                  # the equipment hut at its foot
        box((5.0, 3.5, 2.8), (0, 0, 1.4), "white")
        box((5.6, 4.1, 0.2), (0, 0, 2.9), "concreteOld")
        quad((-2.5, 0.6, 1.1), (0, -1, 0), (0, 0, 1), 0.9, 2.0, "steelDark", 0.04)
        quad((-2.5, -0.9, 1.6), (0, -1, 0), (0, 0, 1), 1.0, 0.8, "glass", 0.04)
    for k in range(3):
        wire((TX - 6.5, TY - 4.0 + k * 0.1, 2.6), (TX - 1.5, TY + 0.5, 6.0 + k), 0.3, r=0.03)
    tally("observation post")
    with frame((430.0, 172.0, 0), rz=0.3):
        for sx in (-1.6, 1.6):
            for sy in (-1.6, 1.6):
                box((0.8, 0.8, 0.3), (sx, sy, 0.15), "concreteOld")
                rod((sx, sy, 0.3), (sx * 0.8, sy * 0.8, 5.0), 0.1, "steelDark", 4)
        for zz in (2.0, 3.6):
            for (a, b) in (((-1.4, -1.4), (1.4, -1.4)), ((1.4, -1.4), (1.4, 1.4)), ((1.4, 1.4), (-1.4, 1.4)), ((-1.4, 1.4), (-1.4, -1.4))):
                f = 1 - (zz - 0.3) / 4.7 * 0.5
                rod((a[0] * f / 0.875 * 0.875, a[1] * f, zz), (b[0] * f, b[1] * f, zz), 0.04, "steelDark", 3)
        with frame((0, 0, 5.0), rx=0.05, ry=-0.06):
            box((3.4, 3.4, 0.2), (0, 0, 0.1), "wood")
            box((3.0, 3.0, 2.2), (0, 0, 1.3), "wood")
            for (c, u) in (((-1.5, 0, 1.6), (0, -1, 0)), ((0, -1.5, 1.6), (1, 0, 0)), ((0, 1.5, 1.6), (-1, 0, 0))):
                quad(c, u, (0, 0, 1), 2.4, 0.7, "glass", 0.03)
            box((3.8, 3.6, 0.15), (0.3, 0, 2.55), "steelDark", rot=(0, 0.25, 0.08))   # the roof, slipped and sagging
        for k in range(10):
            rod((2.15, -0.25, 0.5 * k), (2.15, 0.25, 0.5 * k), 0.02, "steelDark", 3)
        for sy in (-0.25, 0.25):
            rod((2.15, sy, 0), (2.15, sy, 5.0), 0.03, "steelDark", 3)
    tally("instrument pads and a car")
    for (x, y, r) in ((262, 22, 0.2), (300, 92, 0.6), (640, -40, 1.1)):
        with frame((x, y, 0), rz=r):
            box((3.0, 3.0, 0.4), (0, 0, 0.2), "concreteOld")
            rod((0.6, 0.6, 0.4), (0.9, 0.7, 2.3), 0.06, "steelDark", 4)
            box((0.6, 0.5, 0.5), (-0.6, -0.5, 0.65), "steelDark")
    with frame((480.0, -62.0, 0), rz=0.9, rx=0.04):
        box((4.0, 1.7, 0.7), (0, 0, 0.55), "white")
        box((1.9, 1.5, 0.55), (-0.3, 0, 1.15), "white")
        quad((0.66, 0, 1.15), (0, 1, 0), (0, 0, 1), 1.3, 0.45, "glass", 0.01)


# =====================================================================================================================
# siteS: the range control tower, car park, prefabs, substation, concrete power lines, the old range town far off
# =====================================================================================================================
def build_south():
    tally("south road and car park")
    causeway([(-20, -80), (-24, -140), (-26, -205)], 6.0, "asphalt", "earth", step=15.0, ramp=("start",), seed=31)
    empty("siteSouthRoadEnd", (-20.0, -80.0, 0.0))
    causeway([(-40, -232), (-80, -214), (-118, -196)], 5.0, "asphalt", "earth", step=12.0, seed=32)
    box((40.0, 30.0, 0.18), (-24.0, -224.0, 0.09), "asphalt")
    for k in range(6):
        quad((-38 + k * 5.0, -230.0, 0.18), (0, 1, 0), (-1, 0, 0), 5.0, 0.15, "white", 0.03)
    for (x, y) in ((-40, -212), (-8, -238)):
        rod((x, y, 0.18), (x, y, 8.0), 0.09, "steelDark", 5)
        box((1.2, 0.3, 0.2), (x + 0.5, y, 8.0), "steelDark")
    with frame((-28.0, -232.0, 0.18), rz=0.15):                                 # the old bus, on flat tyres
        box((10.0, 2.5, 2.2), (0, 0, 1.55), "white")
        box((10.02, 2.52, 0.55), (0, 0, 0.75), "stateGreen")
        box((9.6, 2.3, 0.25), (0, 0, 2.75), "white")
        for sy in (-1, 1):
            quad((-0.4, sy * 1.25, 1.9), (sy * -1, 0, 0) if sy > 0 else (1, 0, 0), (0, 0, 1), 8.0, 0.8, "glass", 0.02)
        quad((5.0, 0, 1.8), (0, 1, 0), (0, 0, 1), 2.2, 1.1, "glass", 0.02)
        for (wx, wy) in ((3.4, -1.15), (3.4, 1.15), (-3.0, -1.15), (-3.0, 1.15)):
            cyl(0.5, 0.3, (wx, wy, 0.42), "steelDark", rot=(math.pi / 2, 0, 0), verts=8)
    tally("control tower")
    TX, TY = -60.0, -262.0
    with frame((TX, TY, 0)):
        box((7.4, 7.4, 17.0), (0, 0, 8.5), "concrete")
        box((24.0, 12.0, 7.0), (0, 11.5, 3.5), "concrete")
        box((24.6, 12.6, 0.4), (0, 11.5, 7.2), "concrete")
        windows((10.5, 17.5, 1.8), (-1, 0, 0), 0, 10, 2, 1.5, 1.3, 2.33, 3.2, [("glass", 5), ("steelDark", 2)], 61, 0.07)
        quad((4.0, 17.5, 1.3), (-1, 0, 0), (0, 0, 1), 2.6, 2.6, "steelDark", 0.07)
        for n_ in ((0, 1), (0, -1), (1, 0), (-1, 0)):                            # stair windows up each face
            for k in range(3):
                quad((n_[0] * 3.7, n_[1] * 3.7, 9.0 + k * 2.6), (-n_[1], n_[0], 0), (0, 0, 1), 1.0, 1.4, "glass", 0.06)
        box((10.4, 10.4, 0.45), (0, 0, 17.22), "concrete")
        a, b, z0, z1 = 4.4, 5.0, 17.45, 20.3
        V = [(-a, -a, z0), (a, -a, z0), (a, a, z0), (-a, a, z0), (-b, -b, z1), (b, -b, z1), (b, b, z1), (-b, b, z1)]
        mk("cab", V, [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], "glass")
        for (x, y) in ((-1, -1), (1, -1), (1, 1), (-1, 1), (0, -1), (1, 0), (0, 1), (-1, 0)):
            rod((x * a, y * a, z0), (x * b, y * b, z1), 0.07, "steelDark", 4)
        box((11.2, 11.2, 0.5), (0, 0, 20.55), "concrete")
        box((3.0, 3.0, 2.2), (2.6, 2.6, 21.9), "concrete")
        for (p, q) in (((-5.1, -5.1), (5.1, -5.1)), ((5.1, -5.1), (5.1, 5.1)), ((5.1, 5.1), (-5.1, 5.1)), ((-5.1, 5.1), (-5.1, -5.1))):
            rod((p[0], p[1], 18.45), (q[0], q[1], 18.45), 0.035, "steelDark", 3)
        for k in range(12):
            a2 = k / 12 * 4
            s = int(a2)
            f = a2 - s
            C = ((-5.1, -5.1), (5.1, -5.1), (5.1, 5.1), (-5.1, 5.1), (-5.1, -5.1))
            x = C[s][0] + (C[s + 1][0] - C[s][0]) * f
            y = C[s][1] + (C[s + 1][1] - C[s][1]) * f
            rod((x, y, 17.45), (x, y, 18.45), 0.025, "steelDark", 3)
    lattice((TX - 2.0, TY - 2.0), 0.3, 0.9, 11.0, 4, "steelDark", r_leg=0.07, r_br=0.03, z0=20.8, feet=None)
    sphere(0.3, (TX - 2.0, TY - 2.0, 20.8 + 11.3), "beacon", segs=6, rings=4)
    rod((TX - 2.0, TY - 2.0, 20.8 + 11.0), (TX - 2.0, TY - 2.0, 20.8 + 11.1), 0.05, "steelDark", 3)
    empty("siteBeaconTower", (TX - 2.0, TY - 2.0, 20.8 + 11.3))
    tally("prefabs")
    for i, (x, y, rz, L, W, m) in enumerate(((-104, -248, 0.1, 12.0, 6.0, "white"), (-98, -286, -0.2, 9.0, 3.0, "stateGreen"),
                                              (-14, -284, 0.05, 12.0, 6.0, "white"), (8, -262, 1.5, 6.0, 2.6, "stateGreen"))):
        with frame((x, y, 0), rz=rz):
            box((L + 0.2, W + 0.2, 0.4), (0, 0, 0.2), "steelDark")
            box((L, W, 2.6), (0, 0, 1.7), m)
            box((L + 0.3, W + 0.3, 0.15), (0, 0, 3.07), m)
            if m == "white":
                box((L + 0.04, W + 0.04, 0.35), (0, 0, 0.55), "stateGreen")
            for k in range(int(L // 3)):
                quad((-L / 2 + 1.5 + k * 3.0, -W / 2, 1.9), (1, 0, 0), (0, 0, 1), 1.1, 0.8, "glass", 0.04)
            quad((L / 2, 0, 1.4), (0, 1, 0), (0, 0, 1), 0.9, 1.9, "steelDark", 0.04)
    tally("substation")
    SX, SY = -128.0, -186.0
    with frame((SX, SY, 0), rz=0.12):
        box((16.0, 12.0, 0.25), (0, 0, 0.125), "concrete")
        for k in range(3):
            x = -4.5 + k * 4.5
            box((2.2, 1.6, 2.0), (x, -1.5, 1.25), "stateGreen")
            for sy in (-1, 1):
                box((1.8, 0.25, 1.5), (x, -1.5 + sy * 0.92, 1.15), "stateGreen")
            for k2 in range(3):
                cyl(0.08, 0.7, (x - 0.6 + k2 * 0.6, -1.5, 2.6), "white", verts=5)
        for sx in (-6.5, 6.5):
            box((0.35, 0.35, 7.5), (sx, 2.5, 4.0), "steelDark")
        box((13.4, 0.3, 0.4), (0, 2.5, 7.5), "steelDark")
        for k in range(3):
            cyl(0.07, 0.6, (-3 + k * 3, 2.5, 7.0), "white", verts=5)
            wire((-3 + k * 3, 2.5, 6.7), (-4.5 + k * 4.5, -1.5, 2.9), 0.4, r=0.03)
        P = [(-9, -7), (9, -7), (9, 7), (-9, 7)]
        for i in range(4):
            a, b = P[i], P[(i + 1) % 4]
            n = int(math.hypot(b[0] - a[0], b[1] - a[1]) / 4.5)
            for k in range(n):
                f = k / n
                x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
                rod((x, y, 0), (x, y, 2.2), 0.04, "steelDark", 3)
            for z in (0.3, 1.2, 2.1):
                rod((a[0], a[1], z), (b[0], b[1], z), 0.015, "steelDark", 3)
    tally("power lines")
    # from the main road's line south to the substation, then to the tower and on to the compound's south fence
    pole_line([(-196, -6), (-192, -60), (-170, -120), (-140, -170), (-132, -180)], "concrete", 44.0, wires=3, sagm=1.0, seed=37)
    pole_line([(-122, -194), (-96, -222), (-70, -248)], "concrete", 40.0, wires=3, sagm=0.8, seed=38)
    pole_line([(-118, -180), (-70, -150), (-28, -116), (12, -88)], "concrete", 44.0, wires=3, sagm=1.0, seed=39)
    with frame((14.0, -86.0, 0)):
        box((0.8, 0.5, 1.2), (0, 0, 0.6), "stateGreen")
    tally("range town")
    # the old range town, far to the south-west: panel blocks and the boiler-house chimney
    for i, (x, y, rz, L, fl) in enumerate(((-720, -640, 0.3, 64.0, 5), (-640, -720, 0.3, 48.0, 5), (-800, -560, 0.3, 64.0, 4),
                                            (-560, -800, 1.87, 40.0, 9))):
        H = fl * 2.9
        with frame((x, y, 0), rz=rz):
            box((L, 12.0, H), (0, 0, H / 2), "concrete")
            box((L + 0.4, 12.4, 0.6), (0, 0, H + 0.3), "concrete")
            for f in range(fl):
                for sy in (-1, 1):
                    quad((0, sy * 6.0, 1.9 + f * 2.9), (-1, 0, 0) if sy > 0 else (1, 0, 0), (0, 0, 1), L - 3.0, 1.2, "glass", 0.25)
    with frame((-610.0, -560.0, 0)):
        box((30.0, 18.0, 9.0), (0, 0, 4.5), "concrete")
        quad((0, -9.0, 6.0), (1, 0, 0), (0, 0, 1), 26.0, 2.0, "glass", 0.25)
        cyl(2.6, 46.0, (22.0, 0, 23.0), "concrete", verts=10, r2=1.5)
        for z in (40.0, 43.5):
            tube([(22.0, 0, z), (22.0, 0, z + 1.6)], 1.75 - (z - 40.0) * 0.02, "white", sides=10, caps=False)


# =====================================================================================================================
# siteScrub: scrub clumps over the flat and the dirt tracks
# =====================================================================================================================
def build_scrub():
    tally("scrub")
    rnd = random.Random(77)
    n = 0
    while n < 80:
        a = rnd.uniform(0, 2 * math.pi)
        d = 120 + (1100 - 120) * rnd.random() ** 1.6
        x, y = d * math.cos(a), d * math.sin(a)
        if -100 < x < 110 and -85 < y < 90:
            continue
        if -500 < x < -280 and 160 < y < 270:          # the apron
            continue
        if abs(y - RAIL_Y) < 7 and x < 125:            # the embankment
            continue
        if -75 < x < 10 and -300 < y < -200:           # the tower and car park
            continue
        scrub_patch(x, y, rnd.uniform(3, 9), rnd.randint(2, 4), 1000 + n)
        n += 1
    tally("tracks")
    track([(105, 12), (300, 40), (500, 100), (690, 140)], 2.6)
    track([(300, 40), (330, -60), (330, -104)], 2.2)
    track([(-300, 168), (-280, 230), (-200, 280), (-110, 290)], 2.6)
    track([(-150, -32), (-160, 0), (-152, 24)], 2.2)
    track([(-26, -205), (40, -240), (160, -260), (300, -330)], 2.4)


build_west()
site_group("siteW")
build_northwest()
site_group("siteNW", levels=(0.0, 0.2))
build_north()
site_group("siteN", levels=(0.0, EMB_H, 1.3))
build_east()
site_group("siteE")
build_south()
site_group("siteS", levels=(0.0, 0.18, 0.25))
build_scrub()
site_group("siteScrub")
empty("siteRoadEnd", (-95.0, -20.0, 0.0))

# no AO on far scenery: drop the empty vertex colour layer so the glb carries no COLOR_0 (the game then uses plain colour)
for ob in scene.objects:
    if ob.type == "MESH":
        if "Color" in ob.data.color_attributes:
            ob.data.color_attributes.remove(ob.data.color_attributes["Color"])
        if "_bake" in ob:
            del ob["_bake"]
finish_all(OUT, T0, ao=False)
