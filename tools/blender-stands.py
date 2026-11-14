"""Burn Rate: build models/stand1.glb (Stand 1, the old state booster stand) and models/chamber.glb (the old programme's
altitude chamber) with scripted Blender. Burn Rate 1.6, the bigger range.

No Blender UI and no hand modelling: every slab, beam, bolt and sandbag is placed by this script, so the models can be
rebuilt and changed by editing numbers. Run it headless from the repo root:

    python3 tools/blender-stands.py              both models
    python3 tools/blender-stands.py stand1       only models/stand1.glb
    python3 tools/blender-stands.py chamber      only models/chamber.glb
    add "render" (and set BRN_RENDER_DIR) to also save check renders from the game's camera points

Commit the .glb files with this script. Both are built in the same world frame as models/range.glb (Blender Z up,
metres, Stand 2 at the origin, every stand's exhaust along +X), so the game loads them into one scene unmoved. Blender
is Z-up; the exporter turns it Y-up, so Blender (x, y, z) is three.js (x, z, -y). Shared helpers: tools/blender_parts.py
(the palette, frames, plates, bolts, stencils, sandbags, finish_all) on tools/blender_lib.py.

Stand 1 (models/stand1.glb), groups:
  - stand1: the old state booster stand at (30, 38), exhaust east. Concrete pad cast in slabs; a massive stepped
    concrete thrust block with side buttresses, a big stencil "1", chevrons, tie holes, a beacon; a heavy steel thrust
    frame (H columns, cross beams, struts into the block, a thick thrust plate); the 40 kN load cell assembly (flange,
    stainless cell, flexure discs, a live adapter plate hung on flexure blades from a crosshead, the thrust tube and
    adapter face) and a calibration ram with its reference cell, hose and hand pump; twin heavy rails on a concrete rail
    bed with sole plates and anchor bolts; five screw-jack saddle supports; a deluge pipe loop with spray nozzles; a
    drain channel; a long concrete flame apron with curbs, scorch marks and a scorched sloped deflector in an earth berm;
    earth banks behind the block and on the +Y side (beyond the side camera), a low retaining wall on -Y; a rusty
    overhead gantry crane on runway girders (all above z 6); the old state-green instrumentation hut, cable trays,
    sandbags, an "OПACHO" (danger) warning board, two floodlight masts aimed at the stand, worn ground, ruts, the
    covered cable trench to the bunker.
  - stand1Bunker: Stand 1's bunker at (31, 1), a smaller cousin of the range blockhouse: earth-banked concrete, the
    armoured slit window facing the stand (+Y), its shutter hanging open, periscopes, vents, a short antenna mast, the
    blast door on the -X end down a cut between retaining walls, a cable pit.

The altitude chamber (models/chamber.glb), groups:
  - chamber: the outside. A 3.4 m steel vacuum tank, x 15..24 on y = -58, axis z 1.9, on concrete saddles; stiffening
    rings, colour bands, flanges; the hinged forward dome door (shut: hinges, swing clamps); viewports, instrument
    feedthroughs and their cables; a top walkway with handrails and a caged ladder; the aft head and the 1.2 m supersonic
    diffuser on pedestals to the ejector / cooling spray section (spray rings, steam nozzles) and a 10 m silencer stack
    with rings, a caged ladder and platform; the vacuum pump house with its vacuum line and gate valve, the steam line
    and the spray water header; a motor trolley on a short track in front of the door; stencils.
  - chamberIn: the inside of the tank (the game puts cameras in it): inner shell (inward faces), frames, the inner face
    of the door dome and the aft head, the diffuser's bell mouth inlet at x 22.5, a grating deck, the thrust stand bed
    (rails, thrust frame, load cell, flexures, calibration ram, four screw-jack saddle supports), caged lamps, the
    camera port, viewports, feedthroughs and cables.

Nodes the game reads (Blender world coordinates):
  s1Mount (30, 38, 1.30) motor forward end, axis +X; s1Cradle0..4 at x 30.30, 30.75, 31.20, 31.65, 32.05, y 38, z 1.02;
  s1Low (30.9, 38, 0.62) top of the rails; s1Window (31.0, 3.6, 1.9) just outside the bunker slit; s1Lamp0, s1Lamp1
  floodlight heads. s0Mount (17, -58, 1.9); s0Cradle0..3 at x 17.25, 17.70, 18.15, 18.55, y -58, z 1.62; s0Low
  (17.8, -58, 1.25); s0Lamp0, s0Lamp1 the caged lamps; s0Cam (19.5, -59.2, 2.6) the camera port; s0Out (12, -48, 4)
  outside viewpoint; s0Outlet top centre of the silencer stack; s0TankA (15.2, -58, 1.9), s0TankB (23.8, -58, 1.9),
  inner radius 1.65 m.

Kept clear: Stand 1's axis (nothing within 0.2 m from x 30.0 to 32.1 but the cradle tops); +Y of the motor for 8 m
(only low curbs, the deluge pipe and the drain); -Y walls under 0.9 m within 12 m of the motor; the line from s1Window
to the motor; 10 m of exhaust path (the deflector starts 14 m past the mount). In the chamber, the axis from x 17 to
22.5 and the view from s0Out over the tank, diffuser and stack.

Budget: each file at most 650 kB (about 40 bytes a vertex, 6 a triangle). tally() prints what each section costs.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_parts import *          # noqa: F401,F403
from blender_parts import GROUP, MATS, keep, _box, _cyl
import bpy, bmesh
from mathutils import Vector, Matrix

RX = (0, math.pi / 2, 0)        # a cylinder (or lathe) along +X
RYc = (math.pi / 2, 0, 0)       # a cylinder along Y

ARGS = [a.lower() for a in sys.argv[1:]]
RENDER = "render" in ARGS
RDIR = os.environ.get("BRN_RENDER_DIR", os.path.join(ROOT, "tmp-renders"))
COST = "cost" in ARGS            # add "cost" to print what each section costs in exported vertices (a budget aid)

_SECS = []
KINDS = {}
_tally = tally


def tally(label):
    """the shared tally (triangles per section), plus a note of where each section starts for the "cost" report"""
    _SECS.append((len(GROUP), label))
    _tally(label)


def group(name, levels=(0.0,)):
    """finish_group, and with "cost" a list of the vertices each section really exports (hard edges and UV seams
    split vertices; a glb costs about 40 bytes a vertex and 6 a triangle)"""
    if COST:
        bounds = _SECS + [(len(GROUP), None)]
        for k in range(len(bounds) - 1):
            for o in GROUP[bounds[k][0]:bounds[k + 1][0]]:
                kind = KINDS.setdefault(o.name.split(".")[0], len(KINDS))
                a = o.data.attributes.new("sec", "INT", "FACE")
                a.data.foreach_set("value", [k * 100 + kind] * len(o.data.polygons))
    o = finish_group(name, levels)
    if COST:
        me = o.data
        sa, uv, cn = me.attributes["sec"].data, me.uv_layers.active.data, me.corner_normals
        keys, tris = {}, {}
        for p in me.polygons:
            k = sa[p.index].value
            tris[k] = tris.get(k, 0) + len(p.vertices) - 2
            ks = keys.setdefault(k, set())
            for li in p.loop_indices:
                n, u = cn[li].vector, uv[li].uv
                ks.add((me.loops[li].vertex_index, round(n.x, 2), round(n.y, 2), round(n.z, 2), round(u.x, 3),
                        round(u.y, 3)))
        inv = {v: n for n, v in KINDS.items()}
        for k in sorted(keys):
            if len(keys[k]) > 150:
                print("      %-28s %-10s %5d verts" % (_SECS[k // 100][1], inv[k % 100], len(keys[k])))
        merged_k, merged_t = {}, {}
        for k in keys:
            merged_k.setdefault(k // 100, set()).update(keys[k])
            merged_t[k // 100] = merged_t.get(k // 100, 0) + tris[k]
        keys, tris = merged_k, merged_t
        tot = 0
        for k in sorted(keys):
            b = len(keys[k]) * 40 + tris[k] * 6
            tot += b
            print("    cost %-26s %6d verts %6d tris ~%4d kB" % (_SECS[k][1] if k < len(_SECS) else "?", len(keys[k]),
                                                                   tris[k], b // 1000))
        print("    cost %-26s ~%d kB" % (name, tot // 1000))
        me.attributes.remove(me.attributes["sec"])
    _SECS.clear()
    return o


# =====================================================================================================================
# small helpers on top of blender_parts
# =====================================================================================================================
def beam(p0, p1, w, h, m, bevel=0.0):
    """a box from p0 to p1 (w across, h up), for braces and arms"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    M = Matrix.Translation((p0 + p1) / 2) @ Vector((1, 0, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    with frame(M=M):
        box((d.length, w, h), (0, 0, 0), m, bevel=bevel)


def hcol(x, y, z0, z1, b=0.22, tf=0.018, tw=0.012, m="steelDark"):
    """an H column standing from z0 to z1, its flanges facing +-X (they take the thrust)"""
    h, zc = z1 - z0, (z0 + z1) / 2
    for s in (-1, 1):
        box((tf, b, h), (x + s * (b / 2 - tf / 2), y, zc), m)
    box((b - 2 * tf, tw, h), (x, y, zc), m)


def ibeam_x(x0, x1, yc, zb, b, h, tf, tw, m):
    """an I beam along X from x0 to x1, its foot at zb, centred on yc"""
    P = [(-b / 2, 0), (b / 2, 0), (b / 2, tf), (tw / 2, tf), (tw / 2, h - tf), (b / 2, h - tf), (b / 2, h),
         (-b / 2, h), (-b / 2, h - tf), (-tw / 2, h - tf), (-tw / 2, tf), (-b / 2, tf)]
    return plate([(yc + a, zb + c) for a, c in P], (x0, 0, 0), (0, 1, 0), (0, 0, 1), x1 - x0, m)


def hbeam_y(x, y0, y1, zc, b, m, tf=0.016, tw=0.011):
    """an I beam along Y (flanges top and bottom), centred at height zc"""
    L, yc = y1 - y0, (y0 + y1) / 2
    for s in (-1, 1):
        box((b, L, tf), (x, yc, zc + s * (b / 2 - tf / 2)), m)
    box((tw, L, b - 2 * tf), (x, yc, zc), m)


def tray(p0, p1, z, w=0.3, m="steel", z_foot=0.0, step=2.6):
    """an open cable tray from p0 to p1 (ground points, along X or Y) at height z, on posts"""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    L = d.length
    with frame((p0.x, p0.y, 0), rz=math.atan2(d.y, d.x)):
        box((L + w, w, 0.01), (L / 2, 0, z), m)
        for s in (-1, 1):
            box((L + w, 0.008, 0.07), (L / 2, s * w / 2, z + 0.035), m)
        n = max(1, int(L / step))
        for k in range(n + 1):
            x = L * k / n
            box((0.04, 0.04, z - z_foot - 0.03), (x, w / 2 + 0.03, (z + z_foot - 0.03) / 2), "steelDark")
            box((0.04, w + 0.1, 0.03), (x, 0.02, z - 0.02), "steelDark")


def flood_mast(x, y, aim, H=10.5):
    """a floodlight mast at (x, y) with four lamp heads aimed at aim; returns the lamp cluster centre (local frame of the
    caller)"""
    yaw = math.atan2(aim[1] - y, aim[0] - x)
    dist = math.hypot(aim[0] - x, aim[1] - y)
    pitch = math.atan2(H + 0.6 - aim[2], dist)
    with frame((x, y, 0), rz=yaw):
        box((0.8, 0.8, 0.3), (0, 0, 0.1), "concrete")
        box((0.42, 0.42, 0.025), (0, 0, 0.2625), "steel")
        cyl(0.14, H, (0, 0, 0.275 + H / 2), "steel", verts=8, r2=0.075)
        box((0.18, 0.3, 0.4), (-0.18, 0, 1.4), "stateGreen")
        tube([(-0.12, 0, 1.25), (-0.12, 0, 0.3), (-0.3, 0, 0.0)], 0.02, "steelDark", sides=4)
        for zz in (H + 0.1, H + 1.0):
            box((0.08, 1.6, 0.08), (0.1, 0, zz), "steel")
        for sy in (-0.76, 0.76):
            box((0.08, 0.08, 0.98), (0.1, sy, H + 0.55), "steel")
        for (ly, lz) in ((-0.4, H + 0.35), (0.4, H + 0.35), (-0.4, H + 0.82), (0.4, H + 0.82)):
            with frame((0.26, ly, lz), ry=pitch):
                box((0.14, 0.42, 0.34), (0, 0, 0), "steelDark")
                plate(rect(-0.18, -0.14, 0.18, 0.14), (0.07, 0, 0), (0, 1, 0), (0, 0, 1), 0.003, "lamp")
    c, s = math.cos(yaw), math.sin(yaw)
    return (x + 0.33 * c, y + 0.33 * s, H + 0.58)


def sign_board(x, y, rz, title, lines=3, w=1.5, h=0.95, z=1.3):
    """an old range warning board on two posts: red header with white stencil text, black text lines, a symbol; it
    faces local -Y (turn it with rz)"""
    with frame((x, y, 0), rz=rz):
        for sx in (-w / 2 + 0.12, w / 2 - 0.12):
            box((0.06, 0.06, z + h / 2 + 0.05), (sx, 0.04, (z + h / 2 + 0.05) / 2), "steelDark")
        box((w, 0.03, h), (0, 0, z), "white")
        plate(rect(-w / 2 + 0.04, h / 2 - 0.3, w / 2 - 0.04, h / 2 - 0.04), (0, -0.016, z), (1, 0, 0), (0, 0, 1), 0.002,
              "stencil")
        stencil(title, (-w / 2 + 0.16, -0.019, z + h / 2 - 0.26), (1, 0, 0), (0, 0, 1), 0.18, m="white", t=0.002)
        for k in range(lines):
            plate(rect(-w / 2 + 0.1, h / 2 - 0.42 - k * 0.12, w / 2 - 0.45 - (k % 2) * 0.25, h / 2 - 0.36 - k * 0.12),
                  (0, -0.016, z), (1, 0, 0), (0, 0, 1), 0.002, "ink")
        disc((w / 2 - 0.25, -0.016, z - 0.12), (0, -1, 0), 0.15, "stencil", 10, 0.002)
        disc((w / 2 - 0.25, -0.016, z - 0.12), (0, -1, 0), 0.11, "white", 10, 0.003)
        box((0.03, 0.004, 0.13), (w / 2 - 0.25, -0.022, z - 0.11), "ink")


def saddle_support(x, ytop, rail_top, top, half=0.42, m="steelDark"):
    """a screw-jack saddle support standing on twin rails: cross beam, clamp plates, jack, screw, saddle plate whose top
    face is at `top` (the game builds the saddle from there up to the motor)"""
    box((0.08, 2 * half, 0.06), (x, ytop, rail_top + 0.03), m)
    z = rail_top + 0.06
    cyl(0.036, 0.082, (x, ytop, z + 0.041), m, verts=8)
    cyl(0.016, top - 0.025 - (z + 0.082), (x, ytop, (top - 0.025 + z + 0.082) / 2), "steel", verts=6)
    cyl(0.024, 0.013, (x, ytop, top - 0.0185), "steel", verts=8)
    box((0.09, 0.24, 0.012), (x, ytop, top - 0.006), m)
    for yy in (-0.11, 0.11):
        box((0.09, 0.012, 0.028), (x, ytop + yy, top + 0.014), m)



# =====================================================================================================================
# STAND 1: built in its own frame, origin (30, 38) on the ground: the motor's forward end is local (0, 0, 1.30)
# =====================================================================================================================
S1 = (30.0, 38.0)
AZ1 = 1.30
PAD1 = 0.25
CR1 = [0.30, 0.75, 1.20, 1.65, 2.05]
CTOP1 = 1.02
RAIL1 = 0.62
F0, F1, CRH, FW = 16.0, 18.6, 3.4, 3.6      # the deflector: foot, top of the slope, crest height, half width
BK = (31.0, 1.0)                           # the bunker's origin (world); its slit faces +Y


def W1(x, y, z):
    return (S1[0] + x, S1[1] + y, z)


def h1(x, y):
    """the earth round the bay (local frame): a bank behind the thrust block, a high bank on +Y beyond the side camera,
    a low bank behind the -Y retaining wall, and the deflector berm downrange"""
    hs = [0.0]
    if x < -4.6:
        f = 1 - smooth01((abs(y) - 2.8) / 2.0)
        hs.append(3.1 * (1 - smooth01((-4.6 - x) / 5.0)) * f)
    if y > 9.3:
        r = smooth01((y - 9.3) / 2.0) * (1 - smooth01((y - 12.6) / 3.2))
        f = (1 - smooth01((-8.5 - x) / 2.5)) * (1 - smooth01((x - 17.0) / 3.5))
        hs.append(3.2 * r * f)
    if y < -4.35 and -3.0 < x < 18.0:
        f = smooth01((x + 3.0) / 1.5) * (1 - smooth01((x - 16.2) / 1.8))
        hs.append(0.74 * (1 - smooth01((-4.35 - y) / 3.2)) * f)
    if x > 14.0:
        if x < F1:
            b = CRH * smooth01((x - 14.0) / (F1 - 14.0))
        elif x < 19.8:
            b = CRH
        else:
            b = CRH * (1 - smooth01((x - 19.8) / 4.0))
        hs.append(b * (1 - smooth01((abs(y) - FW) / 3.4)))
    h = max(hs)
    if h > 0.15:
        h += 0.07 * math.sin(1.3 * x + 0.7 * y) + 0.05 * math.sin(2.1 * y - 0.8 * x) + 0.03 * math.sin(3.3 * x + 2.9 * y)
    return h - 0.06


def build_stand1():
    Z = PAD1
    tally("pad, drain, apron")
    # ---- the pad: slabs with sealed joints; footing under the block; a drain channel along the +Y edge ----
    XB, YB, g = [-1.25, 1.0, 3.2], [-3.2, -1.1, 1.1, 3.2], 0.014
    for i in range(2):
        for j in range(3):
            xa, xb, ya, yb = XB[i] + g / 2, XB[i + 1] - g / 2, YB[j] + g / 2, YB[j + 1] - g / 2
            o = box((xb - xa, yb - ya, Z), ((xa + xb) / 2, (ya + yb) / 2, Z / 2), "concrete")
            densify(nb(o), 2.3)
    plate(rect(-1.25, -3.2, 3.2, 3.2), (0, 0, Z - 0.03), (1, 0, 0), (0, 1, 0), 0.01, "sealant")
    o = box((3.35 - g, 6.6, Z), (-2.925 - g / 2, 0, Z / 2), "concreteDark")             # footing x -4.6..-1.25
    densify(nb(o), 2.4)
    box((4.45, 0.3, 0.04), (0.975, 3.375, 0.08), "concreteDark")                       # drain channel floor
    nb(box((4.45, 0.1, Z), (0.975, 3.6, Z / 2), "concrete"))                           # its outer lip
    for k in range(6):                                                                  # grating bars
        box((0.03, 0.32, 0.02), (-1.0 + k * 0.85, 3.375, Z - 0.012), "steel")
    # ---- the flame apron: lower slabs east of the pad, curbs, scorch ----
    XA, YA = [3.2, 6.4, 9.6, 12.8, 16.0], [-3.0, 0.0, 3.0]
    for i in range(4):
        for j in range(2):
            xa, xb, ya, yb = XA[i] + g / 2, XA[i + 1] - g / 2, YA[j] + g / 2, YA[j + 1] - g / 2
            nb(box((xb - xa, yb - ya, 0.12), ((xa + xb) / 2, (ya + yb) / 2, 0.06), "concreteOld"))
    for sy in (-1, 1):
        o = box((12.8, 0.3, 0.42), (9.6, sy * 3.15, 0.21), "concrete")
        densify(nb(o), 3.3)
    rnd = random.Random(17)
    for k, (cx, r) in enumerate(((5.2, 1.1), (8.6, 1.9), (12.6, 2.6))):
        blob(cx, rnd.uniform(-0.2, 0.2), r, 0.122, "concreteDark", seed=60 + k, n=16, squash=0.75)
        blob(cx + 0.3, rnd.uniform(-0.1, 0.1), r * 0.55, 0.125, "soot", seed=70 + k, n=12, squash=0.7)

    # ---- the -Y retaining wall (top 0.86: the bunker window and the side camera see over it), its hazard band ----
    o = box((18.5, 0.3, 0.8), (6.95, -4.2, 0.4), "concreteOld")
    densify(nb(o), 3.2)
    box((18.6, 0.38, 0.06), (6.95, -4.2, 0.83), "concrete")
    chevrons((2.4, -4.05, 0.46), (-1, 0, 0), (0, 0, 1), 3.0, 0.18, 0.14)

    tally("deflector")
    # ---- downrange: a scorched sloped concrete deflector set in an earth berm ----
    sl = math.hypot(F1 - F0, CRH)
    vd = ((F1 - F0) / sl, 0, CRH / sl)
    o = plate(rect(0, -0.06, 2 * FW, sl + 0.02), (F0 - 0.04, FW, -0.06), (0, -1, 0), vd, 0.35, "concreteOld")
    densify(o, 1.9)
    o = box((1.2, 2 * FW, 0.3), (F1 + 0.35, 0, CRH + 0.05), "concreteOld")
    densify(o, 2.5)
    nrm = Vector((0, -1, 0)).cross(Vector(vd))

    def scorch(ru, rv, lift, m, ph, amp):
        pts = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            gg = 1 + amp * math.sin(3 * a + ph) + 0.12 * math.sin(7 * a + 2 * ph) + 0.07 * math.sin(11 * a + 3 * ph)
            pts.append((FW + ru * gg * math.cos(a), 1.5 + rv * gg * math.sin(a) * (1.15 if math.sin(a) > 0 else 0.8)))
        plate(pts, Vector((F0 - 0.04, FW, -0.06)) + nrm * (0.35 + lift), (0, -1, 0), vd, 0.003, m)
    scorch(2.8, 1.4, 0.0, "concreteDark", 0.4, 0.06)
    scorch(1.5, 0.8, 0.004, "soot", 1.7, 0.2)

    tally("earth banks")
    xs = grid(-11.5, 24.0, 1.25, (-4.6, -1.25, 3.2, F0 - 0.4, F1, 19.8))
    ys = grid(-8.5, 16.0, 1.25, (-4.35, -3.3, 3.3, -FW, FW, 9.3))

    def skip(cx, cy):
        if -4.6 < cx < 3.6 and abs(cy) < 3.65:
            return True                                     # pad, footing, block
        if 3.2 < cx < F0 and abs(cy) < 3.3:
            return True                                     # apron
        if F0 - 0.5 < cx < F1 + 0.9 and abs(cy) < FW - 0.05:
            return True                                     # under the deflector
        return all(h1(cx + dx, cy + dy) < -0.04 for dx in (-0.63, 0, 0.63) for dy in (-0.63, 0, 0.63))
    heightfield(xs, ys, h1, "earth", skip=skip)

    tally("thrust block")
    # ---- the thrust block: a rear monolith, a lower front step, buttresses, a cap; tie holes, chevrons, a big "1" ----
    o = box((2.3, 5.6, 3.05), (-3.45, 0, Z + 1.525), "concreteOld", bevel=0.04)       # rear x -4.6..-2.3, top 3.3
    densify(nb(o), 1.6)
    nb(box((2.1, 5.2, 0.26), (-3.45, 0, 3.43), "concreteOld"))                        # the cap, top 3.56
    o = box((1.05, 4.6, 2.1), (-1.775, 0, Z + 1.05), "concreteOld", bevel=0.035)       # front step x -2.3..-1.25, top 2.35
    densify(nb(o), 1.2)
    for sy in (1, -1):                                                                  # buttresses beside the step
        y1 = sy * 2.8 if sy > 0 else -2.3
        plate([(-2.3, Z), (-1.0, Z), (-1.05, Z + 0.25), (-2.3, 3.0)], (0, y1, 0), (1, 0, 0), (0, 0, 1), 0.5,
              "concreteOld")
    chevrons((-1.25, -1.6, 2.08), (0, 1, 0), (0, 0, 1), 3.2, 0.22, 0.14)               # band across the face
    plate(rect(0.0, 0.0, 1.5, 2.1), (-2.55, 2.8, 0.85), (-1, 0, 0), (0, 0, 1), 0.003, "stencil")
    stencil("1", (-2.95, 2.8032, 1.0), (-1, 0, 0), (0, 0, 1), 1.8, m="white", t=0.003)
    for zz in (0.7, 1.7, 2.7):                                                          # plugged form-tie holes
        disc((-4.3, 2.8, Z + zz), (0, 1, 0), 0.025, "soot", 6)
        for xx in (-4.1, -2.75):
            disc((xx, -2.8, Z + zz), (0, -1, 0), 0.025, "soot", 6)
    for yy in (-1.9, 1.9):
        for zz in (0.5, 1.4):
            disc((-1.25, yy, Z + zz), (1, 0, 0), 0.025, "soot", 6)
    # beacon on the cap, the old junction box and its conduit on the -Y face
    cyl(0.025, 0.5, (-4.3, -2.3, 3.56 + 0.25), "steel", verts=6)
    cyl(0.07, 0.06, (-4.3, -2.3, 3.56 + 0.53), "ink", verts=8)
    sphere(0.06, (-4.3, -2.3, 3.56 + 0.6), "beacon", segs=8, rings=4, scale=(1, 1, 1.25))
    box((0.55, 0.2, 0.65), (-3.4, -2.9, 1.5), "stateGreen")
    plate(rect(0, 0, 0.14, 0.09), (-3.5, -3.0, 1.66), (1, 0, 0), (0, 0, 1), 0.002, "stencil")
    tube([(-3.4, -2.92, 1.17), (-3.4, -2.95, 0.9), (-3.4, -3.15, 0.72), (-3.4, -3.15, 0.66)], 0.022, "steel", sides=5, sub=1)

    tally("thrust frame and load cell")
    # ---- the fixed thrust frame: embedded plate, H columns, cross beams, struts into the block, the thrust plate ----
    box((0.02, 1.6, 1.65), (-1.24, 0, 1.225), "steelDark")                              # embedded plate z 0.40..2.05
    for yy in (-0.62, 0.62):
        hcol(-0.95, yy, Z + 0.03, 2.1)
        box((0.36, 0.36, 0.03), (-0.95, yy, Z + 0.015), "steelDark")
        for dy in (-0.13, 0.13):
            bolt((-0.795, yy + dy, Z + 0.03), (0, 0, 1), "steel", r=0.02, stud=0.03)
        for zz in (0.55, 1.95):
            box((0.17, 0.14, 0.12), (-1.145, yy, zz), "steelDark")                       # struts into the block
    for zz in (0.5, 2.0):
        hbeam_y(-0.95, -0.51, 0.51, zz, 0.2, "steelDark")
    box((0.06, 1.5, 1.36), (-0.81, 0, 1.30), "steelDark")                               # the thrust plate
    for (yy, zz) in ((0.66, 0.72), (-0.66, 0.72), (0.66, 1.88), (-0.66, 1.88)):
        bolt((-0.78, yy, zz), (1, 0, 0), "steel", r=0.022)
    # the 40 kN load cell stack: flange, stainless cell, flexure discs, live adapter plate, thrust tube, adapter face
    cyl(0.16, 0.025, (-0.7675, 0, AZ1), "alu", rot=RX, verts=16)
    for k in range(6):
        a = math.pi / 6 + k * math.pi / 3
        bolt((-0.755, 0.135 * math.cos(a), AZ1 + 0.135 * math.sin(a)), (1, 0, 0), "steel", r=0.01)
    cyl(0.105, 0.195, (-0.6575, 0, AZ1), "alu", rot=RX, verts=20)
    tube([(-0.69, 0, AZ1), (-0.63, 0, AZ1)], 0.1058, "kitGraphite", sides=20, caps=False)
    cyl(0.13, 0.02, (-0.55, 0, AZ1), "alu", rot=RX, verts=16)
    cyl(0.04, 0.12, (-0.48, 0, AZ1), "steel", rot=RX, verts=8)
    for xx in (-0.515, -0.455):
        cyl(0.13, 0.008, (xx, 0, AZ1), "steel", rot=RX, verts=16)
    cyl(0.21, 0.06, (-0.39, 0, AZ1), "steelDark", rot=RX, verts=18)                     # live adapter plate
    cyl(0.075, 0.31, (-0.205, 0, AZ1), "steel", rot=RX, verts=12)                        # thrust tube
    cyl(0.12, 0.05, (-0.025, 0, AZ1), "alu", rot=RX, verts=16)                          # adapter face: s1Mount
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        bolt((-0.05, 0.095 * math.cos(a), AZ1 + 0.095 * math.sin(a)), (-1, 0, 0), "steel", r=0.009)

    # the live adapter hangs on flexure blades: up to a crosshead on arms from the columns, down to a base block
    for yy in (-0.13, 0.13):
        box((0.008, 0.07, 0.36), (-0.39, yy, 1.69), "alu")
        box((0.008, 0.07, 0.25), (-0.39, yy, 0.965), "alu")
    box((0.1, 1.36, 0.12), (-0.39, 0, 1.92), "steelDark")
    for yy in (-0.62, 0.62):
        box((0.48, 0.12, 0.12), (-0.54, yy, 1.92), "steelDark")
    box((0.14, 0.4, 0.1), (-0.39, 0, 0.79), "steelDark")
    box((0.1, 0.26, 0.49), (-0.39, 0, Z + 0.245), "steelDark")
    box((0.3, 0.4, 0.02), (-0.39, 0, Z + 0.01), "steelDark")
    # the calibration ram (-Y side): cylinder on the thrust plate, rod, reference cell, a lug on the adapter plate
    box((0.04, 0.14, 0.16), (-0.76, -0.30, AZ1), "steelDark")
    cyl(0.05, 0.2, (-0.68, -0.30, AZ1), "cobalt", rot=RX, verts=12)
    cyl(0.02, 0.11, (-0.525, -0.30, AZ1), "alu", rot=RX, verts=6)
    cyl(0.035, 0.045, (-0.4475, -0.30, AZ1), "alu", rot=RX, verts=8)
    box((0.06, 0.17, 0.12), (-0.39, -0.275, AZ1), "steelDark")
    tube([(-0.7, -0.33, AZ1 - 0.05), (-0.7, -0.45, AZ1 - 0.25), (-0.6, -0.8, 0.7), (-0.45, -1.3, Z + 0.02),
          (-0.38, -1.62, Z + 0.06)], 0.009, "rubber", sides=4, sub=1)
    with frame((-0.3, -1.7, Z), rz=0.3):                                                 # hand pump
        box((0.4, 0.16, 0.12), (0, 0, 0.06), "cobalt")
        cyl(0.05, 0.16, (0.12, 0, 0.2), "cobalt", verts=8)
        rod((-0.1, 0, 0.13), (-0.42, 0, 0.42), 0.012, "steel", 4)
        cyl(0.03, 0.03, (0.0, -0.08, 0.1), "white", rot=RYc, verts=8)
    # the cell's cable to the tray
    cyl(0.014, 0.03, (-0.66, 0, AZ1 + 0.12), "steel", verts=6)
    tube([(-0.66, 0, AZ1 + 0.13), (-0.66, -0.08, AZ1 + 0.2), (-0.7, -0.4, AZ1 + 0.05), (-0.76, -0.75, 0.85),
          (-0.8, -1.0, 0.64)], 0.007, "rubber", sides=4, sub=1)

    tally("rails, cradles, deluge")
    # ---- the rail bed: a concrete plinth, sole plates, twin heavy rails (top = s1Low), anchor bolts ----
    o = box((3.1, 1.1, 0.17), (1.3, 0, Z + 0.085), "concrete")
    densify(nb(o), 1.6)
    for yy in (-0.30, 0.30):
        box((2.95, 0.22, 0.02), (1.275, yy, 0.43), "steelDark")
        ibeam_x(-0.2, 2.75, yy, 0.44, 0.14, 0.18, 0.014, 0.01, "steel")
        for xx in (-0.1, 1.0, 2.65):
            bolt((xx, yy + 0.095, 0.44), (0, 0, 1), "steel", r=0.014)
            bolt((xx, yy - 0.095, 0.44), (0, 0, 1), "steel", r=0.014)
    for x in CR1:
        saddle_support(x, 0.0, RAIL1, CTOP1)
    # ---- the deluge loop round the rail bed, with spray nozzles and a riser to the valve ----
    DZ = 0.36
    tube([(-0.6, -1.15, DZ), (3.05, -1.15, DZ), (3.05, 1.15, DZ), (-0.6, 1.15, DZ), (-0.6, -1.15, DZ)], 0.035,
         "stencil", sides=6)
    for (xx, yy) in ((-0.6, 0.0), (1.2, -1.15), (1.2, 1.15), (3.05, 0.0)):
        box((0.08, 0.08, DZ - Z - 0.03), (xx, yy, (DZ + Z - 0.03) / 2), "steelDark")
    for k in range(4):
        xx = 0.0 + k * 0.9
        for sy in (-1, 1):
            cyl(0.014, 0.07, (xx, sy * 1.12, DZ + 0.05), "alu", rot=(sy * 0.6, 0, 0), verts=4)
    tube([(-0.6, 1.15, DZ), (-0.6, 2.4, DZ), (-0.6, 2.9, Z + 0.02)], 0.035, "stencil", sides=6)
    with frame((-0.6, 2.2, DZ), rx=math.pi / 2):
        cyl(0.06, 0.12, (0, 0, 0), "stencil", verts=8)
    rod((-0.6, 2.2, DZ), (-0.6, 2.2, DZ + 0.16), 0.012, "steel", 4)
    torus(0.09, 0.01, (-0.6, 2.2, DZ + 0.16), "steel", major=10, minor=3)

    tally("hut, trays, trench, sign")
    # ---- the old state-green instrumentation hut behind the block (-Y), its cable trays to the stand ----
    HX, HY = -8.6, -6.0
    nb(box((3.6, 2.8, 0.2), (HX, HY, 0.1), "concreteDark"))
    o = box((3.4, 2.4, 2.4), (HX, HY, 1.5), "stateGreen")
    densify(nb(o), 1.8)
    box((3.42, 2.42, 0.25), (HX, HY, 0.325), "concreteOld")                             # a dirty plinth band
    box((3.7, 2.7, 0.14), (HX, HY, 2.77), "concreteDark")
    box((0.06, 0.95, 2.0), (HX + 1.72, HY - 0.5, 1.2), "steelDark")                     # door on +X
    box((0.07, 0.82, 1.86), (HX + 1.73, HY - 0.5, 1.17), "stateGreen")
    box((0.04, 0.14, 0.03), (HX + 1.78, HY - 0.2, 1.15), "steel")
    nb(box((0.5, 1.1, 0.18), (HX + 2.0, HY - 0.5, 0.09), "concrete"))
    box((1.1, 0.06, 0.7), (HX + 0.4, HY + 1.21, 1.65), "steelDark")                     # window on +Y (to the stand)
    box((0.98, 0.065, 0.58), (HX + 0.4, HY + 1.212, 1.65), "glass")
    for k in range(4):
        box((0.015, 0.015, 0.6), (HX + 0.1 + k * 0.2, HY + 1.26, 1.65), "steel")
    box((0.35, 0.6, 0.5), (HX - 1.88, HY + 0.3, 1.8), "white")                         # vent unit on -X
    disc((HX - 2.055, HY + 0.3, 1.8), (-1, 0, 0), 0.2, "ink", 8)
    cyl(0.03, 2.4, (HX - 1.2, HY - 0.8, 2.84 + 1.2), "steel", verts=4)                  # whip antenna
    plate(rect(0, 0, 0.7, 0.24), (HX - 0.8, HY + 1.2, 2.25), (1, 0, 0), (0, 0, 1), 0.004, "white")
    stencil("41-1", (HX - 0.74, HY + 1.2 - 0.004, 2.28), (1, 0, 0), (0, 0, 1), 0.17, m="stencil", t=0.002)
    bag_wall((HX - 1.4, HY + 1.5), (HX - 0.2, HY + 1.5), 2, seed=21)
    tray((-0.8, -1.0), (-0.8, -3.15), 0.6, z_foot=Z)
    tray((-0.8, -3.15), (-4.0, -3.15), 0.6)
    tray((-4.0, -3.15), (-4.0, -4.6), 0.6)
    tray((-4.0, -4.6), (HX + 1.85, -4.6), 0.6)
    tube([(HX + 1.85, -4.6, 0.62), (HX + 1.75, -4.6, 0.9), (HX + 1.71, -5.2, 1.0)], 0.03, "rubber", sides=5, sub=1)
    # the startup's graphite DAQ case on a stand by the hut
    DX, DY = HX + 2.2, HY + 0.9
    box((0.04, 0.3, 0.62), (DX, DY, 0.31), "steelDark")
    box((0.45, 0.32, 0.24), (DX, DY, 0.74), "kitGraphite")
    plate(rect(-0.12, -0.04, 0.12, 0.04), (DX, DY + 0.16, 0.72), (-1, 0, 0), (0, 0, 1), 0.002, "cobalt")
    # the covered cable trench from the hut to the bunker's cable pit
    TA = Vector((HX + 0.4, HY - 1.6, 0))
    TB = Vector((26.0 - S1[0], 5.2 - S1[1], 0))
    d = TB - TA
    Lt = d.length
    with frame((TA.x, TA.y, 0), rz=math.atan2(d.y, d.x)):
        for yy in (-0.32, 0.32):
            nb(box((Lt, 0.1, 0.16), (Lt / 2, yy, 0.03), "concreteDark"))
        x, k = 0.0, 0
        while x < Lt - 0.05:
            ln = min(2.98 if k < 2 else 6.48, Lt - x - 0.02)
            nb(box((ln, 0.6, 0.05), (x + ln / 2 + 0.01, 0, 0.115), "concrete"))
            x += ln + 0.02
            k += 1
    nb(box((0.8, 0.8, 0.14), (TA.x, TA.y + 0.35, 0.07), "concrete"))
    # the old warning board (OПACHO: danger), facing the stand, west of the -Y wall
    sign_board(-5.0, -5.1, math.pi, "OПACHO", lines=2)
    # drums by the hut
    drum(HX - 1.05, HY - 2.2, 0.0, "stateGreen")
    drum(HX - 0.45, HY - 1.95, 0.0, "rust")

    tally("gantry crane")
    # ---- the rusty gantry crane: four columns, runway girders along X at z 7.6, the bridge parked over the block ----
    CXs, CYs, CZ = (-6.0, 6.0), (-7.0, 8.6), 7.6
    for cx in CXs:
        for cy in CYs:
            nb(box((0.7, 0.7, 0.3), (cx, cy, 0.1), "concreteOld"))
            hcol(cx, cy, 0.25, CZ, b=0.3, tf=0.022, tw=0.014, m="rust")
            rod((cx, cy, CZ - 1.3), (cx - math.copysign(1.3, cx), cy, CZ), 0.045, "rust", sides=4)  # knee brace
    for cy in CYs:
        ibeam_x(-7.0, 7.0, cy, CZ, 0.32, 0.5, 0.025, 0.014, "rust")
        box((14.0, 0.06, 0.06), (0.0, cy, CZ + 0.53), "steelDark")                      # crane rail
    BXc = -2.9
    for bx in (BXc - 0.4, BXc + 0.4):
        box((0.34, 16.4, 0.7), (bx, 0.8, CZ + 0.53 + 0.38), "rust")
    for cy in CYs:
        box((1.8, 0.5, 0.42), (BXc, cy, CZ + 0.53 + 0.26), "rust")
        for sx in (-0.65, 0.65):
            cyl(0.13, 0.12, (BXc + sx, cy, CZ + 0.66), "steelDark", rot=RYc, verts=8)
    box((1.3, 1.2, 0.5), (BXc, 1.0, CZ + 1.48), "hazard")                               # trolley
    cyl(0.25, 0.9, (BXc, 1.0, CZ + 1.6), "steelDark", rot=RYc, verts=10)
    for s in (-0.12, 0.12):
        rod((BXc + s, 1.0, CZ + 1.2), (BXc + s, 1.0, 6.75), 0.012, "steel", 4)
    box((0.35, 0.22, 0.4), (BXc, 1.0, 6.6), "hazard")                                   # hook block (above z 6)
    tube([(BXc, 1.0, 6.4), (BXc, 1.0, 6.25), (BXc + 0.12, 1.0, 6.15), (BXc + 0.15, 1.0, 6.28)], 0.03, "steelDark", sides=4, sub=1)

    tally("floods and ground")
    lamps = [flood_mast(-10.0, 6.0, (1.0, 0.0, AZ1)), flood_mast(10.5, 7.0, (1.0, 0.0, AZ1))]
    apron(6.0, 0.0, 10.5, 3.6, [0.0, 0.6, 1.8], 0.006, "worn", noise=0.55, seed=4, ns=6, nc=3)
    apron(HX, HY, 1.8, 1.4, [0.0, 0.5, 1.4], 0.007, "worn", noise=0.5, seed=5, ns=2, nc=2)
    for (cx, cy, r, s) in ((5.0, 6.5, 1.8, 21), (-3.0, -7.5, 2.2, 22), (12.0, -7.2, 1.6, 23)):
        blob(cx, cy, r, 0.004, "salt", seed=s, n=10)

    ruts([(-2.5, 6.0), (-6.5, 5.2), (-10.0, 3.0), (-11.4, 0.0)], gauge=1.6)
    return lamps


# =====================================================================================================================
# Stand 1's bunker: origin (31, 1), the slit window on its +Y face looking at the stand 36 m off
# =====================================================================================================================
def bk_height(x, y):
    """the earth banked round the bunker (body x -2.8..2.8, y -1.9..1.9): low under the slit (+Y), high at the back
    (-Y), a cut on the -X end for the door passage"""
    if abs(x) < 2.8 and abs(y) < 1.9:
        return 2.0

    def prof(d, H, R):
        return H * (1 - smooth01(d / R)) if d < R else 0.0
    out = [0.0]
    dl = max(0.0, abs(y) - 1.9)
    if x < -2.8:
        out.append(prof(math.hypot(-2.8 - x, dl), 2.1, 3.0))
    if x > 2.8:
        out.append(prof(math.hypot(x - 2.8, dl), 2.1, 3.0))
    dl = max(0.0, abs(x) - 2.8)
    if y > 1.9:
        out.append(prof(math.hypot(y - 1.9, dl), 1.0, 2.5))
    if y < -1.9:
        out.append(prof(math.hypot(-1.9 - y, dl), 2.5, 2.3))
    h = max(out)
    if h > 0.15:
        h += 0.06 * math.sin(1.7 * x + 0.3 * y) + 0.05 * math.sin(0.9 * y - 1.3 * x + 1.1)
    return h - 0.06


def build_bunker():
    tally("bunker body")
    o = box((5.6, 3.8, 2.7), (0, 0, 1.35), "concreteOld")
    densify(nb(o), 1.9)
    # the slit window on +Y (centre z 1.9): sill, cheeks, a deep brow, glass, steel lining, the shutter hanging open
    box((3.0, 0.3, 0.3), (0, 2.05, 1.6), "concreteOld")
    for sx in (-1, 1):
        box((0.3, 0.3, 0.3), (sx * 1.35, 2.05, 1.9), "concreteOld")
    box((3.4, 0.42, 0.32), (0, 2.11, 2.21), "concreteOld", bevel=0.03)
    box((2.4, 0.02, 0.3), (0, 1.93, 1.9), "glass")
    for zz in (1.756, 2.044):
        box((2.4, 0.3, 0.012), (0, 2.05, zz), "steelDark")
    for sx in (-1, 1):
        box((0.012, 0.3, 0.3), (sx * 1.194, 2.05, 1.9), "steelDark")
    box((2.6, 0.03, 0.42), (0, 2.215, 1.23), "steelDark")
    for zz in (1.1, 1.32):
        box((2.6, 0.015, 0.04), (0, 2.237, zz), "steelDark")
    for sx in (-0.9, 0.9):
        cyl(0.025, 0.22, (sx, 2.22, 1.46), "steel", rot=(0, math.pi / 2, 0), verts=4)
    tally("bunker roof")
    o = box((6.4, 4.6, 0.45), (0, 0, 2.925), "concreteOld", bevel=0.05)
    densify(o, 2.2)
    for sx in (-0.9, 0.9):                                                               # periscopes looking +Y
        cyl(0.065, 0.63, (sx, 1.6, 3.46), "steelDark", verts=6)
        box((0.16, 0.25, 0.19), (sx, 1.62, 3.8), "steelDark")
        box((0.11, 0.01, 0.08), (sx, 1.746, 3.82), "glass")
    for xx in (1.6, 2.3):
        cyl(0.13, 0.9, (xx, -1.4, 3.6), "rust", verts=6)
        cyl(0.24, 0.16, (xx, -1.4, 4.13), "rust", verts=6, r2=0.04)
    AX, AY = -2.2, -1.5
    box((0.28, 0.28, 0.02), (AX, AY, 3.16), "steel")
    cyl(0.045, 6.0, (AX, AY, 3.15 + 3.0), "steel", verts=6, r2=0.028)
    box((1.0, 0.03, 0.03), (AX, AY, 8.6), "steel")
    rod((AX, AY, 9.15), (AX, AY, 9.9), 0.008, "steel", 4)
    sphere(0.06, (AX, AY, 9.2), "beacon", segs=8, rings=5)
    tally("bunker door")
    # the blast door on the -X end, a passage cut through the banking between retaining walls
    box((0.1, 1.3, 2.2), (-2.85, -0.1, 1.1), "steelDark")
    box((0.1, 1.05, 1.95), (-2.92, -0.1, 1.0), "stateGreen")
    for zz in (0.35, 1.65):
        cyl(0.04, 0.18, (-2.95, -0.62, zz), "steel", verts=6)
    with frame((-2.98, -0.1, 1.05), ry=math.pi / 2):
        torus(0.18, 0.015, (0, 0, 0), "steel", major=12, minor=3)
        for k in range(2):
            a = math.pi / 4 + k * math.pi / 2
            rod((0.17 * math.cos(a), 0.17 * math.sin(a), 0), (-0.17 * math.cos(a), -0.17 * math.sin(a), 0), 0.009, "steel", 4)
    plate(rect(0, 0, 1.3, 0.38), (-2.805, 0.55, 2.3), (0, -1, 0), (0, 0, 1), 0.004, "stateGreen")
    stencil("41-1", (-2.81, 0.45, 2.36), (0, -1, 0), (0, 0, 1), 0.26, t=0.003)
    for sy in (-1, 1):
        y1 = 0.95 + 0.22 if sy > 0 else -0.95
        plate([(-2.8, -0.06), (-2.8, 2.25), (-4.0, 1.2), (-5.6, 0.12), (-5.6, -0.06)][::-1], (0, y1, 0),
              (1, 0, 0), (0, 0, 1), 0.22, "concrete")
    nb(box((2.8, 1.9, 0.04), (-4.2, 0, 0.02), "concrete"))
    tally("bunker banking")
    heightfield(grid(-6.0, 6.0, 0.9, (-2.8, 2.8, -0.95, 0.95)), grid(-4.4, 4.6, 0.9, (-1.9, 1.9, -0.95, 0.95)),
                bk_height, "earth",
                skip=lambda x, y: (abs(x) < 2.75 and abs(y) < 1.85) or (x < -2.8 and abs(y) < 0.95) or
                all(bk_height(x + dx, y + dy) < -0.04 for dx in (-0.45, 0, 0.45) for dy in (-0.45, 0, 0.45)))
    # the cable pit where the trench from the stand ends
    px, py = 26.0 - BK[0], 5.2 - BK[1]
    nb(box((0.9, 0.9, 0.16), (px, py, 0.08), "concrete"))

    box((0.66, 0.66, 0.02), (px, py, 0.17), "steelDark")
    apron(0, 0, 2.8, 1.9, [3.2, 3.8, 4.6], 0.005, "worn", noise=0.4, seed=33, ns=3, nc=3)
    ruts([(-5.0, 0.0), (-8.5, 0.6), (-11.0, 2.8), (-12.5, 5.0)], gauge=1.6)


def make_stand1():
    T0 = time.time()
    reset()
    palette()
    with frame((S1[0], S1[1], 0)):
        lamps = build_stand1()
    group("stand1", (0.0, PAD1))
    with frame((BK[0], BK[1], 0)):
        build_bunker()
    group("stand1Bunker")
    empty("s1Mount", W1(0.0, 0.0, AZ1))
    for k, x in enumerate(CR1):
        empty("s1Cradle%d" % k, W1(x, 0.0, CTOP1))
    empty("s1Low", W1(0.9, 0.0, RAIL1))
    empty("s1Window", (31.0, 3.6, 1.9))
    for k, p in enumerate(lamps):
        empty("s1Lamp%d" % k, W1(*p))
    finish_all(os.path.join(ROOT, "models", "stand1.glb"), T0)
    if RENDER:
        lp = [W1(*p) for p in lamps]
        prep_render()
        render("stands-s1-side.png", (31.2, 42.5, 1.5), (31.0, 38.0, 1.2), lens=20)
        render("stands-s1-window.png", (31.0, 3.6, 1.9), (31.0, 38.0, 1.3), lens=260)
        render("stands-s1-window-wide.png", (31.0, 3.6, 1.9), (31.0, 38.0, 1.3), lens=50)
        render("stands-s1-over.png", (8.0, 62.0, 22.0), (34.0, 30.0, 0.0), lens=24)
        render("stands-s1-over2.png", (58.0, 20.0, 16.0), (32.0, 34.0, 1.0), lens=24)
        render("stands-s1-night.png", (34.5, 44.0, 2.6), (31.0, 38.0, 1.2), lens=22, sun=False, points=lp, pw=40000)


# =====================================================================================================================
# THE ALTITUDE CHAMBER: built in a frame on the tank's axis line y = -58 (local y 0); x is world x
# =====================================================================================================================
CY = -58.0
AZ = 1.9
RO, RI = 1.70, 1.65             # tank outer and inner radius
TX0, TX1 = 15.0, 24.0
NS = 20                          # sides round the tank
CR0 = [17.25, 17.70, 18.15, 18.55]
CTOP0, RAIL0, DECK = 1.62, 1.25, 1.0
RINGS = (17.7, 19.9, 22.1)
STX, STR, STH = 42.0, 1.6, 10.4  # silencer stack centre x, radius, top
LAMP0 = (18.4, 50.0)             # (x, angle round the axis from +Y, degrees): caged lamps
LAMP1 = (21.4, 130.0)


def W0(x, y, z):
    return (x, CY + y, z)


def polar(x, r, a_deg):
    a = math.radians(a_deg)
    return Vector((x, r * math.cos(a), AZ + r * math.sin(a)))


def lathe_x(profile, m, verts=NS):
    """a surface of revolution about the tank axis from (r, x) points; moving +x faces outward, -x inward"""
    return lathe(profile, m, verts=verts, loc=(0, 0, AZ), rot=RX)


def ring_out(x0, x1, r0, r1, m, verts=NS):
    lathe_x([(r0, x0), (r1, x0), (r1, x1), (r0, x1)], m, verts)


def ring_in(x0, x1, r0, r1, m, verts=NS):
    lathe_x([(r0, x1), (r1, x1), (r1, x0), (r0, x0)], m, verts)


def ellipse(r0, x0, depth, n, sign):
    """points of a dished head from radius r0 at x0 to the axis, bulging by depth toward sign (+1 = +X)"""
    return [(r0 * math.cos(t), x0 + sign * depth * math.sin(t)) for t in [math.pi / 2 * k / n for k in range(n + 1)]]


def build_chamber_out():
    tally("pad and saddles")
    # ---- the slab under the tank, the saddles ----
    for (xa, xb) in ((10.5, 15.0), (15.0, 20.0), (20.0, 25.4)):
        o = box((xb - xa - 0.014, 5.2, 0.15), ((xa + xb) / 2, 0, 0.075), "concrete")
        densify(nb(o), 2.7)
    for x0 in (16.4, 22.6):
        pts = [(-1.55, 0.15), (1.55, 0.15), (1.55, 1.12)]
        for k in range(13):
            y = 1.5 - 3.0 * k / 12
            pts.append((y, AZ - math.sqrt(1.72 ** 2 - y * y)))
        pts.append((-1.55, 1.12))
        plate(pts, (x0, 0, 0), (0, 1, 0), (0, 0, 1), 0.7, "concreteOld")
        for sy in (-1, 1):
            bolt((x0 + 0.35, sy * 1.35, 1.0), (0, 0, 1), "steel", r=0.022, stud=0.03)
    plate(rect(0.0, 0.0, 0.6, 0.62), (17.05, 1.55, 0.26), (-1, 0, 0), (0, 0, 1), 0.004, "stencil")
    stencil("0", (16.94, 1.554, 0.33), (-1, 0, 0), (0, 0, 1), 0.48, m="white", t=0.003)

    tally("tank shell, rings, bands")
    # ---- the shell, stiffening rings, colour bands, flanges, both heads ----
    xs = [TX0 + 0.1] + list(RINGS) + [TX1 - 0.05]
    lathe_x([(RO, x) for x in xs], "stateGreen")
    for x in RINGS:
        ring_out(x - 0.06, x + 0.06, RO - 0.005, 1.82, "stateGreen")
    lathe_x([(RO + 0.003, 18.8), (RO + 0.003, 19.08)], "stencil")                         # red band
    ring_out(TX0 - 0.16, TX0 + 0.1, RO - 0.005, 1.88, "steelDark")                        # door and body flanges
    lathe_x(ellipse(1.72, TX0 - 0.16, 0.85, 5, -1)[::-1], "stateGreen")                   # the door dome
    ring_out(TX1 - 0.05, TX1 + 0.1, RO - 0.005, 1.88, "steelDark")                        # aft flange
    aft = [(1.72 * math.cos(t), TX1 + 0.1 + 0.55 * math.sin(t)) for t in [math.pi / 2 * k / 4 for k in range(4)]]
    aft = [p for p in aft if p[0] > 0.62] + [(0.62, TX1 + 0.1 + 0.55 * math.sin(math.acos(0.62 / 1.72)))]
    lathe_x(aft, "stateGreen")
    # door hinges (+Y) and swing clamps round the flange
    for zz in (AZ - 0.8, AZ + 0.8):
        yy = math.sqrt(1.88 ** 2 - (zz - AZ) ** 2)
        box((0.3, 0.42, 0.16), (TX0 + 0.04, yy + 0.12, zz), "steelDark")
        beam((TX0 - 0.6, yy - 0.55, zz), (TX0 - 0.02, yy + 0.3, zz), 0.14, 0.12, "steelDark")
    cyl(0.06, 2.0, (TX0 - 0.02, 1.95 - 0.12 + 0.27, AZ), "steel", verts=8)
    for k in range(10):
        a = math.radians(40 + k * (280 / 9))
        with frame((TX0 - 0.03, 0, AZ), rx=a):
            box((0.34, 0.12, 0.1), (0, 1.95, 0), "steel")
    # viewports on +Y, feedthroughs at 35 degrees off the top on +Y, their cables
    for x in (18.6, 21.0):
        n = polar(0, 1, 15)
        with frame(M=align(polar(x, RO - 0.02, 15), n)):
            cyl(0.17, 0.2, (0, 0, 0.1), "steelDark", verts=12)
            cyl(0.26, 0.05, (0, 0, 0.225), "steelDark", verts=14)
            cyl(0.17, 0.01, (0, 0, 0.252), "glass", verts=12)
    for x in (16.5, 18.0, 21.8):
        n = polar(0, 1, 55)
        with frame(M=align(polar(x, RO - 0.02, 55), n)):
            cyl(0.09, 0.24, (0, 0, 0.12), "steelDark", verts=8)
            cyl(0.15, 0.04, (0, 0, 0.26), "steel", verts=10)
            cyl(0.03, 0.06, (0.05, 0, 0.31), "ink", verts=6)
        p = polar(x, RO + 0.33, 55)
        tube([p + Vector((0.05, 0, 0)), p + Vector((0.2, 0.25, 0.05)), polar(x + 0.3, RO + 0.25, 15),
              polar(x + 0.4, RO + 0.2, -40), (x + 0.45, 1.9, 0.6), (x + 0.5, 2.15, 0.16)], 0.016, "rubber", sides=4,
             sub=1)
    box((1.6, 0.25, 0.04), (19.8, 2.15, 0.17), "steel")                                    # cable tray on the slab
    with frame((19.8, 2.5, 0.15)):                                                          # instrument cabinet
        box((0.8, 0.45, 1.5), (0, 0, 0.75), "stateGreen")
        plate(rect(-0.35, 0.1, 0.35, 1.4), (0, 0.226, 0), (-1, 0, 0), (0, 0, 1), 0.004, "stateGreen")
        plate(rect(0, 0, 0.18, 0.1), (0.25, 0.231, 1.15), (-1, 0, 0), (0, 0, 1), 0.002, "stencil")
        box((0.9, 0.55, 0.05), (0, 0, 1.52), "steelDark")
    # data plate and a pressure stencil plate on the +Y side
    plate(rect(-0.18, -0.12, 0.18, 0.12), (16.3, RO + 0.002, AZ + 0.25), (-1, 0, 0), (0, 0, 1), 0.004, "alu")
    plate(rect(-0.4, -0.13, 0.4, 0.13), (20.8, RO + 0.004, AZ + 0.45), (-1, 0, 0), (0, 0, 1), 0.004, "white")
    stencil("41-0", (21.13, RO + 0.0085, AZ + 0.37), (-1, 0, 0), (0, 0, 1), 0.16, m="stencil", t=0.002)

    tally("walkway and ladder")
    # ---- the top walkway (y -0.85..-0.15) with handrails, the caged ladder on -Y ----
    WZ = 3.72
    box((8.4, 0.72, 0.03), (19.55, -0.5, WZ), "steelDark")
    for sy in (-0.86, -0.14):
        box((8.4, 0.01, 0.1), (19.55, sy, WZ + 0.05), "hazard")
    for k in range(5):
        x = 15.6 + k * 1.975
        for sy in (-0.82, -0.18):
            zt = AZ + math.sqrt(RO ** 2 - sy * sy)
            box((0.05, 0.05, WZ - zt + 0.02), (x, sy, (WZ + zt) / 2), "steelDark")
        for sy in (-0.88, -0.12):
            rod((x, sy, WZ), (x, sy, WZ + 1.0), 0.02, "hazard", 4)
    for sy in (-0.88, -0.12):
        for zz in (WZ + 0.5, WZ + 1.0):
            rod((15.6, sy, zz), (23.5, sy, zz), 0.018, "hazard", 4)
    LX0, LX1, LY = 15.5, 15.9, -2.0
    for lx in (LX0, LX1):
        rod((lx, LY, 0.15), (lx, LY, WZ + 1.0), 0.022, "steel", 4)
    for k in range(12):
        z = 0.45 + k * 0.3
        rod((LX0, LY, z), (LX1, LY, z), 0.012, "steel", 4)
    for k in range(3):
        z = 2.4 + k * 0.6
        tube([(15.7 + 0.2 * math.cos(a), LY - 0.36 * math.sin(a), z) for a in [math.pi * j / 6 for j in range(7)]],
             0.012, "steel", sides=4)                                                       # cage hoops
    for sx in (LX0, LX1):
        rod((sx, LY - 0.36, 2.4), (sx, LY - 0.36, WZ + 1.0), 0.012, "steel", 4)
    box((0.5, 1.2, 0.03), (15.7, -1.45, WZ), "steelDark")

    tally("diffuser and ejector")
    # ---- the supersonic diffuser: 1.2 m pipe on pedestals, flanged joints; the ejector / spray section; into the stack ----
    lathe_x([(0.6, 24.55), (0.6, 36.0), (0.88, 36.5), (0.88, 38.8), (0.6, 39.3), (0.6, 40.6)], "rust", 18)
    for x in (28.7, 32.9, 36.0, 39.3):
        ring_out(x - 0.05, x + 0.05, 0.595, 0.74 if x not in (36.0, 39.3) else 0.72, "steelDark", 18)
    ring_out(40.15, 40.3, 0.595, 0.78, "steelDark", 18)
    for x in (26.6, 30.8, 35.0):
        nb(box((0.5, 1.1, 1.18), (x, 0, 0.59), "concreteOld"))
        box((0.36, 0.9, 0.1), (x, 0, 1.23), "steelDark")
        for sy in (-1, 1):
            box((0.36, 0.08, 0.35), (x, sy * 0.45, 1.4), "steelDark")
    for x in (36.9, 37.6, 38.3):                                                            # spray rings
        torus(1.0, 0.035, (x, 0, AZ), "stencil", rot=RX, major=12, minor=3)
        for a in (30, 150, 270):
            p0, p1 = polar(x, 1.0, a), polar(x, 0.88, a)
            rod(p0, p1, 0.018, "stencil", 4)
        rod((x, 1.32, 0.35), polar(x, 1.0, -30), 0.03, "stencil", 4)
    tube([(36.4, 1.32, 0.35), (38.6, 1.32, 0.35), (39.0, 1.32, 0.2), (39.6, -1.4, 0.2), (33.6, -6.6, 0.2),
          (32.6, -7.6, 0.2)], 0.05, "stencil", sides=6)                                     # spray water header
    for k, a in enumerate((200, 235, 270)):                                               # steam nozzles (-Y side)
        rod(polar(36.25, 0.75, a), polar(35.7, 1.15, a), 0.05, "alu", 6)
    tube([(32.5, -7.4, 2.6), (34.8, -7.4, 2.6), (35.5, -6.6, 2.6), (35.5, -2.2, 2.6), (35.6, -1.4, 2.2),
          (35.7, -1.05, 1.6)], 0.12, "alu", sides=8, sub=1)                                 # steam line, clad
    for yy in (-5.6, -3.4):
        box((0.3, 0.3, 2.5), (35.5, yy, 1.25), "steelDark")
        box((0.5, 0.5, 0.06), (35.5, yy, 2.48), "steelDark")

    tally("stack")
    # ---- the silencer stack: plinth, shell, rings, open top with a sooty inside, caged ladder, top platform ----
    ngon_prism(8, 2.1, 0.4, Matrix.Translation(Vector((STX, 0, 0))), "concreteOld", rot0=math.pi / 8)
    lathe([(STR, 0.4), (STR, 4.2), (STR, 8.0), (STR, STH), (STR - 0.05, STH), (STR - 0.05, STH - 2.5)],
          "rust", verts=20, loc=(STX, 0, 0))
    lathe([(0.0, STH - 2.5), (STR - 0.05, STH - 2.5)], "soot", verts=20, loc=(STX, 0, 0))   # dark floor seen from above
    for zz in (4.2, 8.0):
        lathe([(STR - 0.005, zz - 0.06), (STR + 0.09, zz - 0.06), (STR + 0.09, zz + 0.06), (STR - 0.005, zz + 0.06)],
              "rust", verts=20, loc=(STX, 0, 0))
    lathe([(STR - 0.005, STH - 0.2), (STR + 0.12, STH - 0.2), (STR + 0.12, STH), (STR - 0.05, STH)], "steelDark",
          verts=20, loc=(STX, 0, 0))
    lathe([(STR + 0.003, 6.6), (STR + 0.003, 7.1)], "stencil", verts=20, loc=(STX, 0, 0))
    SLY = -(STR + 0.2)
    for lx in (STX - 0.2, STX + 0.2):
        rod((lx, SLY, 0.4), (lx, SLY, STH - 0.4), 0.022, "steel", 4)
        rod((lx, SLY - 0.36, 2.4), (lx, SLY - 0.36, STH - 0.4), 0.012, "steel", 4)
    for k in range(13):
        z = 0.7 + k * 0.7
        rod((STX - 0.2, SLY, z), (STX + 0.2, SLY, z), 0.012, "steel", 4)
    for k in range(5):
        z = 2.4 + k * 1.5
        tube([(STX + 0.2 * math.cos(a), SLY - 0.36 * math.sin(a), z) for a in [math.pi * j / 6 for j in range(7)]],
             0.012, "steel", sides=4)
    PZ = STH - 1.3
    pts = [(math.cos(math.radians(a)), math.sin(math.radians(a))) for a in range(200, 341, 35)]
    ring = [(STX + (STR + 0.05) * c, (STR + 0.05) * s) for c, s in pts] + \
           [(STX + (STR + 0.95) * c, (STR + 0.95) * s) for c, s in pts[::-1]]
    plate(ring, (0, 0, PZ), (1, 0, 0), (0, 1, 0), 0.04, "steelDark")
    for c, s in pts[::2] + [pts[-1]]:
        p = (STX + (STR + 0.9) * c, (STR + 0.9) * s)
        rod((p[0], p[1], PZ), (p[0], p[1], PZ + 1.0), 0.02, "hazard", 4)
    tube([(STX + (STR + 0.9) * c, (STR + 0.9) * s, PZ + 1.0) for c, s in pts], 0.018, "hazard", sides=4)
    tube([(STX + (STR + 0.9) * c, (STR + 0.9) * s, PZ + 0.5) for c, s in pts], 0.016, "hazard", sides=4)

    tally("pump house and vacuum line")
    # ---- the vacuum pump house (-Y side), its vacuum line to the tank with a gate valve ----
    PX, PY = 29.5, -7.8
    nb(box((6.4, 4.8, 0.2), (PX, PY, 0.1), "concreteDark"))
    o = box((6.0, 4.4, 3.2), (PX, PY, 1.8), "concreteOld")
    densify(nb(o), 3.5)
    box((6.02, 4.42, 0.9), (PX, PY, 0.65), "stateGreen")
    box((6.3, 4.7, 0.2), (PX, PY, 3.5), "concreteDark")
    for xx in (PX - 1.5, PX + 0.6):                                                         # windows on +Y
        box((1.1, 0.06, 0.8), (xx, PY + 2.21, 2.1), "steelDark")
        box((1.0, 0.065, 0.7), (xx, PY + 2.212, 2.1), "glass")
    box((0.06, 2.2, 2.6), (PX + 3.01, PY - 0.4, 1.5), "steelDark")                        # roller door on +X
    for k in range(5):
        box((0.065, 2.1, 0.012), (PX + 3.02, PY - 0.4, 0.45 + k * 0.45), "steel")
    box((0.3, 2.4, 0.35), (PX + 3.1, PY - 0.4, 2.95), "steelDark")
    for xx in (PX - 1.6, PX + 1.0):                                                         # roof fans
        cyl(0.42, 0.35, (xx, PY - 0.6, 3.775), "steel", verts=10)
        cyl(0.46, 0.04, (xx, PY - 0.6, 3.97), "steelDark", verts=10)
    cyl(0.12, 1.4, (PX + 2.2, PY + 1.2, 4.3), "rust", verts=6)
    plate(rect(0, 0, 1.4, 0.4), (PX - 2.6, PY + 2.2, 2.75), (1, 0, 0), (0, 0, 1), 0.004, "white")
    stencil("41-0", (PX - 2.48, PY + 2.2 - 0.004, 2.81), (1, 0, 0), (0, 0, 1), 0.28, t=0.002)
    with frame(M=align(polar(23.3, RO - 0.02, 180), (0, -1, 0))):                         # nozzle on the tank's -Y
        cyl(0.16, 0.5, (0, 0, 0.25), "steelDark", verts=10)
        cyl(0.26, 0.05, (0, 0, 0.5), "steelDark", verts=10)
    tube([(23.3, -2.2, AZ), (23.3, -2.9, AZ), (26.4, -2.9, AZ), (27.4, -3.6, AZ), (27.4, -5.6, AZ)], 0.16, "steelDark",
         sides=10)
    with frame((25.0, -2.9, AZ), rz=0):                                                      # the gate valve
        cyl(0.24, 0.32, (0, 0, 0), "stateGreen", rot=RX, verts=10)
        box((0.22, 0.3, 0.55), (0, 0, 0.35), "stateGreen")
        rod((0, 0, 0.6), (0, 0, 0.95), 0.025, "steel", 4)
        torus(0.24, 0.018, (0, 0, 0.95), "stencil", major=10, minor=3)
    for x in (24.3, 26.4):
        box((0.25, 0.25, AZ - 0.16), (x, -2.9, (AZ - 0.16) / 2), "steelDark")

    tally("trolley, apron, sign")
    # ---- the motor trolley on a short track in front of the door ----
    for sy in (-0.45, 0.45):
        box((4.0, 0.06, 0.06), (12.6, sy, 0.18), "steel")
    with frame((11.6, 0, 0.21)):
        box((1.4, 1.0, 0.12), (0, 0, 0.18), "cobalt")
        for sx in (-0.5, 0.5):
            for sy in (-0.45, 0.45):
                cyl(0.08, 0.06, (sx, sy, 0.08), "rubber", rot=RYc, verts=8)
            box((0.1, 0.9, 0.3), (sx, 0, 0.39), "kitGraphite")
            box((0.12, 0.3, 0.06), (sx, 0, 0.57), "rubber")
        rod((0.7, 0, 0.24), (1.3, 0, 0.9), 0.02, "kitGraphite", 4)
        rod((1.3, -0.25, 0.9), (1.3, 0.25, 0.9), 0.02, "kitGraphite", 4)
    sign_board(12.6, 3.4, math.pi + 0.5, "OПACHO", lines=2)
    apron(19.5, 0, 6.5, 2.6, [0.0, 0.5, 1.6], 0.006, "worn", noise=0.5, seed=81, ns=5, nc=3)
    apron(PX, PY, 3.2, 2.4, [0.0, 0.6], 0.006, "worn", noise=0.5, seed=82, ns=3, nc=3)
    apron(STX, 0, 2.1, 2.1, [0.0, 0.8], 0.006, "worn", noise=0.5, seed=83, ns=2, nc=3)
    for (cx, cy, r, s) in ((31.0, 2.5, 2.0, 91), (12.0, -4.5, 1.8, 92)):
        blob(cx, cy, r, 0.004, "salt", seed=s, n=10)

    ruts([(36.0, -10.5), (30.0, -12.0), (20.0, -10.5), (11.0, -6.0), (9.0, -1.0)], gauge=1.6)


def build_chamber_in():
    tally("inner shell, frames, heads")
    # ---- the inner shell (faces inward), frames, the door's inner dome, the aft head, the bell mouth ----
    xs = [TX1 - 0.02] + list(RINGS)[::-1] + [TX0]
    lathe_x([(RI, x) for x in xs], "steel")
    for x in RINGS:
        ring_in(x - 0.04, x + 0.04, RI + 0.005, 1.56, "steelDark")
    lathe_x(ellipse(RI, TX0, 0.8, 5, -1), "steel")                                        # inner face of the door
    aft = [(0.6, TX1 + 0.48)]
    for k in range(1, 5):
        t = math.pi / 2 * (4 - k) / 4
        r = RI * math.cos(t)
        if r > 0.6:
            aft.append((r, TX1 - 0.02 + 0.5 * math.sin(t)))
    lathe_x(aft, "steel")
    lathe_x([(0.5, 24.7), (0.5, 23.2), (0.62, 22.75), (0.8, 22.53), (0.86, 22.6), (0.72, 22.92), (0.6, 23.3),
             (0.6, TX1 + 0.48)], "alu", 20)
    lathe_x([(0.0, 24.6), (0.5, 24.6)][::-1], "ink", 12)                                  # dark beyond the throat

    tally("deck and bed")
    # ---- the grating deck (top 1.0), the rails (top 1.25 = s0Low) on pedestals ----
    hw = math.sqrt(RI ** 2 - (AZ - DECK) ** 2) - 0.02
    o = box((TX1 - TX0 - 0.3, 2 * hw, 0.03), ((TX0 + TX1) / 2, 0, DECK - 0.015), "steelDark")
    densify(o, 1.5)
    for sy in (-1, 1):
        box((TX1 - TX0 - 0.3, 0.05, 0.08), ((TX0 + TX1) / 2, sy * (hw - 0.025), DECK - 0.04), "steel")
    for k in range(6):
        box((0.04, 2 * hw - 0.1, 0.006), (15.7 + k * 1.6, 0, DECK + 0.003), "steel")
    for yy in (-0.2, 0.2):
        ibeam_x(16.15, 21.0, yy, 1.12, 0.09, 0.13, 0.01, 0.008, "steel")
        for x in (16.4, 18.7, 20.8):
            box((0.16, 0.16, 0.12), (x, yy, DECK + 0.06), "steelDark")
    for x in CR0:
        saddle_support(x, 0.0, RAIL0, CTOP0, half=0.3)

    tally("thrust frame and cell")
    # ---- the thrust frame on the deck and the thrust ring; load cell, flexures, live plate, button (face = s0Mount) ----
    box((0.62, 1.2, 0.03), (16.3, 0, DECK + 0.015), "steelDark")
    for yy in (-0.45, 0.45):
        hcol(16.2, yy, DECK + 0.03, 2.55, b=0.18, tf=0.015, tw=0.01)
        rod((16.1, yy, 2.45), (15.45, yy * 1.6, DECK + 0.02), 0.03, "steelDark", 4)
    hbeam_y(16.2, -0.36, 0.36, 2.5, 0.16, "steelDark")
    box((0.05, 1.04, 0.95), (16.315, 0, AZ), "steelDark")
    cyl(0.12, 0.02, (16.35, 0, AZ), "alu", rot=RX, verts=14)
    cyl(0.085, 0.2, (16.46, 0, AZ), "alu", rot=RX, verts=18)
    tube([(16.43, 0, AZ), (16.49, 0, AZ)], 0.0858, "kitGraphite", sides=18, caps=False)
    cyl(0.035, 0.16, (16.64, 0, AZ), "steel", rot=RX, verts=8)
    for xx in (16.6, 16.67):
        cyl(0.1, 0.007, (xx, 0, AZ), "steel", rot=RX, verts=14)
    cyl(0.15, 0.05, (16.745, 0, AZ), "steelDark", rot=RX, verts=16)
    cyl(0.055, 0.18, (16.86, 0, AZ), "steel", rot=RX, verts=10)
    cyl(0.09, 0.05, (16.975, 0, AZ), "alu", rot=RX, verts=16)
    for yy in (-0.1, 0.1):
        box((0.007, 0.06, 0.34), (16.745, yy, 2.22), "alu")
        box((0.007, 0.06, 0.3), (16.745, yy, 1.6), "alu")
    box((0.08, 0.95, 0.1), (16.745, 0, 2.44), "steelDark")
    for yy in (-0.45, 0.45):
        box((0.48, 0.1, 0.1), (16.55, yy, 2.44), "steelDark")
    box((0.12, 0.3, 0.08), (16.745, 0, 1.41), "steelDark")
    box((0.08, 0.2, 0.38), (16.745, 0, DECK + 0.19), "steelDark")
    box((0.04, 0.12, 0.14), (16.36, -0.27, AZ), "steelDark")                              # calibration ram
    cyl(0.04, 0.16, (16.46, -0.27, AZ), "cobalt", rot=RX, verts=10)
    cyl(0.016, 0.1, (16.59, -0.27, AZ), "alu", rot=RX, verts=6)
    cyl(0.028, 0.04, (16.66, -0.27, AZ), "alu", rot=RX, verts=8)
    box((0.05, 0.14, 0.1), (16.745, -0.22, AZ), "steelDark")
    cyl(0.012, 0.03, (16.46, 0, AZ + 0.095), "steel", verts=6)
    tube([(16.46, 0, AZ + 0.1), (16.42, -0.15, AZ + 0.2), (16.3, -0.55, AZ + 0.05), (16.25, -0.8, DECK + 0.3),
          (16.4, -0.95, DECK + 0.01), (18.5, -1.0, DECK + 0.01), (19.6, -1.05, DECK + 0.01), (19.7, -1.25, 1.2),
          (19.75, -1.42, 1.5)], 0.008, "rubber", sides=4, sub=1)

    tally("lamps, camera, ports, tray")
    # ---- caged lamps on wall brackets ----
    lamps = []
    for (x, a) in (LAMP0, LAMP1):
        n_in = -(polar(0, 1, a) - Vector((0, 0, AZ)))
        n_in = Vector((0, n_in.y, n_in.z)).normalized()
        base = polar(x, RI - 0.005, a)
        with frame(M=align(base, n_in)):
            box((0.2, 0.12, 0.02), (0, 0, 0.01), "steelDark")
            box((0.05, 0.05, 0.12), (0, 0, 0.07), "steelDark")
            cyl(0.1, 0.1, (0, 0, 0.17), "kitGraphite", verts=10)
            cyl(0.085, 0.01, (0, 0, 0.225), "lamp", verts=10)
            for k in range(2):
                b = k * math.pi / 2
                tube([(0.1 * math.cos(b), 0.1 * math.sin(b), 0.23), (0.06 * math.cos(b), 0.06 * math.sin(b), 0.3),
                      (-0.06 * math.cos(b), -0.06 * math.sin(b), 0.3), (-0.1 * math.cos(b), -0.1 * math.sin(b), 0.23)],
                     0.006, "steelDark", sides=4)                                          # the cage
        lamps.append(base + n_in * 0.27)
    # ---- the camera port: a housing behind s0Cam on a bracket from the wall, looking at the motor ----
    cam = Vector((19.5, -1.2, 2.6))
    tgt = Vector((17.6, 0.0, AZ))
    dv = (tgt - cam).normalized()
    hc = cam - dv * 0.15
    with frame(M=align(hc, dv)):
        cyl(0.065, 0.24, (0, 0, 0), "white", verts=10)
        cyl(0.07, 0.03, (0, 0, 0.12), "kitGraphite", verts=10)
        cyl(0.045, 0.005, (0, 0, 0.137), "glass", verts=10)
    rad = Vector((0, hc.y, hc.z - AZ)).normalized()
    wall = Vector((hc.x, 0, AZ)) + rad * RI
    rod(hc, wall, 0.025, "steelDark", 4)
    tube([hc - dv * 0.12, hc - dv * 0.2 + rad * 0.05, wall + Vector((0.2, 0, 0)) - rad * 0.02], 0.007, "rubber", sides=4, sub=1)
    # ---- inner faces of the viewports and feedthroughs, a cable tray along the -Y wall ----
    for x in (18.6, 21.0):
        p, n = polar(x, RI - 0.004, 15), -polar(0, 1, 15) + Vector((0, 0, AZ))
        disc(p, n, 0.17, "glass", 12, 0.0)
        torus(0.19, 0.025, tuple(p), "steelDark", rot=Vector((0, 0, 1)).rotation_difference(n).to_euler(), major=12, minor=3)
    for x in (16.5, 18.0, 21.8):
        p, n = polar(x, RI - 0.004, 55), -polar(0, 1, 55) + Vector((0, 0, AZ))
        with frame(M=align(p, n)):
            cyl(0.1, 0.04, (0, 0, 0.02), "steelDark", verts=8)
            cyl(0.03, 0.05, (0.0, 0, 0.06), "ink", verts=6)
    for k in range(4):
        x = 17.0 + k * 2.0

        q = polar(x, RI, 195)
        rod((x, -1.42, 1.5), (q.x, q.y, q.z), 0.015, "steelDark", 4)
    box((7.0, 0.22, 0.01), (19.8, -1.42, 1.5), "steel")
    box((7.0, 0.008, 0.06), (19.8, -1.31, 1.53), "steel")
    for k in range(3):
        tube([(16.3 + k * 0.05, -1.42 + k * 0.05, 1.52), (23.2, -1.42 + k * 0.05, 1.52)], 0.01, "rubber", sides=4)
    return lamps


def make_chamber():
    T0 = time.time()
    reset()
    palette()
    with frame((0, CY, 0)):
        build_chamber_out()
    group("chamber", (0.0, 0.15))
    with frame((0, CY, 0)):
        lamps = build_chamber_in()
    group("chamberIn", (DECK,))
    empty("s0Mount", W0(17.0, 0, AZ))
    for k, x in enumerate(CR0):
        empty("s0Cradle%d" % k, W0(x, 0, CTOP0))
    empty("s0Low", W0(17.8, 0, RAIL0))
    for k, p in enumerate(lamps):
        empty("s0Lamp%d" % k, W0(p.x, p.y, p.z))
    empty("s0Cam", W0(19.5, -1.2, 2.6))
    empty("s0Out", (12.0, -48.0, 4.0))
    empty("s0Outlet", W0(STX, 0, STH))
    empty("s0TankA", W0(15.2, 0, AZ))
    empty("s0TankB", W0(23.8, 0, AZ))
    finish_all(os.path.join(ROOT, "models", "chamber.glb"), T0)
    if RENDER:
        lp = [W0(p.x, p.y, p.z) for p in lamps]
        prep_render()
        render("stands-ch-cam.png", W0(19.5, -1.2, 2.6), W0(17.6, 0, AZ), lens=14, sun=True, points=lp, pw=150)
        render("stands-ch-cam2.png", W0(22.0, 0.9, 2.9), W0(16.6, 0, 1.6), lens=16, sun=True, points=lp, pw=150)
        render("stands-ch-out.png", (12.0, -48.0, 4.0), W0(28.0, 0, 3.0), lens=20)
        render("stands-ch-over.png", (2.0, -30.0, 24.0), W0(28.0, -2.0, 0.0), lens=24)
        render("stands-ch-over2.png", (50.0, -80.0, 18.0), W0(26.0, 0, 1.0), lens=24)


# =====================================================================================================================
# check renders (only with "render"): the baked AO shown, a sun and sky, a salt ground plane
# =====================================================================================================================
# rough stand-ins for the shared textures' average colour (linear), so the check renders read like the game
TEXTINT = {"earth": (0.45, 0.36, 0.26), "concrete": (0.62, 0.6, 0.56), "concreteOld": (0.55, 0.53, 0.48),
           "rust": (0.42, 0.24, 0.15), "salt": (0.8, 0.78, 0.74), "metal": (0.7, 0.7, 0.7), "paint": (0.8, 0.8, 0.8)}


def prep_render():
    scene = bpy.context.scene
    for m in bpy.data.materials:
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        if not bsdf or bsdf.inputs["Base Color"].is_linked:
            continue
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = "Color"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        tint = TEXTINT.get(m.get("tex"), (1, 1, 1))
        c = bsdf.inputs["Base Color"].default_value
        mix.inputs[6].default_value = (c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], 1.0)
        nt.links.new(a.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bpy.ops.mesh.primitive_plane_add(size=900, location=(20, 0, -0.002))
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexrgb("#D9D2C4")
    g.data.materials.append(gm)
    w = scene.world or bpy.data.worlds.new("w")
    scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = hexrgb("#BFD0DE")
    bg.inputs["Strength"].default_value = 0.8
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = 900, 640
    scene.view_settings.view_transform = "Standard"
    os.makedirs(RDIR, exist_ok=True)


def render(name, cam, tgt, lens=24, sun=True, points=(), pw=300):
    scene = bpy.context.scene
    tmp = []
    cd = bpy.data.cameras.new("chk")
    cd.lens = lens
    cd.clip_start = 0.02
    co = bpy.data.objects.new("chk", cd)
    scene.collection.objects.link(co)
    co.location = cam
    co.rotation_euler = (Vector(tgt) - Vector(cam)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    tmp.append(co)
    if sun:
        ld = bpy.data.lights.new("sun", "SUN")
        ld.energy = 2.6
        so = bpy.data.objects.new("sun", ld)
        so.rotation_euler = (math.radians(50), 0, math.radians(35))
        scene.collection.objects.link(so)
        tmp.append(so)
    else:
        scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.03
    for p in points:
        ld = bpy.data.lights.new("pt", "POINT")
        ld.energy = pw
        ld.shadow_soft_size = 0.05
        po = bpy.data.objects.new("pt", ld)
        po.location = p
        scene.collection.objects.link(po)
        tmp.append(po)
    scene.render.filepath = os.path.join(RDIR, name)
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8


which = [a for a in ARGS if a in ("stand1", "chamber")] or ["stand1", "chamber"]
if "stand1" in which:
    make_stand1()
if "chamber" in which:
    make_chamber()
