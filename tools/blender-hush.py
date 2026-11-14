"""Burn Rate: build models/hush.glb, the hush house (Burn Rate 1.6), with scripted Blender.

The hush house is Site 41's old jet-engine acoustic test building from the state programme, leased by the player's
two-person startup as its home base. Every Stand 3 firing happens in its indoor test cell, and the build bay shows the
player's motor on the assembly bench, so the INSIDE is what the player sees most. No hand modelling: every wall, slat,
bolt and cable is placed by this script. Run it headless from the repo root (about a minute, most of it the AO bake):

    python3 tools/blender-hush.py                     (the bpy module from PyPI: pip install bpy)
    blender -b -P tools/blender-hush.py               (a Blender install, 4.2 or newer)
    python3 tools/blender-hush.py --render DIR        (also renders check images from the game's camera points to DIR)

It writes models/hush.glb. Commit that file with this script. The shared building blocks (palette, bevelled boxes,
plates, tubes, bolts, stencils, the AO bake and the export) are in tools/blender_parts.py and tools/blender_lib.py.

The world frame is the same as range.glb (Blender Z up, metres, Stand 2 at the origin, every exhaust along +X), so the
game loads this file unmoved next to the range. Blender (x, y, z) is three.js (x, z, -y).

What is in it (three groups, each one joined mesh):
  - hush (the shell): the floor slab (bay in cast panels, the cell in painted concrete), the 0.3 m concrete walls with
    pilasters and a plinth band, the 1 m thick blast wall between bay and cell (its door openings), the barrel roof
    (a concrete shell inside, standing-seam steel outside, gutters and downpipes), the open roll-up door in the west
    end with its apron and bollards, a personnel door, the big stencil "41", the startup's cobalt sign, the cell's roof
    intake louvres and wall louvres, the climate plant on the south side and the ground round the building.
  - hushIn (the interior):
      build bay (x -64..-47): steel columns and arch ribs, a yellow overhead crane on runway beams, high-bay lamps, the
      assembly bench (hushBench), pallet racking with case tubes, closures and nozzle parts, a tool board and chest, a
      parts cart, the startup's desk with a laptop and a whiteboard (a predicted and a measured curve on it), a little
      kitchen corner, drums and crates by the door, floor markings, the roll-up door's drum and guides, the sliding blast
      door leaf (slid open to +Y) on its track, beacons and the "Б-3" stencil over the door.
      test cell (x -46..-36): slatted acoustic lining on every wall over a state-green dado, the thrust stand on its
      plinth (bench, thrust plate, gussets, flexure, flange, stainless load cell, load button = hushMount, a pressure
      transducer over the load button, cables to a covered floor trench), hazard chevrons, a floor drain, a ceiling with
      beams and a red suppression pipe grid, caged pendant lamps (hushLamp0/1), wall strip lamps, a CCTV camera aimed
      at the stand, the red firing beacon over the door, cable trays, a pressure gauge panel, a hose reel, the climate
      plant's diffuser.
      control room (x -46..-40, y -19..-15.5): the armoured observation window (deep steel reveal, bolted retaining
      frame, one pane facing the cell), a desk with the startup's graphite DAQ rack, two monitors (one shows a curve),
      the amber firing box with its key switch, a chair, a ceiling lamp, a clock, a checklist.
  - hushStack: the augmenter tube (bell-mouth intake on the motor axis, soot inside, flanges, saddle stands, wall
    collars) running east through the wall into the square exhaust stack outside (concrete base and shaft, a louvred
    acoustic top section with a soot core and splitter baffles, a red rim, guard rail, beacon and a caged ladder).

Nodes the game reads (Blender coordinates; keep these names and meanings):
  hushMount (-43.2, -12, 1.05)   the motor's forward end on the load button face; motor axis along +X
  hushCradle0..3   saddle cradle tops at x -43.11, -42.98, -42.85, -42.72, y -12, z 0.90 (nothing modelled there)
  hushLow (-43.0, -12, 0.80)     the thrust bench's top plate, where a single support post would start
  hushInlet (-40.5, -12, 1.05)   the augmenter's bell-mouth centre;  hushOutlet (-32, -12, 12.0) the stack's top centre
  hushWindow (-42.8, -15.9, 1.55)  camera just inside the control room glass, looking +Y at the motor
  hushBay (-60.5, -10, 1.7)      camera in the bay;  hushDoor (-46.5, -12, 1.6) the blast door opening's centre
  hushBench (-54.5, -12, 1.05)   the middle of the assembly bench's clear top (2.2 m clear along X)
  hushLamp0..3   lamp points: two over the cell either side of the stand, two over the bay (visible fixtures there)
  hushCellMin (-46, -19, 0.15), hushCellMax (-36, -5, 7.0)   the cell's inner bounds

Kept clear for the cameras: the motor zone (nothing within 0.12 m of the axis from x -43.2 to -42.6), the axis line
from the motor to the bell mouth, the line from hushWindow to the motor, the +Y half of the cell round the stand (only
low things), and the line from hushBay over the bench through the blast door to the stand.

The window pane is ONE face looking into the cell (+Y): three.js culls back faces, so from hushWindow the camera looks
straight through it, while from the cell the window reads as dark armoured glass.

Budget: at most 1.25 MB. Every exported vertex costs about 40 bytes, so the big flat things are few faces, small parts
are smooth shaded with one UV (prep_parts / flat_uvs), wall paint, floor markings and chevrons are single faces, and the
acoustic slats are one mesh per wall with only the faces that can be seen.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_parts import *          # noqa: F401,F403  (the palette, frames, box, cyl, plates, bolts... on blender_lib)
from blender_parts import GROUP, MATS, keep, _box, _cyl
import bpy, bmesh                    # bmesh loads once bpy has
from mathutils import Vector, Matrix

T0 = time.time()
OUT = os.path.join(ROOT, "models", "hush.glb")
# budget aids while editing: HUSH_FAST=1 skips the AO bake, HUSH_SPLIT=1 makes every tally() section its own mesh so a
# stats pass over the glb shows where the vertices go (neither is for the committed file), HUSH_OUT writes elsewhere
FAST = bool(os.environ.get("HUSH_FAST"))
OUT = os.environ.get("HUSH_OUT") or OUT
if os.environ.get("HUSH_SPLIT"):
    _tally0, _cur = tally, [None]

    def tally(label):
        if _cur[0] and GROUP:
            finish_group("S_" + _cur[0].replace(" ", "_").replace(",", ""))
        _cur[0] = label
        _tally0(label)

# ---- the frame of the building (Blender world, metres) ---------------------------------------------------------------
X0, X1, Y0, Y1 = -64.0, -36.0, -19.0, -5.0      # outer footprint
WT = 0.3                                         # wall thickness
XI0, XI1, YI0, YI1 = X0 + WT, X1 - WT, Y0 + WT, Y1 - WT
FL = 0.15                                        # floor slab top
EAVE, CROWN = 8.0, 9.6                           # roof: eaves and crown (outer)
PX0, PX1 = -47.0, -46.0                          # the blast wall between bay and cell
BD0, BD1, BDZ = -13.3, -10.7, FL + 3.0           # blast door opening (y) and its head
CD0, CD1, CDZ = -17.95, -17.05, FL + 2.1         # control room door through the blast wall
CRX1, CRY = -40.0, -15.5                         # control room: east wall outer face, north wall cell face
CRT = 0.3                                        # control room wall thickness
CR_CEIL = 3.0                                    # control room ceiling (underside)
CEIL = 7.0                                       # cell ceiling (underside)
AXZ, AXY = 1.05, -12.0                           # motor axis height and line
MOUNT_X = -43.2                                  # the motor's forward end (load button face)
INLET_X = -40.5                                  # bell-mouth lip plane
WIN = (-43.45, -42.15, 1.15, 1.85)               # observation window opening (x0, x1, z0, z1)
RD = (-15.0, -9.0, 5.15)                         # roll-up door opening (y0, y1, head)
SX0, SX1, SY0, SY1, STOP = -35.0, -29.0, -15.0, -9.0, 12.0     # exhaust stack
UP = Vector((0, 0, 1))

RA = (7.0 ** 2 + (CROWN - EAVE) ** 2) / (2 * (CROWN - EAVE))   # outer roof radius
ZC = CROWN - RA                                                 # its centre height (centre line y = -12)
RI = RA - 0.3                                                   # inner face of the concrete roof shell

scene = reset()
palette()
mat("acoustic", "#BEC2BF", tex="metal", tile=0.5, rough=0.55, metal=0.3)     # the cell's slatted lining
mat("floorPaint", "#C9CBC6", tex="concrete", tile=2.0, rough=0.7)             # the cell's painted floor
mat("lino", "#6F7D72", tex="paint", tile=1.0, rough=0.7)                      # control room floor
mat("roofSteel", "#A3A8AA", tex="metal", tile=1.0, rough=0.6, metal=0.35)
mat("cardboard", "#C6A577", tex="kraft", tile=0.6, rough=0.95)
mat("graphiteBlock", "#4B4E53", tex="graphite", tile=0.3, rough=0.7)          # nozzle parts on the shelves
mat("board", "#F4F3EE", rough=0.3)                                            # whiteboard
mat("screen", "#1C2633", rough=0.2, emit="#1E2C40")                           # monitors and laptop
mat("traceRed", "#C8341E", rough=0.5, emit="#5A1208")                         # measured (red) and predicted (blue)
mat("traceBlue", "#1F5FA8", rough=0.5, emit="#0C2850")
mat("ledGreen", "#3FB27F", rough=0.3, emit="#2E9E6A")


# =====================================================================================================================
# helpers
# =====================================================================================================================
HERO = [False]           # bevels only where the camera comes within a metre (the thrust stand, the bench, the firing box):
_pbox, _pcyl = box, cyl  # a bevelled box exports about twice the vertices of a plain one


def box(size, loc, m, rot=(0, 0, 0), bevel=0.0, segs=1):
    return _pbox(size, loc, m, rot, bevel if HERO[0] else 0.0, segs)


def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=24, r2=None, bevel=0.0, segs=1):
    return _pcyl(r, depth, loc, m, rot, verts, r2, bevel if HERO[0] else 0.0, segs)


def arc_z(y, r):
    """the height of the roof circle of radius r over the line y"""
    return ZC + math.sqrt(max(r * r - (y + 12.0) ** 2, 0.0))


def arc_pts(r, ya, yb, n):
    return [(ya + (yb - ya) * k / n, arc_z(ya + (yb - ya) * k / n, r)) for k in range(n + 1)]


def pieces(a0, a1, z0, z1, holes):
    """the solid rectangles of a wall face a0..a1 by z0..z1 with rectangular holes (ha0, ha1, hz0, hz1)"""
    cuts = sorted(set([a0, a1] + [h[i] for h in holes for i in (0, 1) if a0 < h[i] < a1]))
    out = []
    for p, q in zip(cuts, cuts[1:]):
        mid = (p + q) / 2
        z = z0
        for hz0, hz1 in sorted((h[2], h[3]) for h in holes if h[0] < mid < h[1]):
            if hz0 > z:
                out.append((p, q, z, min(hz0, z1)))
            z = max(z, hz1)
        if z < z1 - 1e-6:
            out.append((p, q, z, z1))
    return out


def wall_x(y0, y1, x0, x1, z0, z1, holes=(), m="concreteOld", dens=5.0):
    """a wall running along X (thickness y0..y1) with holes given in (x0, x1, z0, z1)"""
    for (a, b, c, d) in pieces(x0, x1, z0, z1, holes):
        densify(box((b - a, y1 - y0, d - c), ((a + b) / 2, (y0 + y1) / 2, (c + d) / 2), m), dens)


def wall_y(x0, x1, y0, y1, z0, z1, holes=(), m="concreteOld", dens=5.0):
    """a wall running along Y (thickness x0..x1) with holes given in (y0, y1, z0, z1)"""
    for (a, b, c, d) in pieces(y0, y1, z0, z1, holes):
        densify(box((x1 - x0, b - a, d - c), ((x0 + x1) / 2, (a + b) / 2, (c + d) / 2), m), dens)


def decal(pts, o, u, v, m, lift=0.003):
    """a flat single-faced patch (paint, floor markings, labels): the polygon pts (counter-clockwise in u, v) on the
    plane through o, lifted along u x v. Four vertices for a rectangle, where a plate costs twenty"""
    o, u, v = Vector(o), Vector(u).normalized(), Vector(v).normalized()
    n = u.cross(v)
    V = [o + n * lift + u * a + v * b for a, b in pts]
    return mk("decal", V, [list(range(len(V)))], m)


def floor_decal(x0, y0, x1, y1, m, z=FL, lift=0.003):
    return decal(rect(x0, y0, x1, y1), (0, 0, z), (1, 0, 0), (0, 1, 0), m, lift)


def fchev(o, u, v, L, H, w, m1="hazard", m2="ink", lift=0.003):
    """a flat hazard band (amber stripes over black), single faces only"""
    decal(rect(0, 0, L, H), o, u, v, m2, lift)
    k = -int(H / w) - 2
    while k * 2 * w < L:
        x = k * 2 * w
        p = clip([(x, 0), (x + w, 0), (x + w + H, H), (x + H, H)], 0, L, 0, H)
        if len(p) >= 3:
            decal(p, o, u, v, m1, lift * 1.6)
        k += 1


def ribbon(W, pts, d, w, m):
    """a drawn line on a wall (marker on the whiteboard, a trace on a screen): pts are (a, z) in the wall's frame, one
    strip with two vertices a point"""
    V = []
    n = len(pts)
    for i in range(n):
        (a0, z0), (a1, z1) = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        L = math.hypot(a1 - a0, z1 - z0) or 1.0
        sa, sz = -(z1 - z0) / L * w / 2, (a1 - a0) / L * w / 2
        a, z = pts[i]
        V += [W.p(a - sa, z - sz, d), W.p(a + sa, z + sz, d)]
    F = [[2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1] for i in range(n - 1)]
    return mk("ribbon", V, F, m)


class WF:
    """a wall's own frame: a runs along the wall (u), z is height, d comes out of the wall into the room (n).
    u is always up x n, so a pattern laid out left to right reads left to right from the room"""
    def __init__(s, x, y, n):
        s.n = Vector(n)
        s.u = UP.cross(s.n)
        s.o = Vector((x, y, 0))

    def p(s, a, z, d=0.0):
        return s.o + s.u * a + s.n * d + Vector((0, 0, z))

    def box(s, a0, a1, z0, z1, d0, d1, m, bevel=0.0):
        c = s.p((a0 + a1) / 2, (z0 + z1) / 2, (d0 + d1) / 2)
        la, ld = abs(a1 - a0), abs(d1 - d0)
        size = (la, ld, z1 - z0) if abs(s.u.x) > 0.5 else (ld, la, z1 - z0)
        return box(size, tuple(c), m, bevel=bevel)

    def decal(s, a0, a1, z0, z1, m, lift=0.004):
        return decal(rect(a0, z0, a1, z1), s.o, s.u, UP, m, lift)

    def paint(s, a0, a1, z0, z1, m, holes=(), lift=0.004):
        for (a, b, c, d) in pieces(a0, a1, z0, z1, holes):
            s.decal(a, b, c, d, m, lift)


def lining(W, L, z0, z1, skips=(), pitch=0.25, slat=0.2, depth=0.035, mod=1.2, rails=(3.9,), m="acoustic"):
    """the test cell's acoustic lining on one wall: rows of perforated-steel louvres over a dark backing (the gaps read
    as the absorber behind), held by state-green battens every mod metres and rails at the rail heights. Each louvre
    is ONE face, its bottom edge standing depth off the wall and its top edge on it, so it faces the room and a little
    down (the cameras are low) and a whole wall costs a few hundred vertices. The battens and rails are single faces
    too. skips are the openings (a0, a1, z0, z1) it goes round"""
    for (a0, a1, za, zb) in pieces(0, L, z0, z1, skips):
        W.decal(a0, a1, za, zb, "ink", 0.004)
    V, F = [], []
    nrow = max(1, int(round((z1 - z0) / pitch)))
    p = (z1 - z0) / nrow
    for r in range(nrow):
        zb = z0 + r * p + (p - slat) / 2
        zt = zb + slat
        for (a0, a1, za, zz) in pieces(0, L, zb, zt, skips):
            if zz - za < slat * 0.99:
                continue
            i = len(V)
            V += [W.p(a0, zb, depth), W.p(a1, zb, depth), W.p(a1, zt, 0.008), W.p(a0, zt, 0.008)]
            F.append([i, i + 1, i + 2, i + 3])
    mk("louvres", V, F, m)
    V, F = [], []

    def quad(a0, a1, c0, c1, d):
        i = len(V)
        V.extend([W.p(a0, c0, d), W.p(a1, c0, d), W.p(a1, c1, d), W.p(a0, c1, d)])
        F.append([i, i + 1, i + 2, i + 3])
    n = max(1, int(round(L / mod)))
    for k in range(n + 1):
        a = L * k / n
        for (b0, b1, c0, c1) in pieces(max(0.0, a - 0.03), min(L, a + 0.03), z0 - 0.03, z1 + 0.03, skips):
            quad(b0, b1, c0, c1, depth + 0.006)
    for zr in (z0, z1) + tuple(rails):
        for (b0, b1, c0, c1) in pieces(0, L, zr - 0.035, zr + 0.035, skips):
            quad(b0, b1, c0, c1, depth + 0.003)
    mk("battens", V, F, "stateGreen")


def blades(c, along, out, L, w, n, dz, m="steelDark", ang=0.7):
    """n louvre blades stacked dz apart from c upward, each ONE face L long and w deep, sloping down to the outside
    (out) and facing out and down, the way a person on the ground sees them"""
    c, along, out = Vector(c), Vector(along).normalized(), Vector(out).normalized()
    h, d = UP * (w / 2 * math.sin(ang)), out * (w / 2 * math.cos(ang))
    V, F = [], []
    for k in range(n):
        q = c + UP * (k * dz)
        P = [q - along * L / 2 - d + h, q + along * L / 2 - d + h, q + along * L / 2 + d - h, q - along * L / 2 + d - h]
        nrm = (P[1] - P[0]).cross(P[3] - P[0])
        if nrm.dot(out - UP) < 0:
            P = P[::-1]
        i = len(V)
        V += P
        F.append([i, i + 1, i + 2, i + 3])
    return mk("blades", V, F, m)


def sweep(path, frames, prof, m, caps=True):
    """a closed profile (a, b) swept along path points with local frames (U, V): ribs, roof skins. A closed solid,
    normals recalculated"""
    k = len(prof)
    V, F = [], []
    for P, (U, Vv) in zip(path, frames):
        V += [Vector(P) + Vector(U) * a + Vector(Vv) * b for a, b in prof]
    for j in range(len(path) - 1):
        for i in range(k):
            F.append([j * k + i, j * k + (i + 1) % k, (j + 1) * k + (i + 1) % k, (j + 1) * k + i])
    if caps:
        F.append(list(range(k)))
        F.append([(len(path) - 1) * k + i for i in range(k)])
    return mk("sweep", V, F, m, recalc=True)


def ibeam_y(y0, y1, xc, zb, b=0.16, h=0.28, tf=0.014, tw=0.009, m="steelDark"):
    P = [(-b / 2, 0), (b / 2, 0), (b / 2, tf), (tw / 2, tf), (tw / 2, h - tf), (b / 2, h - tf), (b / 2, h),
         (-b / 2, h), (-b / 2, h - tf), (-tw / 2, h - tf), (-tw / 2, tf), (-b / 2, tf)]
    P = [(-(xc + a), zb + c) for a, c in P]
    return plate(P, (0, y0, 0), (-1, 0, 0), (0, 0, 1), y1 - y0, m)


def sq_collar(x, half, r, t, m="steelDark", n=16):
    """a square wall collar with a round hole for the augmenter (axis along X, face at x, t thick toward +X)"""
    V, F = [], []
    for z in (0.0, t):
        for k in range(n):
            a = 2 * math.pi * k / n
            c, s = math.cos(a), math.sin(a)
            g = half / max(abs(c), abs(s))
            V.append(Vector((x + z, AXY + r * c, AXZ + r * s)))
            V.append(Vector((x + z, AXY + g * c, AXZ + g * s)))
    for k in range(n):
        i, j = 2 * k, 2 * ((k + 1) % n)
        F.append([i, i + 1, j + 1, j])                                  # face at x
        F.append([2 * n + i, 2 * n + j, 2 * n + j + 1, 2 * n + i + 1])  # face at x + t
        F.append([i + 1, 2 * n + i + 1, 2 * n + j + 1, j + 1])          # outer edge
    return mk("collar", V, F, m, recalc=True)


def pendant(x, y, z, ztop, s=1.0, cage=True, nv=10):
    """a caged industrial pendant lamp hanging from ztop: graphite reflector, white inside, the glowing globe at z"""
    rod((x, y, ztop), (x, y, z + 0.3 * s), 0.01, "steel")
    cyl(0.035 * s, 0.05 * s, (x, y, z + 0.33 * s), "kitGraphite", verts=6)
    lathe([(0.29 * s, z + 0.04 * s), (0.26 * s, z + 0.1 * s), (0.08 * s, z + 0.29 * s), (0.03 * s, z + 0.32 * s)],
          "kitGraphite", verts=nv, loc=(x, y, 0))
    lathe([(0.03 * s, z + 0.305 * s), (0.075 * s, z + 0.28 * s), (0.25 * s, z + 0.095 * s), (0.28 * s, z + 0.04 * s)],
          "white", verts=nv, loc=(x, y, 0))
    sphere(0.075 * s, (x, y, z), "lamp", segs=8, rings=4)
    if cage:
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            rod((x + 0.2 * s * math.cos(a), y + 0.2 * s * math.sin(a), z + 0.06 * s),
                (x + 0.06 * s * math.cos(a), y + 0.06 * s * math.sin(a), z - 0.12 * s), 0.004, "steelDark", 4)
        tube([(x, y, z - 0.12 * s), (x, y, z - 0.11 * s)], 0.065 * s, "steelDark", sides=6, caps=False)


def strip_lamp(W, a, z, L=1.2):
    """a wall-mounted linear lamp: a graphite body, its glowing face tilted down into the room"""
    W.box(a - L / 2, a + L / 2, z - 0.05, z + 0.05, 0.0, 0.12, "kitGraphite", bevel=0.008)
    decal(rect(a - L / 2 + 0.04, 0.02, a + L / 2 - 0.04, 0.1), W.p(0, z - 0.05, 0), W.u, -W.n, "lamp", 0.004)


def bulkhead(W, a, z):
    """a small caged bulkhead lamp on a wall"""
    W.box(a - 0.09, a + 0.09, z - 0.13, z + 0.13, 0.0, 0.08, "kitGraphite")
    W.decal(a - 0.065, a + 0.065, z - 0.1, z + 0.1, "lamp", 0.084)
    for k in range(2):
        W.box(a - 0.075, a + 0.075, z - 0.035 + k * 0.06, z - 0.025 + k * 0.06, 0.08, 0.095, "kitGraphite")


def cctv(mount, n, target):
    """a CCTV camera on a wall arm, aimed at target"""
    mount, n = Vector(mount), Vector(n)
    p = mount + n * 0.32 + Vector((0, 0, 0.12))
    disc(mount, n, 0.07, "steelDark", 8, 0.004)
    tube([mount + n * 0.01, mount + n * 0.2, p - Vector((0, 0, 0.08))], 0.016, "steelDark", sides=6, sub=2)
    d = Vector(target) - p
    yaw = math.atan2(d.y, d.x)
    pitch = math.atan2(-d.z, math.hypot(d.x, d.y))
    with frame(tuple(p), rz=yaw, ry=pitch):
        box((0.05, 0.05, 0.08), (0, 0, -0.05), "steelDark")
        box((0.26, 0.1, 0.1), (0.03, 0, 0.0), "white", bevel=0.01)
        box((0.3, 0.13, 0.006), (0.05, 0, 0.056), "white", bevel=0.002)
        box((0.004, 0.065, 0.065), (0.162, 0, 0), "glass")
        box((0.012, 0.09, 0.09), (-0.103, 0, 0), "kitGraphite")
    tube([mount + n * 0.03 + Vector((0, 0, -0.04)), mount + n * 0.03 + Vector((0, 0, -0.6))], 0.005, "rubber", sides=4)


def chair(x, y, rz, office=True):
    """an office chair (five-star base, gas column, seat, back) or a plain stool"""
    with frame((x, y, FL), rz=rz):
        if office:
            for k in range(5):
                a = 2 * math.pi * k / 5
                rod((0, 0, 0.1), (0.28 * math.cos(a), 0.28 * math.sin(a), 0.04), 0.018, "kitGraphite", 3)
            cyl(0.022, 0.4, (0, 0, 0.28), "steel", verts=6)
            box((0.46, 0.46, 0.07), (0, 0, 0.48), "kitGraphite")
            box((0.03, 0.06, 0.32), (-0.24, 0, 0.62), "steelDark")
            box((0.05, 0.42, 0.42), (-0.27, 0, 0.88), "kitGraphite")
        else:
            for k in range(4):
                a = math.pi / 4 + k * math.pi / 2
                rod((0.12 * math.cos(a), 0.12 * math.sin(a), 0.62), (0.2 * math.cos(a), 0.2 * math.sin(a), 0.0),
                    0.012, "steelDark", 4)
            cyl(0.17, 0.05, (0, 0, 0.66), "cobalt", verts=10)


def monitor(x, y, z, rz, w=0.56, h=0.34, curve=False):
    """a monitor on a stand, screen facing local -Y after rz (curve: draws a thrust trace on it)"""
    with frame((x, y, z), rz=rz):
        box((0.2, 0.16, 0.012), (0, 0, 0.006), "kitGraphite", bevel=0.004)
        box((0.04, 0.03, 0.2), (0, 0.03, 0.11), "kitGraphite")
        box((w, 0.03, h), (0, 0, 0.12 + h / 2), "ink", bevel=0.006)
        decal(rect(-w / 2 + 0.015, 0.135, w / 2 - 0.015, 0.105 + h), (0, -0.015, 0), (1, 0, 0), (0, 0, 1), "screen",
              0.001)
    if curve:
        W = WF(0, 0, (0, -1, 0))
        W.o = Vector((x, y - 0.0175, 0))
        W.u = Vector((-1, 0, 0))
        pts_b = [(0.22 - 0.44 * t, z + 0.16 + 0.22 * (1.0 if 0.12 < t < 0.8 else 0.0) * (0.75 + 0.25 * math.sin(t * 3)))
                 for t in [k / 14 for k in range(15)]]
        pts_r = [(a, zz + 0.012 * math.sin(i * 1.7)) for i, (a, zz) in enumerate(pts_b)]
        with frame((0, 0, 0), M=Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, "Z") @
                   Matrix.Translation((-x, -y, 0))):
            ribbon(W, pts_b, 0.004, 0.006, "traceBlue")
            ribbon(W, pts_r, 0.005, 0.006, "traceRed")


def nozzle_part(x, y, z, s=1.0, m="graphiteBlock"):
    """a small nozzle (graphite insert in a housing): a converging-diverging outline, standing on its flange"""
    lathe([(0.05 * s, z), (0.05 * s, z + 0.025 * s), (0.034 * s, z + 0.05 * s), (0.026 * s, z + 0.07 * s),
           (0.042 * s, z + 0.13 * s)], m, verts=8, loc=(x, y, 0))


def case_tube(x0, x1, y, z, r, m="alu"):
    cyl(r, x1 - x0, ((x0 + x1) / 2, y, z + r), m, rot=(0, math.pi / 2, 0), verts=8)


# =====================================================================================================================
# 1. the shell: slab, walls, blast wall, roof, roll-up door opening, exterior
# =====================================================================================================================
def build_shell():
    tally("slab")
    # the slab's top only (the walls stand on its edges and the game draws the ground), a grid for the AO
    heightfield(grid(XI0, PX0, 1.6), grid(YI0, YI1, 1.6, (RD[0], RD[1])), lambda x, y: FL, "concrete")
    heightfield([X0, XI0], [RD[0], RD[1]], lambda x, y: FL, "concrete")
    heightfield([PX0, PX1], [BD0, BD1], lambda x, y: FL, "concrete")
    heightfield(grid(PX1, XI1, 1.25), grid(YI0, YI1, 1.25), lambda x, y: FL, "floorPaint")
    for yy in (-15.35, -8.65):                                                     # bay slab joints
        floor_decal(XI0, yy - 0.006, PX0, yy + 0.006, "sealant")
    for xx in (-59.5, -51.5):
        floor_decal(xx - 0.006, YI0, xx + 0.006, YI1, "sealant")

    tally("walls")
    door_n = (-61.6, -60.6, 0.0, FL + 2.1)                                          # personnel door, north wall
    wall_x(Y1 - WT, Y1, X0, X1, 0.0, EAVE, [door_n])                                # north
    wall_x(Y0, Y0 + WT, X0, X1, 0.0, EAVE)                                          # south
    wall_y(X0, X0 + WT, YI0, YI1, 0.0, EAVE, [(RD[0], RD[1], 0.0, RD[2])])          # west, the roll-up door opening
    wall_y(X1 - WT, X1, YI0, YI1, 0.0, EAVE, [(-12.6, -11.4, 0.45, 1.65)])          # east, the augmenter
    for xg in (X0, X1 - WT):                                                       # gable tops over the eaves
        P = [(Y0, EAVE - 0.05), (Y1, EAVE - 0.05)] + [(y, z + 0.02) for y, z in arc_pts(RA, Y1, Y0, 12)[1:-1]]
        plate(P, (xg, 0, 0), (0, 1, 0), (0, 0, 1), WT, "concreteOld")
    # the blast wall (1 m) up to the roof shell, with the blast door and the control room door
    wall_y(PX0, PX1, YI0, YI1, FL, 7.6, [(BD0, BD1, FL, BDZ), (CD0, CD1, FL, CDZ)], m="concrete", dens=2.2)
    P = [(YI0, 7.55), (YI1, 7.55)] + [(y, z + 0.06) for y, z in arc_pts(RI, YI1, YI0, 12)[1:-1]]
    plate(P, (PX0, 0, 0), (0, 1, 0), (0, 0, 1), PX1 - PX0, "concrete")
    # exterior: pilasters, a plinth band, string course
    for xx in (-60.0, -56.0, -52.0, -48.0, -44.0, -40.0):
        for (yy, s) in ((Y1, 1), (Y0, -1)):
            box((0.5, 0.22, EAVE - 0.1), (xx, yy + s * 0.11, (EAVE - 0.1) / 2), "concreteOld")
    for (yy, s) in ((Y1, 1), (Y0, -1)):
        o = box((X1 - X0 + 0.1, 0.06, 0.55), ((X0 + X1) / 2, yy + s * 0.03, 0.275), "concreteDark")
        densify(o, 7.0)
    for xx, s in ((X0, -1), (X1, 1)):
        for (a, b) in ((Y0 - 0.06, RD[0] if s < 0 else -12.7), (RD[1] if s < 0 else -11.3, Y1 + 0.06)):
            box((0.06, b - a, 0.55), (xx + s * 0.03, (a + b) / 2, 0.275), "concreteDark")

    tally("roof")
    # inside: the concrete shell over the bay (one downward surface), steel arch ribs
    xs = grid(XI0, PX0 + 0.5, 2.0)
    arc = arc_pts(RI, YI0 - 0.05, YI1 + 0.05, 12)
    V = [Vector((x, y, z)) for x in xs for (y, z) in arc]
    n = len(arc)
    F = [[k * n + j, k * n + j + 1, (k + 1) * n + j + 1, (k + 1) * n + j] for k in range(len(xs) - 1) for j in range(n - 1)]
    mk("shell", V, F, "concreteOld")
    # outside: the standing-seam steel skin (overhanging 0.3 m), its seams, gutters and downpipes
    ya, yb = Y0 - 0.35, Y1 + 0.35
    top = arc_pts(RA + 0.06, ya, yb, 14)
    bot = arc_pts(RA - 0.02, yb, ya, 14)
    prof = top + bot
    sweep([(X0 - 0.3, 0, 0), (X1 + 0.3, 0, 0)], [((0, 1, 0), (0, 0, 1))] * 2, prof, "roofSteel")
    for (yy, s) in ((Y1, 1), (Y0, -1)):
        g = yy + s * 0.48
        box((X1 - X0 + 0.6, 0.18, 0.14), ((X0 + X1) / 2, g, EAVE - 0.06), "steelDark")
        for xx in (-63.5, -36.5):
            tube([(xx, g, EAVE - 0.08), (xx, yy + s * 0.1, EAVE - 0.5), (xx, yy + s * 0.1, 0.3),
                  (xx, yy + s * 0.3, 0.06)], 0.055, "steelDark", sides=6, sub=0)
    # rain streaks under the gutters on the north wall (the side the range sees)
    rnd = random.Random(17)
    for k in range(14):
        xx = rnd.uniform(-63.5, -36.5)
        L = rnd.uniform(1.0, 3.2)
        w = rnd.uniform(0.15, 0.5)
        decal([(xx - w / 2, EAVE - 0.15), (xx + w / 2, EAVE - 0.15), (xx + w * 0.3, EAVE - 0.15 - L), (xx - w * 0.3, EAVE - 0.15 - L * 0.8)],
              (0, Y1, 0), (1, 0, 0), (0, 0, 1), "concreteDark", 0.006)

    tally("roof intake louvres")
    # the cell's acoustic air intake on the roof: a louvred box astride the crown
    IX0, IX1, IY0, IY1 = -45.0, -39.0, -14.2, -9.8
    zb = arc_z(-14.2, RA) - 0.1
    box((IX1 - IX0, IY1 - IY0, 2.0), ((IX0 + IX1) / 2, (IY0 + IY1) / 2, zb + 1.0), "soot")
    for (yy, s) in ((IY1, 1), (IY0, -1)):
        blades(((IX0 + IX1) / 2, yy + s * 0.05, zb + 0.35), (1, 0, 0), (0, s, 0), IX1 - IX0 - 0.2, 0.3, 6, 0.27)
        for xx in (IX0 + 0.1, (IX0 + IX1) / 2, IX1 - 0.1):
            box((0.12, 0.34, 1.9), (xx, yy + s * 0.05, zb + 1.05), "steelDark")
    box((IX1 - IX0 + 0.4, IY1 - IY0 + 0.6, 0.12), ((IX0 + IX1) / 2, (IY0 + IY1) / 2, zb + 2.06), "steelDark", bevel=0.02)
    for xx in (IX0, IX1):
        box((0.12, IY1 - IY0 + 0.3, 2.0), (xx, (IY0 + IY1) / 2, zb + 1.0), "steelDark")
    for xx in (-61.0, -53.0):                                                        # mushroom vents over the bay
        cyl(0.2, 0.7, (xx, -12.0, CROWN + 0.35), "steelDark", verts=10)
        cyl(0.42, 0.1, (xx, -12.0, CROWN + 0.78), "steelDark", verts=12, r2=0.15)

    tally("north face")
    N = WF(0, Y1, (0, 1, 0))                                   # outer north face: a = -x
    # wall louvres high on the cell (acoustic baffles)
    for (xa, xb) in ((-43.6, -40.4), (-39.6, -36.6)):
        a0, a1 = -xb, -xa
        N.box(a0, a1, 5.2, 6.6, 0.0, 0.12, "steelDark", bevel=0.01)
        N.decal(a0 + 0.08, a1 - 0.08, 5.28, 6.52, "soot", 0.125)
        blades(N.p((a0 + a1) / 2, 5.36, 0.17), (1, 0, 0), (0, 1, 0), a1 - a0 - 0.16, 0.2, 6, 0.22, m="stateGreen")
    # the big stencil "41" on a painted panel
    N.decal(44.4, 47.6, 3.0, 5.6, "white", 0.006)
    stencil("41", N.p(44.62, 3.3, 0.006), N.u, UP, 2.0, m="stencil", t=0.004)
    # the personnel door (state green), its canopy, step and lamp
    N.box(60.6, 61.6, FL, FL + 2.1, -0.06, 0.0, "stateGreen", bevel=0.004)
    for z in (0.5, 1.9):
        N.box(60.58, 60.66, z - 0.06, z + 0.06, 0.0, 0.03, "steel")
    N.box(61.38, 61.46, 1.05, 1.15, 0.0, 0.07, "steel")
    N.box(60.4, 61.8, FL + 2.25, FL + 2.33, 0.0, 0.7, "steelDark", bevel=0.01)
    for a in (60.5, 61.7):
        rod(N.p(a, FL + 2.3, 0.65), N.p(a, FL + 2.9, 0.01), 0.012, "steelDark")
    N.box(60.3, 61.9, 0.0, FL, 0.0, 0.6, "concrete", bevel=0.01)
    bulkhead(N, 61.1, FL + 2.75)
    N.decal(60.2, 60.5, 1.4, 1.7, "stencil", 0.006)
    # the startup's cobalt sign: a panel with a white rule and a flame chevron
    N.box(55.0, 58.6, 3.3, 4.3, 0.0, 0.07, "cobalt", bevel=0.01)
    N.decal(55.2, 58.4, 3.45, 3.52, "white", 0.074)
    decal([(57.95, 3.62), (58.3, 3.62), (58.12, 4.14), (57.98, 3.85)], N.p(0, 0, 0), N.u, UP, "white", 0.074)
    for a in (55.4, 58.2):
        N.box(a - 0.03, a + 0.03, 4.3, 4.5, 0.0, 0.03, "steel")

    tally("west end, roll-up door outside")
    Wx = WF(X0, 0, (-1, 0, 0))                                 # outer west face: a = -y
    for (a0, a1) in ((-RD[1] - 0.12, -RD[1]), (-RD[0], -RD[0] + 0.12)):
        Wx.box(a0, a1, 0.0, RD[2] + 0.12, 0.0, 0.05, "steelDark")
    Wx.box(-RD[1] - 0.12, -RD[0] + 0.12, RD[2], RD[2] + 0.12, 0.0, 0.05, "steelDark")
    fchev(Wx.p(-RD[1] - 0.5, 0.0, 0.0), Wx.u, UP, 0.36, 2.2, 0.12)
    fchev(Wx.p(-RD[0] + 0.14, 0.0, 0.0), Wx.u, UP, 0.36, 2.2, 0.12)
    for a in (-RD[1] - 1.1, -RD[0] + 1.1):
        bulkhead(Wx, a, RD[2] + 0.5)
    wedge(X0, X0 - 3.5, RD[0] - 0.8, RD[1] + 0.8, FL, 0.02, "concrete")
    for yy in (RD[0] - 0.45, RD[1] + 0.45):
        cyl(0.11, 1.0, (X0 - 0.5, yy, 0.5), "hazard", verts=12)
        cyl(0.115, 0.05, (X0 - 0.5, yy, 0.78), "ink", verts=12)
    # south: the climate plant (the old conditioning hut's job) and its duct up into the cell
    with frame((-43.2, -20.6, 0)):
        box((3.4, 1.8, 0.2), (0, 0, 0.1), "concrete", bevel=0.02)
        box((3.0, 1.4, 1.3), (0, 0, 0.85), "white", bevel=0.03)
        box((3.02, 1.42, 0.12), (0, 0, 0.3), "stateGreen")
        for xx in (-0.75, 0.75):
            disc((xx, 0, 1.502), (0, 0, 1), 0.5, "ink", 16, 0.0)
            tube([(xx, 0, 1.5), (xx, 0, 1.56)], 0.52, "steelDark", sides=16, caps=False)
            for k in range(3):
                box((0.98, 0.03, 0.03), (xx, -0.3 + k * 0.3, 1.57), "steelDark")
        for k in range(7):
            box((2.6, 0.02, 0.05), (0, -0.715, 0.5 + k * 0.12), "steelDark")
        box((0.4, 0.3, 0.3), (1.4, 0.6, 1.1), "steelDark")
        plate(rect(-0.2, 0, 0.2, 0.12), (-1.0, -0.705, 1.25), (1, 0, 0), (0, 0, 1), 0.004, "cobalt")
    box((0.5, 0.4, 4.6), (-39.0, -19.2, 3.25), "white", bevel=0.01)
    box((0.5, 1.15, 0.4), (-39.0, -20.15, 1.15), "white", bevel=0.01)
    box((0.62, 0.46, 0.08), (-39.0, -19.2, 5.55), "steelDark")
    # the ground round the building: worn apron, a track to the roll-up door, salt crust
    apron(-49.0, -12.0, 15.0, 7.0, [0.0, 0.7, 2.2, 4.5], 0.006, "worn", noise=0.5, seed=41, ns=6, nc=4)
    ruts([(-33.0, -28.5), (-44.0, -26.0), (-58.0, -24.5), (-66.5, -20.5), (-69.0, -14.5), (-67.5, -12.0), (-64.8, -12.0)],
         gauge=1.7)
    for (cx, cy, r, s) in ((-30.0, -2.0, 2.0, 5), (-68.0, -2.5, 2.4, 6), (-52.0, -23.0, 1.6, 7)):
        blob(cx, cy, r, 0.004, "salt", seed=s)


build_shell()
finish_group("hush", levels=(0.0, FL))


# =====================================================================================================================
# 2. the interior: the build bay, the test cell, the control room
# =====================================================================================================================
def build_bay():
    tally("bay walls paint, columns, ribs")
    WN = WF(XI0, YI1, (0, -1, 0))          # north inner face, a = x - XI0
    WS = WF(PX0, YI0, (0, 1, 0))           # south inner face, a = PX0 - x
    WW = WF(XI0, YI0, (1, 0, 0))           # west inner face, a = y - YI0
    WP = WF(PX0, YI1, (-1, 0, 0))          # blast wall's bay face, a = YI1 - y
    for (W, L, holes) in ((WN, PX0 - XI0, [(-61.6 - XI0, -60.6 - XI0, 0, FL + 2.1)]), (WS, PX0 - XI0, []),
                          (WW, YI1 - YI0, [(RD[0] - YI0, RD[1] - YI0, 0, RD[2])]),
                          (WP, YI1 - YI0, [(YI1 - BD1, YI1 - BD0, 0, BDZ), (YI1 - CD1, YI1 - CD0, 0, CDZ)])):
        W.paint(0, L, FL, 1.4, "stateGreen", holes)
        W.paint(0, L, 1.4, 1.46, "white", holes)
        W.paint(0, L, FL, FL + 0.12, "ink", holes, lift=0.006)
    # steel columns at the walls, arch ribs under the shell, corbels and the crane runways
    for xx in (-62.0, -58.0, -54.0, -50.0):
        for (yy, s) in ((YI1, -1), (YI0, 1)):
            box((0.3, 0.25, 7.65 - FL), (xx, yy + s * 0.125, (7.65 + FL) / 2), "stateGreen", bevel=0.01)
            box((0.3, 0.35, 0.3), (xx, yy + s * 0.35, 5.12), "stateGreen", bevel=0.01)
        arc = arc_pts(RI - 0.15, YI0 + 0.02, YI1 - 0.02, 7)
        path = [(xx, y, z) for y, z in arc]
        frames = []
        for (y, z) in arc:
            r = Vector((0, y + 12.0, z - ZC)).normalized()
            frames.append(((1, 0, 0), tuple(r)))
        sweep(path, frames, [(-0.11, -0.2), (0.11, -0.2), (0.11, 0.17), (-0.11, 0.17)], "stateGreen")
    for yy in (YI0 + 0.45, YI1 - 0.45):
        densify(box((PX0 - XI0 - 0.2, 0.2, 0.03), ((XI0 + PX0) / 2, yy, 5.575), "steelDark"), 4.0)    # runway beam:
        densify(box((PX0 - XI0 - 0.2, 0.02, 0.27), ((XI0 + PX0) / 2, yy, 5.425), "steelDark"), 4.0)   # flange, web
        densify(box((PX0 - XI0 - 0.2, 0.2, 0.03), ((XI0 + PX0) / 2, yy, 5.285), "steelDark"), 4.0)
        box((PX0 - XI0 - 0.2, 0.05, 0.06), ((XI0 + PX0) / 2, yy, 5.62), "steel")
    # the overhead crane: end trucks on the runways, a yellow box girder, the hoist, the hook and its pendant
    CX = -57.0
    for yy in (YI0 + 0.45, YI1 - 0.45):
        box((1.4, 0.26, 0.26), (CX, yy, 5.78), "hazard", bevel=0.015)
        box((0.06, 0.05, 0.12), (CX + 0.72, yy, 5.78), "rubber")
    densify(box((0.36, YI1 - YI0 - 0.7, 0.52), (CX, -12.0, 6.17), "hazard", bevel=0.02), 3.0)
    box((0.38, 0.6, 0.04), (CX, -12.0, 6.17), "ink")
    HY = -14.3
    box((0.62, 0.5, 0.24), (CX, HY, 5.8), "hazard", bevel=0.015)
    box((0.42, 0.36, 0.4), (CX, HY, 5.48), "kitGraphite", bevel=0.02)
    cyl(0.13, 0.42, (CX, HY + 0.1, 5.5), "kitGraphite", rot=(math.pi / 2, 0, 0), verts=12)
    rod((CX + 0.05, HY, 5.28), (CX + 0.05, HY, 3.95), 0.008, "steel", 4)
    rod((CX - 0.05, HY, 5.28), (CX - 0.05, HY, 3.95), 0.008, "steel", 4)
    box((0.16, 0.12, 0.22), (CX, HY, 3.84), "hazard", bevel=0.01)
    torus(0.055, 0.014, (CX, HY, 3.66), "steel", rot=(math.pi / 2, 0, 0), major=10, minor=4)
    tube([(CX + 0.15, HY - 0.1, 5.3), (CX + 0.17, HY - 0.12, 3.0), (CX + 0.17, HY - 0.12, 1.48)], 0.006, "rubber",
         sides=4)
    box((0.07, 0.05, 0.2), (CX + 0.17, HY - 0.12, 1.38), "hazard", bevel=0.008)
    for k in range(3):
        cyl(0.01, 0.012, (CX + 0.17, HY - 0.146, 1.44 - k * 0.045), "ink" if k else "cableRed",
            rot=(math.pi / 2, 0, 0), verts=6)

    tally("bay lamps")
    for (x, y) in ((-59.0, -12.0), (-51.5, -12.0)):
        pendant(x, y, 6.6, arc_z(y, RI), s=1.4, cage=False, nv=6)
    for xx in (-62.0, -54.0):
        for (W, a) in ((WN, xx - XI0 + 0.32), (WS, PX0 - xx + 0.32)):
            bulkhead(W, a, 3.6)

    tally("roll-up door inside")
    cyl(0.4, RD[1] - RD[0] + 0.8, (XI0 + 0.45, (RD[0] + RD[1]) / 2, RD[2] + 0.55), "stateGreen", rot=(math.pi / 2, 0, 0),
        verts=16)
    for yy in (RD[0] - 0.4, RD[1] + 0.4):
        cyl(0.43, 0.04, (XI0 + 0.45, yy, RD[2] + 0.55), "steelDark", rot=(math.pi / 2, 0, 0), verts=16)
    for (yy, s) in ((RD[0], -1), (RD[1], 1)):
        box((0.12, 0.1, RD[2] - FL + 0.3), (XI0 + 0.08, yy + s * 0.05, (RD[2] + FL + 0.3) / 2), "steelDark")
        fchev(Vector((XI0 + 0.002, yy + s * 0.12, FL)), (0, s, 0) if s > 0 else (0, -1, 0), UP, 0.4, 1.8, 0.12)
    box((0.08, RD[1] - RD[0], 0.12), (XI0 + 0.2, (RD[0] + RD[1]) / 2, RD[2] - 0.02), "steelDark")
    box((0.2, 0.25, 0.35), (XI0 + 0.3, RD[1] + 0.6, 2.2), "kitGraphite", bevel=0.01)
    tube([(XI0 + 0.3, RD[1] + 0.6, 2.4), (XI0 + 0.3, RD[1] + 0.6, RD[2] + 0.2)], 0.012, "steelDark", sides=4)

    tally("blast door, bay side")
    # the opening's steel lining, the sliding leaf (slid open to +Y) on its track, beacons, the "Б-3" stencil
    for yy in (BD0, BD1):
        box((PX1 - PX0, 0.014, BDZ - FL), ((PX0 + PX1) / 2, yy + (0.007 if yy == BD0 else -0.007), (BDZ + FL) / 2), "steelDark")
    box((PX1 - PX0, BD1 - BD0, 0.014), ((PX0 + PX1) / 2, (BD0 + BD1) / 2, BDZ - 0.007), "steelDark")
    box((PX1 - PX0, BD1 - BD0, 0.012), ((PX0 + PX1) / 2, (BD0 + BD1) / 2, FL + 0.006), "steel")
    for a0, a1 in ((YI1 - BD0, YI1 - BD0 + 0.16), (YI1 - BD1 - 0.16, YI1 - BD1)):
        WP.box(a0, a1, FL, BDZ + 0.16, 0.0, 0.04, "steelDark")
        fchev(WP.p(a0 + (0.16 if a0 > YI1 - BD0 - 0.01 else -0.5), FL, 0.0), WP.u, UP, 0.34, 2.0, 0.11)
    WP.box(YI1 - BD1 - 0.16, YI1 - BD0 + 0.16, BDZ, BDZ + 0.16, 0.0, 0.04, "steelDark")
    LY0, LY1 = BD1 + 0.15, BD1 + 3.15                                            # the leaf, slid open
    LX0, LX1 = PX0 - 0.36, PX0 - 0.06
    box((LX1 - LX0, LY1 - LY0, 3.3), ((LX0 + LX1) / 2, (LY0 + LY1) / 2, FL + 0.02 + 1.65), "steelDark", bevel=0.02)
    for k in range(3):
        box((0.04, LY1 - LY0 - 0.2, 0.06), (LX0 - 0.02, (LY0 + LY1) / 2, FL + 0.4 + k * 1.3), "steelDark")
    fchev(Vector((LX0 - 0.005, LY0 + 0.4, FL + 0.2)), (0, -1, 0), UP, 0.4, 3.0, 0.12, lift=0.0)
    LW = WF(LX0 - 0.04, 0, (-1, 0, 0))
    stencil("3", LW.p(-LY1 + 1.05, FL + 1.25, 0.0), LW.u, UP, 0.9, m="white", t=0.004)
    box((0.08, 0.05, 0.5), (LX0 - 0.06, LY0 + 0.15, FL + 1.3), "steel", bevel=0.01)
    for k, yy in enumerate((LY0 + 0.45, LY1 - 0.45)):                           # trolleys on the track
        box((0.08, 0.3, 0.3), ((LX0 + LX1) / 2, yy, FL + 3.45), "steelDark")
        cyl(0.09, 0.06, ((LX0 + LX1) / 2, yy, FL + 3.68), "steel", rot=(0, math.pi / 2, 0), verts=12)
    densify(ibeam_y(BD0 - 0.4, LY1 + 0.3, (LX0 + LX1) / 2, FL + 3.78, b=0.18, h=0.25), 3.0)
    for yy in (BD0 - 0.3, -8.7, LY1 + 0.2):
        box((0.36, 0.12, 0.3), (PX0 - 0.18, yy, FL + 3.9), "steelDark")
    box((0.08, LY1 - BD0 + 0.6, 0.03), (PX0 - 0.2, (BD0 + LY1) / 2, FL + 0.015), "steel")
    for side, xx in ((-1, PX0), (1, PX1)):                                       # beacons both sides
        box((0.18, 0.18, 0.06), (xx + side * 0.09, -12.0, BDZ + 0.6), "ink")
        cyl(0.07, 0.05, (xx + side * 0.17, -12.0, BDZ + 0.66), "ink", verts=12)
        sphere(0.065, (xx + side * 0.17, -12.0, BDZ + 0.74), "beacon", segs=8, rings=4, scale=(1, 1, 1.25))
    box((0.18, 0.12, 0.06), (PX0 - 0.09, -12.6, BDZ + 0.6), "ink")
    sphere(0.05, (PX0 - 0.16, -12.6, BDZ + 0.7), "strobe", segs=8, rings=4, scale=(1, 1, 1.2))
    WP.decal(YI1 + 10.4, YI1 + 13.6, 4.5, 5.5, "white", 0.005)
    stencil("Б-3", WP.p(YI1 + 11.18, 4.65, 0.005), WP.u, UP, 0.7, m="stencil", t=0.004)
    # the control room door (closed, state green), its sign
    WP.box(YI1 - CD1 - 0.05, YI1 - CD0 + 0.05, FL, CDZ + 0.05, 0.0, 0.06, "stateGreen", bevel=0.005)
    for z in (0.55, 1.95):
        WP.box(YI1 - CD0 + 0.02, YI1 - CD0 + 0.09, z - 0.07, z + 0.07, 0.0, 0.03, "steel")
    WP.box(YI1 - CD1 + 0.02, YI1 - CD1 + 0.14, 1.1, 1.14, 0.06, 0.11, "steel")
    WP.decal(YI1 - CD1 - 0.0, YI1 - CD0, CDZ + 0.2, CDZ + 0.45, "stencil", 0.005)
    WP.decal(YI1 - CD1 + 0.08, YI1 - CD0 - 0.08, CDZ + 0.29, CDZ + 0.36, "white", 0.007)
    # the threshold zone in front of the blast door, walkway lines, the roll-up door's keep-clear
    fchev(Vector((PX0 - 1.4, BD0, FL)), (1, 0, 0), (0, 1, 0), 1.4, BD1 - BD0, 0.18)
    for yy in (-16.2, -7.8):
        floor_decal(XI0 + 0.3, yy - 0.04, PX0 - 1.5, yy + 0.04, "hazard")
    floor_decal(XI0 + 0.4, RD[0], XI0 + 0.5, RD[1], "hazard")

    tally("assembly bench")
    HERO[0] = True
    BX, BY = -54.5, -12.0
    TOP = FL + 0.9
    with frame((BX, BY, 0)):
        for dx in (-1.44, 1.44):
            for dy in (-0.39, 0.39):
                box((0.06, 0.06, TOP - 0.05 - FL), (dx, dy, (TOP - 0.05 + FL) / 2), "kitGraphite")
                box((0.1, 0.1, 0.02), (dx, dy, FL + 0.01), "rubber")
        for dy in (-0.39, 0.39):
            box((2.94, 0.05, 0.08), (0, dy, TOP - 0.09), "kitGraphite", bevel=0.005)
            box((2.94, 0.04, 0.04), (0, dy, FL + 0.28), "kitGraphite")
        for dx in (-1.44, 1.44):
            box((0.05, 0.84, 0.08), (dx, 0, TOP - 0.09), "kitGraphite")
        box((2.92, 0.82, 0.02), (0, 0, FL + 0.31), "steelDark")
        o = box((3.0, 0.9, 0.05), (0, 0, TOP - 0.025), "wood", bevel=0.008)
        densify(o, 0.7)
        box((3.0, 0.02, 0.05), (0, 0.46, TOP - 0.025), "cobalt")
        # under-shelf: bins and the red toolbox
        for k, dx in enumerate((-1.0, -0.55, -0.1)):
            box((0.4, 0.55, 0.22), (dx, 0, FL + 0.43), "cobalt", bevel=0.01)
            box((0.12, 0.012, 0.05), (dx, 0.28, FL + 0.48), "white")
        box((0.6, 0.3, 0.25), (0.75, -0.05, FL + 0.445), "stencil", bevel=0.015)
        box((0.3, 0.04, 0.03), (0.75, -0.05, FL + 0.6), "ink")
        # the vice on the west end
        box((0.22, 0.2, 0.08), (-1.3, -0.1, TOP + 0.04), "kitGraphite", bevel=0.008)
        box((0.06, 0.2, 0.12), (-1.24, -0.1, TOP + 0.14), "kitGraphite", bevel=0.006)
        box((0.06, 0.2, 0.12), (-1.36, -0.1, TOP + 0.14), "kitGraphite", bevel=0.006)
        cyl(0.012, 0.28, (-1.46, -0.1, TOP + 0.1), "steel", rot=(0, math.pi / 2, 0), verts=6)
        cyl(0.01, 0.2, (-1.58, -0.1, TOP + 0.1), "steel", verts=6)
        # the east end: a parts tray, a torque wrench, a bottle of nothing, the lamp
        box((0.36, 0.26, 0.04), (1.22, -0.18, TOP + 0.02), "cobalt", bevel=0.006)
        for k in range(3):
            cyl(0.022, 0.012, (1.12 + k * 0.08, -0.18, TOP + 0.046), "alu", verts=8)
        rod((0.95, 0.2, TOP + 0.012), (1.4, 0.3, TOP + 0.012), 0.009, "steel")
        cyl(0.016, 0.1, (1.4, 0.3, TOP + 0.012), "stencil", rot=(0, math.pi / 2, 0.22), verts=6)
        box((0.21, 0.297, 0.004), (0.98, -0.2, TOP + 0.002), "white")
        cyl(0.05, 0.03, (1.35, -0.38, TOP + 0.015), "kitGraphite", verts=10)
        rod((1.35, -0.38, TOP + 0.03), (1.25, -0.36, TOP + 0.45), 0.008, "kitGraphite", 5)
        rod((1.25, -0.36, TOP + 0.45), (0.95, -0.2, TOP + 0.62), 0.008, "kitGraphite", 5)
        with frame((0.92, -0.18, TOP + 0.6), rz=math.pi * 0.9, ry=0.9):
            lathe([(0.02, 0.05), (0.06, 0.0), (0.065, -0.005)], "cobalt", verts=10)
            disc((0, 0, -0.004), (0, 0, -1), 0.058, "lamp", 10, 0.0)
    floor_decal(BX - 1.3, BY + 0.6, BX + 1.3, BY + 1.25, "rubber", lift=0.006)
    for (x0, y0, x1, y1) in ((BX - 1.9, BY - 0.95, BX + 1.9, BY - 0.9), (BX - 1.9, BY + 1.4, BX + 1.9, BY + 1.45),
                             (BX - 1.9, BY - 0.95, BX - 1.85, BY + 1.45), (BX + 1.85, BY - 0.95, BX + 1.9, BY + 1.45)):
        floor_decal(x0, y0, x1, y1, "hazard")

    HERO[0] = False
    tally("parts cart")
    with frame((-52.0, -13.95, 0), rz=0.12):
        for dx in (-0.42, 0.42):
            for dy in (-0.24, 0.24):
                box((0.03, 0.03, 0.8), (dx, dy, FL + 0.48), "cobalt")
                cyl(0.04, 0.03, (dx, dy, FL + 0.05), "rubber", rot=(math.pi / 2, 0, 0), verts=8)
                box((0.04, 0.03, 0.05), (dx, dy, FL + 0.08), "steelDark")
        for z in (FL + 0.25, FL + 0.82):
            box((0.9, 0.52, 0.025), (0, 0, z), "cobalt", bevel=0.005)
            box((0.9, 0.02, 0.05), (0, 0.26, z + 0.03), "cobalt")
            box((0.9, 0.02, 0.05), (0, -0.26, z + 0.03), "cobalt")
        rod((0.44, -0.22, FL + 0.88), (0.5, -0.22, FL + 1.0), 0.012, "kitGraphite", 5)
        rod((0.44, 0.22, FL + 0.88), (0.5, 0.22, FL + 1.0), 0.012, "kitGraphite", 5)
        rod((0.5, -0.22, FL + 1.0), (0.5, 0.22, FL + 1.0), 0.016, "rubber", 6)
        case_tube(-0.38, 0.32, 0.08, FL + 0.835, 0.045, "alu")
        case_tube(-0.36, 0.2, -0.1, FL + 0.835, 0.035, "kitGraphite")
        nozzle_part(0.3, -0.12, FL + 0.835)
        box((0.4, 0.3, 0.2), (-0.15, 0, FL + 0.365), "cardboard")
        box((0.3, 0.25, 0.15), (0.25, 0.05, FL + 0.34), "cobalt", bevel=0.008)

    tally("racking")
    def rack(xa, xb):
        y0, y1 = YI0 + 0.06, YI0 + 0.66
        xs = [xa, (xa + xb) / 2, xb]
        for x in xs:
            for yy in (y0, y1):
                box((0.07, 0.06, 2.45), (x, yy, FL + 1.225), "cobalt")
            tube([(x, y0 if k % 2 else y1, FL + 0.15 + k * 0.9) for k in range(3)], 0.01, "cobalt", sides=3, caps=False)
        for z in (FL + 0.18, FL + 0.82, FL + 1.46, FL + 2.1):
            for yy in (y0, y1):
                box((xb - xa, 0.05, 0.1), ((xa + xb) / 2, yy, z), "hazard")
            decal(rect(xa, y0, xb, y1), (0, 0, z + 0.05), (1, 0, 0), (0, 1, 0), "steel", 0.0)
        return [FL + 0.25, FL + 0.89, FL + 1.53, FL + 2.17]

    # what sits on each shelf, bottom to top: a few things each, generic hardware only (tubes, closures, nozzles, boxes)
    layouts = [[("tubes", 1.3), ("box", 0.55), ("bin", 0.4)], [("box", 0.45), ("nozzles", 0.3), ("tubes", 1.0)],
               [("closures", 0.3), ("box", 0.6), ("tubes", 0.9)], [("box", 0.5), ("box", 0.4), ("box", 0.55)],
               [("tubes", 1.1), ("bin", 0.4), ("box", 0.5)], [("box", 0.4), ("tubes", 1.2), ("nozzles", 0.3)],
               [("bin", 0.4), ("box", 0.55), ("closures", 0.3)], [("box", 0.6), ("box", 0.45), ("box", 0.4)]]
    rnd = random.Random(7)
    for ri, (xa, xb) in enumerate(((-61.7, -58.35),)):
        levels = rack(xa, xb)
        for li, z in enumerate(levels):
            items = layouts[ri * 4 + li]
            gap = (xb - xa - 0.1 - sum(w for _, w in items)) / len(items)
            x = xa + 0.05 + gap / 2
            for kind, w in items:
                if kind == "tubes":
                    for k, (r, m) in enumerate(((0.045, "alu"), (0.035, rnd.choice(("alu", "kitGraphite"))))):
                        case_tube(x, x + w - k * 0.15, YI0 + 0.24 + k * 0.17, z, r, m)
                elif kind == "box":
                    h = rnd.uniform(0.22, 0.42)
                    box((w, 0.45, h), (x + w / 2, YI0 + 0.36, z + h / 2), "cardboard")
                    decal(rect(-(x + w * 0.75), z + h * 0.45, -(x + w * 0.25), z + h * 0.7), (0, YI0 + 0.585, 0),
                          (-1, 0, 0), (0, 0, 1), "white", 0.002)
                elif kind == "nozzles":
                    nozzle_part(x + 0.08, YI0 + 0.3, z, s=1.1)
                    nozzle_part(x + 0.22, YI0 + 0.45, z, s=0.85)
                elif kind == "closures":
                    for k in range(2):
                        cyl(0.05, 0.03, (x + 0.07 + k * 0.12, YI0 + 0.42, z + 0.015), "alu", verts=8)
                    cyl(0.05, 0.09, (x + 0.12, YI0 + 0.24, z + 0.045), "alu", verts=8)
                else:
                    box((w, 0.5, 0.2), (x + w / 2, YI0 + 0.36, z + 0.1), "cobalt", bevel=0.01)
                    decal(rect(-(x + w * 0.7), z + 0.1, -(x + w * 0.3), z + 0.15), (0, YI0 + 0.61, 0), (-1, 0, 0),
                          (0, 0, 1), "white", 0.002)
                x += w + gap

    # beside the racking: two tall steel cabinets left by the state programme, still in their faded green
    for k, xc in enumerate((-57.1, -56.05)):
        box((1.0, 0.5, 1.95), (xc, YI0 + 0.27, FL + 0.975), "stateGreen", bevel=0.01)
        decal(rect(-(xc + 0.006), FL + 0.05, -(xc - 0.006), FL + 1.9), (0, YI0 + 0.52, 0), (-1, 0, 0), (0, 0, 1), "ink",
              0.002)
        box((0.025, 0.03, 0.22), (xc + (0.06 if k else -0.06), YI0 + 0.535, FL + 1.05), "steel")
        decal(rect(-(xc + 0.35), FL + 1.55, -(xc + 0.1), FL + 1.7), (0, YI0 + 0.52, 0), (-1, 0, 0), (0, 0, 1), "white",
              0.003)
    box((0.6, 0.45, 0.35), (-56.4, YI0 + 0.3, FL + 1.95 + 0.175), "cardboard")
    box((0.5, 0.4, 0.4), (-55.0, YI0 + 0.3, FL + 0.2), "cardboard", rot=(0, 0, 0.1))

    tally("tool board and chest")
    a0 = -57.6 - XI0
    WN.box(a0, a0 + 2.2, 1.15, 2.35, 0.0, 0.03, "white", bevel=0.004)
    for k in range(2):
        WN.box(a0 - 0.02 + k * 2.2, a0 + 0.02 + k * 2.2, 1.12, 2.38, 0.0, 0.04, "kitGraphite")
    rnd = random.Random(3)
    for k in range(7):                                                              # spanners
        a = a0 + 0.15 + k * 0.11
        L = 0.14 + k * 0.025
        WN.decal(a - 0.02, a + 0.02, 2.2 - L - 0.03, 2.23, "ink", 0.032)
        rod(WN.p(a, 2.2 - L, 0.04), WN.p(a, 2.2, 0.04), 0.007 + k * 0.0008, "steel", 5)
    for k in range(6):                                                              # screwdrivers
        a = a0 + 1.05 + k * 0.09
        rod(WN.p(a, 1.62, 0.04), WN.p(a, 1.78, 0.04), 0.003, "steel", 4)
        rod(WN.p(a, 1.78, 0.04), WN.p(a, 1.88, 0.04), 0.012, rnd.choice(("cobalt", "stencil", "hazard")), 6)
    for k in range(2):                                                              # hammers
        a = a0 + 1.7 + k * 0.22
        rod(WN.p(a, 1.5, 0.045), WN.p(a, 1.82, 0.045), 0.012, "wood", 6)
        WN.box(a - 0.07, a + 0.07, 1.82, 1.86, 0.03, 0.065, "steel")
    torus(0.12, 0.012, tuple(WN.p(a0 + 0.5, 1.5, 0.05)), "cableRed", rot=(math.pi / 2, 0, 0), major=8, minor=3)
    torus(0.1, 0.01, tuple(WN.p(a0 + 0.78, 1.47, 0.05)), "cableAmber", rot=(math.pi / 2, 0, 0), major=8, minor=3)
    WN.box(a0 + 0.2, a0 + 1.2, FL, FL + 0.95, 0.0, 0.5, "stencil", bevel=0.01)
    for k in range(5):
        z = FL + 0.2 + k * 0.16
        WN.decal(a0 + 0.22, a0 + 1.18, z - 0.003, z + 0.003, "ink", 0.505)
        WN.box(a0 + 0.55, a0 + 0.85, z + 0.06, z + 0.075, 0.5, 0.52, "alu")
    WN.box(a0 + 0.18, a0 + 1.22, FL + 0.95, FL + 0.98, 0.0, 0.52, "kitGraphite", bevel=0.005)

    tally("desk, whiteboard, kitchen")
    DX0, DX1 = -53.4, -51.4
    DZ = FL + 0.75
    for x in (DX0 + 0.04, DX1 - 0.04):
        for y in (YI1 - 0.04, YI1 - 0.66):
            box((0.04, 0.04, DZ - FL - 0.03), (x, y, (DZ - 0.03 + FL) / 2), "steelDark")
    box((DX1 - DX0, 0.72, 0.03), ((DX0 + DX1) / 2, YI1 - 0.36, DZ - 0.015), "wood", bevel=0.004)
    box((DX1 - DX0 - 0.1, 0.02, 0.4), ((DX0 + DX1) / 2, YI1 - 0.05, DZ - 0.25), "steelDark")
    with frame((-52.75, YI1 - 0.4, DZ), rz=0.15):                                   # the laptop
        box((0.33, 0.23, 0.016), (0, 0, 0.008), "kitGraphite", bevel=0.004)
        decal(rect(-0.14, -0.08, 0.14, 0.05), (0, 0, 0.0165), (1, 0, 0), (0, 1, 0), "ink", 0.0)
        with frame((0, 0.115, 0.016), rx=-0.25):
            box((0.33, 0.012, 0.22), (0, 0, 0.11), "kitGraphite", bevel=0.004)
            decal(rect(-0.15, 0.012, 0.15, 0.205), (0, -0.0062, 0), (1, 0, 0), (0, 0, 1), "screen", 0.0)
    monitor(-51.95, YI1 - 0.24, DZ, math.pi, w=0.5, h=0.3)
    for (x, y, m) in ((-53.15, YI1 - 0.18, "white"), (-52.15, YI1 - 0.58, "cobalt")):
        cyl(0.04, 0.095, (x, y, DZ + 0.0475), m, verts=10)
    for k in range(3):
        box((0.21, 0.297, 0.003), (-52.1 + k * 0.03, YI1 - 0.5 - k * 0.02, DZ + 0.0015 + k * 0.003), "white",
            rot=(0, 0, 0.1 * k))
    chair(-52.75, YI1 - 1.05, math.pi / 2 + 0.25)
    a0 = -53.65 - XI0                                                                # whiteboard
    WN.box(a0, a0 + 2.5, 1.25, 2.45, 0.0, 0.03, "alu", bevel=0.006)
    WN.decal(a0 + 0.03, a0 + 2.47, 1.28, 2.42, "board", 0.031)
    WN.box(a0 + 0.3, a0 + 2.2, 1.23, 1.25, 0.0, 0.07, "alu")
    ax0, az0 = a0 + 0.3, 1.45
    ribbon(WN, [(ax0, az0 + 0.85), (ax0, az0), (ax0 + 1.5, az0)], 0.034, 0.012, "ink")
    pred = [(ax0 + 0.02 + 1.4 * t, az0 + 0.65 * (min(1, t / 0.08) * (1 - max(0, (t - 0.82) / 0.18)) * (0.8 + 0.2 * math.sin(t * 4))))
            for t in [k / 24 for k in range(25)]]
    meas = [(a, z + 0.03 * math.sin(i * 0.9) + (0.05 if 6 < i < 14 else 0.0)) for i, (a, z) in enumerate(pred)]
    ribbon(WN, pred, 0.035, 0.01, "traceBlue")
    ribbon(WN, meas, 0.036, 0.01, "traceRed")
    for k in range(4):
        WN.decal(a0 + 1.95, a0 + 2.3 - k * 0.05, 2.25 - k * 0.1, 2.27 - k * 0.1, "ink", 0.034)
    for k, m in enumerate(("traceRed", "traceBlue", "ink")):
        cyl(0.008, 0.11, tuple(WN.p(a0 + 0.6 + k * 0.15, 1.27, 0.05)), m, rot=(0, math.pi / 2, 0), verts=6)
    box((1.0, 0.6, 0.04), (-49.2, YI1 - 0.32, FL + 0.88), "white", bevel=0.005)        # kitchen corner
    for x in (-49.65, -48.75):
        box((0.04, 0.55, 0.86), (x, YI1 - 0.32, FL + 0.43), "steelDark")
    box((0.26, 0.3, 0.36), (-49.45, YI1 - 0.25, FL + 1.08), "ink", bevel=0.02)
    cyl(0.075, 0.2, (-48.95, YI1 - 0.3, FL + 1.0), "steel", verts=12)
    cyl(0.04, 0.095, (-49.15, YI1 - 0.48, FL + 0.95), "stencil", verts=10)
    box((0.62, 0.62, 1.5), (-48.25, YI1 - 0.33, FL + 0.75), "white", bevel=0.02)
    box((0.02, 0.03, 0.4), (-47.96, YI1 - 0.65, FL + 1.1), "steel")

    tally("by the door: pallet, crates, drums, extinguisher")
    box((1.2, 0.8, 0.12), (-62.5, -6.5, FL + 0.06), "wood", rot=(0, 0, 0.1))                    # a pallet of boxes
    box((0.8, 0.6, 0.6), (-62.6, -6.5, FL + 0.12 + 0.3), "cardboard", rot=(0, 0, 0.12))
    box((0.5, 0.5, 0.4), (-62.3, -6.45, FL + 0.72 + 0.2), "cardboard", rot=(0, 0, -0.2))
    box((1.1, 0.7, 0.55), (-62.4, -7.6, FL + 0.275), "wood", bevel=0.01)
    stencil("41", (-61.85, -7.95 - 0.0, FL + 0.12), (1, 0, 0), UP, 0.25, m="ink", t=0.003)
    drum(-63.0, -17.95, FL, "stateGreen")
    for (x, y, s) in ((-58.0, YI0 + 0.26, 1),):
        box((0.12, 0.06, 0.06), (x, y + 0.03, 1.15), "steelDark")
        lathe([(0.0, 0.45), (0.075, 0.45), (0.08, 0.47), (0.08, 0.92), (0.07, 0.97), (0.04, 0.99), (0.0, 1.0)], "stencil",
              verts=12, loc=(x, y + 0.13, FL))
        box((0.04, 0.04, 0.05), (x, y + 0.13, FL + 1.02), "ink")
        box((0.3, 0.02, 0.3), (x, YI0 + 0.26, 1.75), "stencil")


build_bay()


def build_cell():
    tally("cell lining")
    WC = WF(PX1, CRY, (1, 0, 0))            # blast wall, cell face: a = y - CRY
    NC = WF(PX1, YI1, (0, -1, 0))           # north: a = x - PX1
    EC = WF(XI1, YI1, (-1, 0, 0))           # east: a = YI1 - y
    SC = WF(XI1, YI0, (0, 1, 0))            # south pocket: a = XI1 - x
    CE = WF(CRX1, YI0, (1, 0, 0))           # control room east face: a = y - YI0
    CN = WF(CRX1, CRY, (0, 1, 0))           # control room north face (behind the motor): a = CRX1 - x
    Z0, Z1 = 0.95, 6.85
    walls = [(WC, YI1 - CRY, [(BD0 - CRY - 0.2, BD1 - CRY + 0.2, 0.0, BDZ + 0.2)]),
             (NC, XI1 - PX1, []),
             (EC, YI1 - YI0, [(YI1 + 12.0 - 0.66, YI1 + 12.0 + 0.66, 0.0, AXZ + 0.66)]),
             (SC, XI1 - CRX1, []),
             (CE, CRY - YI0, []),
             (CN, CRX1 - PX1, [(CRX1 - WIN[1] - 0.16, CRX1 - WIN[0] + 0.16, WIN[2] - 0.16, WIN[3] + 0.16)])]
    for (W, L, sk) in walls:
        lining(W, L, Z0, Z1, sk)
        W.paint(0, L, FL, Z0 - 0.035, "stateGreen", sk)
        W.paint(0, L, FL, FL + 0.1, "ink", sk, lift=0.006)
    tally("cell ceiling, beams, suppression grid")
    o = box((XI1 - PX1, YI1 - YI0, 0.3), ((PX1 + XI1) / 2, (YI0 + YI1) / 2, CEIL + 0.15), "concrete")
    densify(o, 2.5)
    for xx, ya in ((-43.0, CRY), (-39.75, YI0)):
        densify(box((0.35, YI1 - ya, 0.45), (xx, (ya + YI1) / 2, CEIL - 0.225), "concrete"), 2.5)
    for xx, ya in ((-44.5, CRY + 0.3), (-41.4, CRY + 0.3), (-38.0, YI0 + 0.3)):
        tube([(xx, YI1 - 0.3, 6.75), (xx, ya, 6.75)], 0.04, "stencil", sides=8)
        y = YI1 - 1.2
        while y > ya + 0.3:
            cyl(0.024, 0.05, (xx, y, 6.69), "steel", verts=4, r2=0.01)
            y -= 2.4
        for y in (YI1 - 0.6, (YI1 + ya) / 2, ya + 0.3):
            rod((xx, y, 6.79), (xx, y, CEIL), 0.008, "steelDark", 4)
    tube([(-44.5, YI1 - 0.6, 6.75), (-44.5, YI1 - 0.6, 6.4), (-38.0, YI1 - 0.6, 6.4), (-38.0, YI1 - 0.6, 6.75)],
         0.05, "stencil", sides=8)
    tube([(-41.4, YI1 - 0.6, 6.4), (-41.4, YI1 - 0.6, 6.75)], 0.04, "stencil", sides=8)
    tube([(-38.0, YI1 - 0.6, 6.4), (XI1 - 0.25, YI1 - 0.3, 6.2), (XI1 - 0.25, YI1 - 0.3, 1.4)], 0.06, "stencil",
         sides=8, sub=0)
    cyl(0.1, 0.16, (XI1 - 0.25, YI1 - 0.3, 1.3), "stencil", verts=12)
    rod((XI1 - 0.25, YI1 - 0.3, 1.3), (XI1 - 0.25, YI1 - 0.55, 1.3), 0.012, "steel")
    cyl(0.07, 0.015, (XI1 - 0.25, YI1 - 0.56, 1.3), "cableRed", rot=(math.pi / 2, 0, 0), verts=10)

    tally("cell lamps, beacon, cctv, trays")
    pendant(-43.0, -14.4, 4.5, CEIL - 0.45, nv=8)
    pendant(-43.0, -9.6, 4.5, CEIL - 0.45, nv=8)
    for a in (2.4, 7.3):
        strip_lamp(NC, a, 5.6)
    for a in (2.2, 10.9):
        strip_lamp(EC, a, 5.6)
    strip_lamp(CN, 1.5, 5.6)
    strip_lamp(CN, 4.5, 5.6)
    cctv((PX1 + 0.05, YI1 - 0.5, 3.6), (1, 0, 0), (MOUNT_X + 0.2, AXY, AXZ))
    for (W, L) in ((NC, XI1 - PX1), (EC, YI1 + 12.0 - 0.8)):                   # cable trays with cables
        W.box(0.2, L - 0.1, 2.6, 2.62, 0.08, 0.38, "steel")
        W.box(0.2, L - 0.1, 2.62, 2.7, 0.08, 0.09, "steel")
        W.box(0.2, L - 0.1, 2.62, 2.7, 0.37, 0.38, "steel")
        for k in range(int(L / 3.0) + 1):
            a = 0.3 + k * 3.0
            if a < L - 0.1:
                W.box(a - 0.02, a + 0.02, 2.55, 2.62, 0.04, 0.38, "steelDark")
        for k, (m, r) in enumerate((("cableAmber", 0.012), ("rubber", 0.015), ("cobalt", 0.01))):
            tube([W.p(0.2, 2.64 + r, 0.14 + k * 0.06), W.p(L - 0.1, 2.64 + r, 0.14 + k * 0.06)], r, m, sides=5)
    # the down-run from the north tray to the stand's floor trench
    tube([NC.p(2.6, 2.65, 0.2), NC.p(2.65, 2.4, 0.06), NC.p(2.65, 0.4, 0.06)], 0.03, "rubber", sides=6, sub=2)

    tally("cell wall fittings")
    # the pressure gauge panel on the wall behind the motor, right of the window
    a0, a1 = CRX1 - (-44.45), CRX1 - (-45.55)
    CN.box(a0, a1, 1.05, 1.95, 0.05, 0.075, "steelDark", bevel=0.006)
    for (a, z) in ((a0 + 0.15, 1.15), (a1 - 0.15, 1.15), (a0 + 0.15, 1.85), (a1 - 0.15, 1.85)):
        CN.box(a - 0.02, a + 0.02, z - 0.02, z + 0.02, 0.0, 0.05, "steel")
    for k in range(3):
        a = a0 + 0.2 + k * 0.35
        c = CN.p(a, 1.62, 0.075)
        cyl(0.085, 0.05, tuple(c + CN.n * 0.025), "kitGraphite", rot=(math.pi / 2, 0, 0), verts=12)
        disc(c + CN.n * 0.05, CN.n, 0.072, "white", 12, 0.001)
        p0 = c + CN.n * 0.053
        ang = 0.6 + k * 0.7
        rod(p0, p0 + CN.u * 0.055 * math.cos(ang) + UP * 0.055 * math.sin(ang), 0.003, "stencil", 3)
        tube([c + UP * -0.085 + CN.n * 0.02, CN.p(a, 1.3, 0.1), CN.p(a, 1.22, 0.1)], 0.005, "alu", sides=5, sub=2)
    tube([CN.p(a0 + 0.1, 1.22, 0.1), CN.p(a1 - 0.1, 1.22, 0.1)], 0.014, "alu", sides=8)
    for k in range(3):
        a = a0 + 0.2 + k * 0.35
        cyl(0.02, 0.05, tuple(CN.p(a, 1.22, 0.1)), "steel", verts=8)
        rod(CN.p(a, 1.25, 0.1), CN.p(a, 1.25, 0.2), 0.006, "stencil", 4)
    tube([CN.p(a1 - 0.1, 1.22, 0.1), CN.p(a1 - 0.05, 1.1, 0.1), CN.p(a1 - 0.05, FL + 0.05, 0.1),
          CN.p(a1 - 0.05, FL + 0.01, 0.3)], 0.006, "alu", sides=5, sub=2)
    CN.decal(a0 + 0.1, a1 - 0.1, 1.32, 1.4, "white", 0.078)
    # the stencilled sign left of the window: "Б-3" (Box 3)
    CN.decal(0.55, 1.85, 1.15, 1.8, "white", 0.06)
    for a in (0.6, 1.8):
        for z in (1.2, 1.75):
            CN.box(a - 0.015, a + 0.015, z - 0.015, z + 0.015, 0.0, 0.06, "steel")
    stencil("Б-3", CN.p(0.67, 1.27, 0.06), CN.u, UP, 0.45, m="stencil", t=0.003)
    fchev(CN.p(0.55, 1.05, 0.06), CN.u, UP, 1.3, 0.08, 0.06)
    # the firing beacon is with the blast door (bay build); here a hose reel and an extinguisher in the pocket
    c = EC.p(YI1 + 17.4, 1.35, 0.0)
    disc(c + EC.n * 0.004, EC.n, 0.12, "steelDark", 8, 0.0)
    cyl(0.32, 0.03, tuple(c + EC.n * 0.08), "stencil", rot=(0, math.pi / 2, 0), verts=12)
    cyl(0.32, 0.03, tuple(c + EC.n * 0.32), "stencil", rot=(0, math.pi / 2, 0), verts=12)
    cyl(0.25, 0.22, tuple(c + EC.n * 0.2), "cableRed", rot=(0, math.pi / 2, 0), verts=12)
    rod(c + EC.n * 0.004, c + EC.n * 0.36, 0.03, "steelDark")
    lathe([(0.0, 0.0), (0.075, 0.0), (0.08, 0.02), (0.08, 0.47), (0.07, 0.52), (0.04, 0.54), (0.0, 0.55)], "stencil",
          verts=12, loc=(-36.75, YI0 + 0.28, FL))
    box((0.04, 0.04, 0.05), (-36.75, YI0 + 0.28, FL + 0.57), "ink")
    SC.box(0.3, 0.7, 1.3, 1.6, 0.0, 0.01, "stencil")
    # the climate plant's supply diffuser in the pocket's south wall
    SC.box(XI1 + 39.0 - 0.45, XI1 + 39.0 + 0.45, 5.3, 5.8, 0.0, 0.08, "white", bevel=0.008)
    for k in range(4):
        SC.box(XI1 + 39.0 - 0.4, XI1 + 39.0 + 0.4, 5.37 + k * 0.11, 5.4 + k * 0.11, 0.08, 0.1, "steelDark")

    tally("blast door, cell side")
    for a0, a1 in ((BD0 - CRY - 0.16, BD0 - CRY), (BD1 - CRY, BD1 - CRY + 0.16)):
        WC.box(a0, a1, FL, BDZ + 0.16, 0.0, 0.05, "steelDark")
    WC.box(BD0 - CRY - 0.16, BD1 - CRY + 0.16, BDZ, BDZ + 0.16, 0.0, 0.05, "steelDark")
    for k in range(7):
        z = FL + 0.25 + k * 0.45
        for a in (BD0 - CRY - 0.08, BD1 - CRY + 0.08):
            bolt(WC.p(a, z, 0.05), WC.n, "steel", r=0.012)

    tally("thrust stand")
    HERO[0] = True
    # plinth, cast-in plate, hazard chevrons round it, the drain, the covered cable trench to the control room
    densify(box((2.2, 1.6, 0.2), (-43.2, AXY, FL + 0.1), "concreteDark", bevel=0.02), 0.8)
    ZP = FL + 0.2
    box((1.7, 0.7, 0.02), (-43.1, AXY, ZP + 0.01), "steel")
    for (x, y) in ((-43.85, -12.25), (-43.85, -11.75), (-42.35, -12.25), (-42.35, -11.75)):
        bolt((x, y, ZP + 0.02), (0, 0, 1), "steel", r=0.014, washer=True, stud=0.015)
    BO = (-44.75, -13.25, -41.65, -10.75)
    bw = 0.2
    fchev(Vector((BO[0], BO[1], FL)), (1, 0, 0), (0, 1, 0), BO[2] - BO[0], bw, 0.12)
    fchev(Vector((BO[2], BO[3], FL)), (-1, 0, 0), (0, -1, 0), BO[2] - BO[0], bw, 0.12)
    fchev(Vector((BO[2], BO[1] + bw, FL)), (0, 1, 0), (-1, 0, 0), BO[3] - BO[1] - 2 * bw, bw, 0.12)
    fchev(Vector((BO[0], BO[3] - bw, FL)), (0, -1, 0), (1, 0, 0), BO[3] - BO[1] - 2 * bw, bw, 0.12)
    floor_decal(-41.95, -12.4, -41.25, -11.6, "steel", lift=0.004)
    floor_decal(-41.9, -12.35, -41.3, -11.65, "ink", lift=0.006)
    for k in range(6):
        x = -41.86 + k * 0.104
        floor_decal(x, -12.35, x + 0.03, -11.65, "steel", lift=0.008)
    blob(-41.0, AXY, 0.75, FL + 0.0025, "soot", seed=11, squash=0.5)
    blob(-41.6, AXY, 0.4, FL + 0.003, "concreteDark", seed=12, squash=0.6)
    box((0.4, CRY - BO[1] + 0.4, 0.025), (-43.75, (BO[1] - 0.4 + CRY) / 2 + 0.0, FL + 0.0125), "steel", bevel=0.004)
    for y in (BO[1] + 0.3, CRY + 0.15):
        for x in (-43.9, -43.6):
            bolt((x, y, FL + 0.025), (0, 0, 1), "steel", r=0.008)
    # the thrust bench: legs on foot plates, two longitudinal beams, the top plate (z 0.80) with T-slots
    ZT = 0.80
    for x in (-43.62, -42.55):
        for y in (-12.17, -11.83):
            box((0.13, 0.13, 0.014), (x, y, ZP + 0.027), "steelDark")
            box((0.07, 0.07, ZT - 0.08 - ZP - 0.034), (x, y, (ZT - 0.08 + ZP + 0.034) / 2), "steelDark", bevel=0.004)
            bolt((x + 0.045, y + 0.045, ZP + 0.034), (0, 0, 1), "steel", r=0.007)
            bolt((x - 0.045, y - 0.045, ZP + 0.034), (0, 0, 1), "steel", r=0.007)
        box((0.06, 0.28, 0.06), (x, AXY, ZP + 0.16), "steelDark")
    for y in (-12.17, -11.83):
        box((1.25, 0.07, 0.08), (-43.085, y, ZT - 0.07), "steelDark", bevel=0.004)
    box((1.27, 0.46, 0.03), (-43.085, AXY, ZT - 0.015), "steelDark", bevel=0.004)
    for y in (-12.12, -11.88):
        floor_decal(-43.7, y - 0.006, -42.47, y + 0.006, "ink", z=ZT, lift=0.001)
    box((0.03, 0.12, 0.012), (-42.47, -12.22, ZT - 0.03), "cobalt")
    plate(rect(0, 0, 0.16, 0.05), (-42.95, -12.231, ZT - 0.06), (1, 0, 0), (0, 0, 1), 0.002, "cobalt")
    # the thrust plate and its gussets
    box((0.035, 0.4, 0.5), (-43.3275, AXY, ZT + 0.25), "steelDark", bevel=0.004)
    for y in (-12.16, -11.84 + 0.02, AXY + 0.01):
        plate([(-43.68, ZT), (-43.345, ZT), (-43.345, ZT + 0.42)], (0, y, 0), (1, 0, 0), (0, 0, 1), 0.02, "steelDark")
    for (y, z) in ((-12.16, ZT + 0.08), (-11.84, ZT + 0.08), (-12.16, ZT + 0.44), (-11.84, ZT + 0.44)):
        bolt((-43.31, y, z), (1, 0, 0), "steel", r=0.01)
    for k in range(6):
        a = math.pi / 6 + k * math.pi / 3
        bolt((-43.31, AXY + 0.075 * math.cos(a), AXZ + 0.075 * math.sin(a)), (1, 0, 0), "steel", r=0.0075)
    # the load cell stack: flexure, flange, stainless cell with its label band, the load button (= hushMount)
    RX = (0, math.pi / 2, 0)
    cyl(0.016, 0.03, (-43.295, AXY, AXZ), "steel", rot=RX, verts=12)
    for xx in (-43.303, -43.287):
        cyl(0.042, 0.004, (xx, AXY, AXZ), "steel", rot=RX, verts=16)
    cyl(0.05, 0.01, (-43.275, AXY, AXZ), "alu", rot=RX, verts=20, bevel=0.0015)
    for k in range(6):
        a = k * math.pi / 3
        disc((-43.2695, AXY + 0.042 * math.cos(a), AXZ + 0.042 * math.sin(a)), (1, 0, 0), 0.0045, "ink", 6, 0.001)
    cyl(0.036, 0.056, (-43.242, AXY, AXZ), "alu", rot=RX, verts=24, bevel=0.002)
    tube([(-43.253, AXY, AXZ), (-43.232, AXY, AXZ)], 0.0365, "kitGraphite", sides=24, caps=False)
    cyl(0.022, 0.014, (MOUNT_X - 0.007, AXY, AXZ), "alu", rot=RX, verts=24, bevel=0.0015)
    cyl(0.007, 0.012, (-43.242, AXY, AXZ - 0.041), "steel", verts=6)
    cyl(0.0055, 0.016, (-43.242, AXY, AXZ - 0.053), "ink", verts=8)
    tube([(-43.242, AXY, AXZ - 0.06), (-43.245, AXY, AXZ - 0.15), (-43.26, AXY - 0.04, ZT + 0.006),
          (-43.4, AXY - 0.17, ZT + 0.006), (-43.55, AXY - 0.235, ZT - 0.04), (-43.6, AXY - 0.24, ZT - 0.3),
          (-43.63, AXY - 0.26, ZP + 0.04), (-43.68, AXY - 0.55, ZP + 0.01), (-43.72, AXY - 0.85, FL + 0.08),
          (-43.75, BO[1] + 0.25, FL + 0.012)], 0.0045, "rubber", sides=5, sub=2)
    # the pressure transducer over the load button on an arm from the thrust plate's top, its line to the button
    box((0.13, 0.04, 0.012), (-43.28, AXY, ZT + 0.506), "steelDark", bevel=0.002)
    box((0.03, 0.04, 0.02), (-43.235, AXY, ZT + 0.49), "steelDark")
    cyl(0.0085, 0.06, (-43.235, AXY, ZT + 0.45), "alu", verts=12, bevel=0.0015)
    cyl(0.01, 0.01, (-43.235, AXY, ZT + 0.415), "steel", verts=6)
    tube([(-43.235, AXY, ZT + 0.41), (-43.232, AXY, ZT + 0.35), (-43.215, AXY, AXZ + 0.045),
          (-43.207, AXY, AXZ + 0.0225)], 0.0022, "alu", sides=5, sub=2)
    tube([(-43.28, AXY, ZT + 0.512), (-43.33, AXY + 0.04, ZT + 0.56), (-43.4, AXY + 0.08, ZT + 0.45),
          (-43.45, AXY + 0.1, ZT + 0.05), (-43.6, AXY + 0.17, ZT - 0.05), (-43.62, AXY + 0.2, ZP + 0.05),
          (-43.75, AXY + 0.5, FL + 0.01), (-43.9, AXY - 0.5, FL + 0.01), (-43.8, BO[1] + 0.25, FL + 0.012)],
         0.0035, "rubber", sides=5, sub=2)
    # the startup's little junction box on the bench, behind the thrust plate
    box((0.12, 0.09, 0.08), (-43.55, AXY - 0.1, ZT + 0.04), "cobalt", bevel=0.006)
    cyl(0.008, 0.014, (-43.55, AXY - 0.152, ZT + 0.04), "ink", rot=(math.pi / 2, 0, 0), verts=6)
    HERO[0] = False
    # a low cobalt case on the floor by the north wall (keeps the +Y side low)
    box((0.55, 0.38, 0.22), (-44.6, YI1 - 0.5, FL + 0.11), "kitGraphite", bevel=0.02)
    box((0.2, 0.03, 0.02), (-44.6, YI1 - 0.5, FL + 0.235), "ink")


build_cell()


def build_control():
    tally("control room shell")
    # walls (full height to the cell ceiling, so the side shot has a clean backdrop), ceiling, window opening
    wall_x(CRY - CRT, CRY, PX1, CRX1, FL, CEIL, [(WIN[0], WIN[1], WIN[2], WIN[3])], m="concrete", dens=2.2)
    wall_y(CRX1 - CRT, CRX1, YI0, CRY - CRT, FL, CEIL, m="concrete", dens=2.2)
    o = box((CRX1 - CRT - PX1, CRY - CRT - YI0, 0.25), ((PX1 + CRX1 - CRT) / 2, (YI0 + CRY - CRT) / 2, CR_CEIL + 0.125),
            "concrete")
    densify(o, 1.0)
    xs = grid(PX1, CRX1 - CRT, 0.7)
    ys = grid(YI0, CRY - CRT, 0.7)
    heightfield(xs, ys, lambda x, y: FL + 0.003, "lino")
    RN = WF(PX1, CRY - CRT, (0, -1, 0))          # u = up x (0,-1,0) = (1,0,0): a = x - PX1
    RE = WF(CRX1 - CRT, CRY - CRT, (-1, 0, 0))   # u = up x (-1,0,0) = (0,-1,0): a = (CRY - CRT) - y
    RS = WF(CRX1 - CRT, YI0, (0, 1, 0))          # u = (-1,0,0): a = (CRX1 - CRT) - x
    RW = WF(PX1, YI0, (1, 0, 0))                 # u = (0,1,0): a = y - YI0
    Lx, Ly = CRX1 - CRT - PX1, CRY - CRT - YI0
    for (W, L, holes) in ((RN, Lx, [(WIN[0] - PX1, WIN[1] - PX1, WIN[2], WIN[3])]), (RE, Ly, []), (RS, Lx, []),
                          (RW, Ly, [(CD0 - YI0, CD1 - YI0, 0.0, CDZ)])):
        W.paint(0, L, FL, 1.0, "stateGreen", holes)
        W.paint(0, L, 1.0, 1.04, "ink", holes)
        W.paint(0, L, 1.04, CR_CEIL, "white", holes)
        W.paint(0, L, FL, FL + 0.1, "ink", holes, lift=0.006)
    decal(rect(PX1, YI0, CRX1 - CRT, CRY - CRT), (0, 0, CR_CEIL), (1, 0, 0), (0, -1, 0), "white", 0.004)

    tally("observation window")
    # the reveal lined in steel, the bolted retaining frame on the cell side, a frame inside, one pane facing the cell
    x0, x1, z0, z1 = WIN
    yo, yi = CRY, CRY - CRT
    box((x1 - x0, CRT, 0.015), ((x0 + x1) / 2, (yo + yi) / 2, z0 + 0.0075), "steelDark")
    box((x1 - x0, CRT, 0.015), ((x0 + x1) / 2, (yo + yi) / 2, z1 - 0.0075), "steelDark")
    box((0.015, CRT, z1 - z0), (x0 + 0.0075, (yo + yi) / 2, (z0 + z1) / 2), "steelDark")
    box((0.015, CRT, z1 - z0), (x1 - 0.0075, (yo + yi) / 2, (z0 + z1) / 2), "steelDark")
    fw = 0.13
    for (a, b, c, d) in ((x0 - fw, x1 + fw, z1, z1 + fw), (x0 - fw, x1 + fw, z0 - fw, z0),
                         (x0 - fw, x0, z0, z1), (x1, x1 + fw, z0, z1)):
        box((b - a, 0.06, d - c), ((a + b) / 2, yo + 0.03, (c + d) / 2), "steelDark", bevel=0.006)
    for k in range(5):
        x = x0 - fw / 2 + (x1 - x0 + fw) * k / 4
        for z in (z0 - fw / 2, z1 + fw / 2):
            bolt((x, yo + 0.06, z), (0, 1, 0), "steel", r=0.012)
    for z in ((z0 + z1) / 2,):
        for x in (x0 - fw / 2, x1 + fw / 2):
            bolt((x, yo + 0.06, z), (0, 1, 0), "steel", r=0.012)
    for (a, b, c, d) in ((x0 - 0.06, x1 + 0.06, z1, z1 + 0.06), (x0 - 0.06, x1 + 0.06, z0 - 0.06, z0),
                         (x0 - 0.06, x0, z0, z1), (x1, x1 + 0.06, z0, z1)):
        box((b - a, 0.03, d - c), ((a + b) / 2, yi - 0.015, (c + d) / 2), "steelDark", bevel=0.004)
    for (a, b, c, d) in ((x0 + 0.015, x1 - 0.015, z1 - 0.05, z1 - 0.015), (x0 + 0.015, x1 - 0.015, z0 + 0.015, z0 + 0.05),
                         (x0 + 0.015, x0 + 0.05, z0 + 0.05, z1 - 0.05), (x1 - 0.05, x1 - 0.015, z0 + 0.05, z1 - 0.05)):
        box((b - a, 0.025, d - c), ((a + b) / 2, yo - 0.045, (c + d) / 2), "rubber")
    decal(rect(-x1, z0, -x0, z1), (0, yo - 0.06, 0), (-1, 0, 0), (0, 0, 1), "glass", 0.0)     # the pane, facing +Y

    tally("control room furniture")
    # the desk under the window, the graphite DAQ rack, monitors, the amber firing box, chair
    DZ = FL + 0.74
    DY0, DY1 = yi - 0.72, yi - 0.02
    box((5.0, DY1 - DY0, 0.035), (-42.85, (DY0 + DY1) / 2, DZ - 0.0175), "wood", bevel=0.005)
    for x in (-45.3, -40.4):
        box((0.04, DY1 - DY0 - 0.06, DZ - FL - 0.035), (x, (DY0 + DY1) / 2, (DZ - 0.035 + FL) / 2), "steelDark")
    box((4.9, 0.02, 0.45), (-42.85, DY1 - 0.03, DZ - 0.27), "steelDark")
    for x in (-44.3, -41.4):
        box((0.42, 0.6, 0.55), (x, (DY0 + DY1) / 2 + 0.02, FL + 0.31), "steelDark", bevel=0.008)
        for k in range(3):
            box((0.1, 0.02, 0.015), (x, DY0 + 0.035, FL + 0.23 + k * 0.17), "alu")
    RX0, RX1 = PX1 + 0.05, PX1 + 0.65                                              # the floor rack
    box((RX1 - RX0, 0.62, 1.3), ((RX0 + RX1) / 2, yi - 0.33, FL + 0.65), "kitGraphite", bevel=0.015)
    rnd = random.Random(9)
    for k in range(6):
        z = FL + 0.2 + k * 0.18
        box((RX1 - RX0 - 0.06, 0.008, 0.14), ((RX0 + RX1) / 2, yi - 0.644, z + 0.07), "ink")
        decal(rect(-(RX0 + 0.06 + 0.04 * rnd.randint(1, 4)), z + 0.09, -(RX0 + 0.06), z + 0.11), (0, yi - 0.649, 0),
              (-1, 0, 0), (0, 0, 1), rnd.choice(("ledGreen", "ledGreen", "strobe")), 0.0)
        box((0.1, 0.004, 0.03), (RX1 - 0.12, yi - 0.65, z + 0.05), "cobalt")
    box((0.3, 0.004, 0.06), ((RX0 + RX1) / 2, yi - 0.645, FL + 1.25), "cobalt")
    for k in range(2):
        tube([(RX1 - 0.05, yi - 0.2 - k * 0.04, FL + 1.0 - k * 0.15), (RX1 + 0.3, yi - 0.25, DZ + 0.01),
              (-44.1 + k * 0.05, yi - 0.1, DZ + 0.01)], 0.004, rnd.choice(("rubber", "cobalt", "cableAmber")), sides=4, sub=2)
    monitor(-44.25, yi - 0.25, DZ, 0.0, curve=True)
    monitor(-41.35, yi - 0.25, DZ, 0.0)
    for k, hb in enumerate((0.16, 0.22, 0.09, 0.19, 0.13)):                     # its channel bars and status lights
        xb = -41.35 - 0.2 + k * 0.085
        decal(rect(xb, DZ + 0.17, xb + 0.05, DZ + 0.17 + hb), (0, yi - 0.25 - 0.0175, 0), (1, 0, 0), (0, 0, 1),
              "traceBlue", 0.0)
        decal(rect(xb + 0.015, DZ + 0.4, xb + 0.035, DZ + 0.42), (0, yi - 0.25 - 0.0175, 0), (1, 0, 0), (0, 0, 1),
              "ledGreen" if k != 2 else "traceRed", 0.0)
    for x in (-44.25, -41.35):
        box((0.44, 0.14, 0.02), (x, DY0 + 0.2, DZ + 0.01), "ink", bevel=0.004)
        box((0.07, 0.11, 0.025), (x + 0.32, DY0 + 0.2, DZ + 0.0125), "ink", bevel=0.006)
    HERO[0] = True
    with frame((-42.95, DY0 + 0.24, DZ)):                                           # the firing box
        box((0.3, 0.2, 0.09), (0, 0, 0.045), "hazard", bevel=0.01)
        box((0.3, 0.2, 0.012), (0, 0, 0.012), "ink")
        cyl(0.018, 0.01, (-0.08, -0.02, 0.095), "steel", verts=10)
        box((0.006, 0.032, 0.012), (-0.08, -0.02, 0.106), "ink")
        box((0.03, 0.006, 0.05), (-0.08, -0.02, 0.135), "alu")
        cyl(0.03, 0.015, (0.06, -0.02, 0.0975), "steel", verts=12)
        cyl(0.02, 0.02, (0.06, -0.02, 0.11), "cableRed", verts=12)
        rod((0.03, -0.055, 0.105), (0.09, -0.055, 0.105), 0.004, "steel", 4)
        for j, m in enumerate(("beacon", "ledGreen")):
            sphere(0.008, (-0.12 + j * 0.03, 0.06, 0.093), m, segs=6, rings=3)
        decal(rect(-0.13, -0.09, 0.0, -0.06), (0, 0, 0.0905), (1, 0, 0), (0, 1, 0), "ink", 0.0)
        tube([(0.1, 0.1, 0.03), (0.2, 0.25, 0.005), (-1.3, 0.3, 0.005), (-1.4, 0.32, 0.01)], 0.004, "cableAmber",
             sides=4, sub=2)
    HERO[0] = False
    box((0.21, 0.297, 0.003), (-42.4, DY0 + 0.25, DZ + 0.0015), "white", rot=(0, 0, -0.15))
    cyl(0.04, 0.095, (-40.75, DY0 + 0.3, DZ + 0.0475), "cobalt", verts=10)
    chair(-43.7, yi - 1.25, -math.pi / 2 + 0.3)
    # the ceiling lamp, a clock, a checklist and the old wall phone by the door
    box((1.3, 0.3, 0.06), (-43.2, -17.3, CR_CEIL - 0.03), "white", bevel=0.01)
    decal(rect(-43.8, -17.42, -42.6, -17.18), (0, 0, CR_CEIL - 0.06), (1, 0, 0), (0, -1, 0), "lamp", 0.001)
    c = Vector((CRX1 - CRT - 0.02, -17.6, 2.35))
    cyl(0.15, 0.04, tuple(c), "white", rot=(0, math.pi / 2, 0), verts=16)
    tube([(c.x - 0.02, c.y, c.z), (c.x - 0.022, c.y, c.z)], 0.15, "ink", sides=16, caps=False)
    rod(c - Vector((0.025, 0, 0)), c - Vector((0.025, 0.0, -0.1)), 0.004, "ink", 3)
    rod(c - Vector((0.025, 0, 0)), c - Vector((0.025, -0.07, 0.0)), 0.004, "ink", 3)
    RW.box(-16.6 - YI0 - 0.15, -16.6 - YI0 + 0.15, 1.35, 1.75, 0.0, 0.015, "kitGraphite")
    RW.decal(-16.6 - YI0 - 0.13, -16.6 - YI0 + 0.13, 1.37, 1.69, "white", 0.017)
    for k in range(5):
        RW.decal(-16.6 - YI0 - 0.1, -16.6 - YI0 + 0.06 - (k % 2) * 0.05, 1.62 - k * 0.05, 1.63 - k * 0.05, "ink", 0.019)
    RW.box(-18.35 - YI0 - 0.09, -18.35 - YI0 + 0.09, 1.3, 1.6, 0.0, 0.08, "stateGreen", bevel=0.01)
    RW.box(-18.35 - YI0 - 0.03, -18.35 - YI0 + 0.03, 1.36, 1.56, 0.08, 0.12, "ink")
    tube([RW.p(-18.35 - YI0 + 0.05, 1.33, 0.1), RW.p(-18.35 - YI0 + 0.1, 1.15, 0.12), RW.p(-18.35 - YI0 + 0.05, 1.3, 0.09)],
         0.004, "ink", sides=4, sub=3)


build_control()
finish_group("hushIn", levels=(0.0, FL))


# =====================================================================================================================
# 3. the augmenter and the exhaust stack
# =====================================================================================================================
def build_stack():
    tally("augmenter")
    L = SX0 - INLET_X + 0.1                       # bell lip to just inside the stack
    loc, rot = (INLET_X, AXY, AXZ), (0, math.pi / 2, 0)
    lathe([(0.5, 0.0), (0.535, 0.012), (0.556, 0.04), (0.552, 0.085), (0.52, 0.15), (0.47, 0.25), (0.425, 0.4),
           (0.405, 0.55), (0.405, L)], "steel", verts=20, loc=loc, rot=rot)
    lathe([(0.37, L), (0.37, 0.55), (0.385, 0.27), (0.42, 0.11), (0.465, 0.025), (0.5, 0.0)], "soot", verts=16,
          loc=loc, rot=rot)
    disc((SX0 + 0.05, AXY, AXZ), (-1, 0, 0), 0.38, "soot", 16, 0.0)
    for xx in (-38.9, -37.2):                                                        # flanges
        cyl(0.44, 0.05, (xx, AXY, AXZ), "steel", rot=rot, verts=16)
        for k in range(6 if xx < -38 else 0):
            a = 2 * math.pi * (k + 0.5) / 6
            bolt((xx - 0.025, AXY + 0.425 * math.cos(a), AXZ + 0.425 * math.sin(a)), (-1, 0, 0), "steelDark", r=0.014)
    for xx in (-39.6, -37.9):                                                       # saddle stands
        box((0.5, 0.9, 0.02), (xx, AXY, FL + 0.01), "steelDark")
        for yy in (-0.32, 0.32):
            box((0.1, 0.08, AXZ - 0.4 - FL), (xx, AXY + yy, (AXZ - 0.4 + FL) / 2), "steelDark")
            bolt((xx + 0.17, AXY + yy, FL + 0.02), (0, 0, 1), "steel", r=0.012)
            bolt((xx - 0.17, AXY + yy, FL + 0.02), (0, 0, 1), "steel", r=0.012)
        # the saddle: a plate whose top follows the tube's underside (the arc runs right to left, so the outline
        # stays counter-clockwise)
        arcp = [(0.41 * math.cos(a), AXZ + 0.41 * math.sin(a)) for a in [-math.pi * (0.15 + 0.7 * k / 8) for k in range(9)]]
        plate([(-0.46, AXZ - 0.5), (0.46, AXZ - 0.5), (0.46, AXZ - 0.32)] + arcp + [(-0.46, AXZ - 0.32)],
              (xx - 0.03, AXY, 0), (0, 1, 0), (0, 0, 1), 0.06, "steelDark")
    for xw in (XI1, X1):                                                             # wall collars
        sq_collar(xw - (0.012 if xw == XI1 else 0.0), 0.66, 0.41, 0.012)
    box((0.7, 0.8, AXZ - 0.4), (-35.5, AXY, (AXZ - 0.4) / 2), "concreteOld", bevel=0.02)

    tally("stack")
    cx, cy = (SX0 + SX1) / 2, (SY0 + SY1) / 2
    o = box((SX1 - SX0, SY1 - SY0, 3.2), (cx, cy, 1.6), "concreteOld")
    densify(o, 2.0)
    o = box((SX1 - SX0 - 0.3, SY1 - SY0 - 0.3, 6.2), (cx, cy, 3.2 + 3.1), "concrete")
    densify(o, 3.0)
    box((SX1 - SX0 + 0.1, SY1 - SY0 + 0.1, 0.18), (cx, cy, 3.25), "concreteOld", bevel=0.02)
    box((SX1 - SX0 + 0.05, SY1 - SY0 + 0.05, 0.16), (cx, cy, 9.45), "steelDark", bevel=0.01)
    box((SX1 - SX0 - 1.0, SY1 - SY0 - 1.0, 1.6), (cx, cy, 9.4 + 0.8), "soot")
    for (dx, dy) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        box((0.3, 0.3, 2.2), (cx + dx * (SX1 - SX0 - 0.3) / 2, cy + dy * (SY1 - SY0 - 0.3) / 2, 10.5), "steelDark")
    for s in (-1, 1):                                                               # louvre blades, all four sides
        blades((cx, cy + s * ((SY1 - SY0) / 2 - 0.2), 9.68), (1, 0, 0), (0, s, 0), SX1 - SX0 - 0.6, 0.3, 7, 0.27)
        blades((cx + s * ((SX1 - SX0) / 2 - 0.2), cy, 9.68), (0, 1, 0), (s, 0, 0), SY1 - SY0 - 0.6, 0.3, 7, 0.27)
    for xx in (-33.6, -32.0, -30.4):                                                # splitter baffles in the top
        box((0.16, SY1 - SY0 - 1.1, 1.0), (xx, cy, 11.5), "steelDark")
    for s in (-1, 1):                                                               # the rim, aviation red
        box((SX1 - SX0 + 0.1, 0.25, 0.4), (cx, cy + s * ((SY1 - SY0) / 2 - 0.075), 11.8), "stencil", bevel=0.01)
        box((0.25, SY1 - SY0 - 0.4, 0.4), (cx + s * ((SX1 - SX0) / 2 - 0.075), cy, 11.8), "stencil", bevel=0.01)
    for k in range(4):                                                              # guard rail
        a = k * math.pi / 2
        pts = [(cx - 2.85, cy - 2.85), (cx + 2.85, cy - 2.85), (cx + 2.85, cy + 2.85), (cx - 2.85, cy + 2.85)]
        p0, p1 = pts[k], pts[(k + 1) % 4]
        for z in (12.55, 13.1):
            rod((p0[0], p0[1], z), (p1[0], p1[1], z), 0.02, "hazard", 5)
        rod((p0[0], p0[1], 12.0), (p0[0], p0[1], 13.1), 0.025, "hazard", 5)
        rod(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 12.0), ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 13.1), 0.02, "hazard", 5)
    cyl(0.05, 0.3, (SX1 - 0.2, SY1 - 0.2, 13.25), "steel", verts=8)
    sphere(0.09, (SX1 - 0.2, SY1 - 0.2, 13.45), "beacon", segs=8, rings=4, scale=(1, 1, 1.3))
    # the caged ladder on the east face
    LXp = SX1 + 0.25
    for yy in (cy - 0.25, cy + 0.25):
        rod((LXp, yy, 0.0), (LXp, yy, 13.1), 0.025, "steel", 4)
    z = 0.3
    while z < 12.9:
        rod((LXp, cy - 0.25, z), (LXp, cy + 0.25, z), 0.014, "steel", 3)
        z += 0.5
    for z in (1.0, 3.6, 6.2, 8.8, 11.4):
        for yy in (cy - 0.25, cy + 0.25):
            rod((SX1, yy, z), (LXp, yy, z), 0.02, "steel", 4)
    z = 2.6
    while z < 12.7:  # cage hoops
        tube([(LXp + 0.76 * math.sin(a), cy - 0.33 * math.cos(a), z) for a in [math.pi * k / 4 for k in range(5)]],
             0.012, "steel", sides=3, caps=False)
        z += 3.3
    for yy in (cy - 0.33, cy + 0.33, cy):
        xx = LXp + (0.76 if yy == cy else 0.0)
        rod((xx, yy, 2.6), (xx, yy, 12.6), 0.012, "steel", 4)
    # soot from the top, the stack's base apron, a hazard band on the base corners
    for (o, u) in (((SX0 + 0.15, 0, 0), (0, -1, 0)), ((0, SY1 - 0.15, 0), (-1, 0, 0))):     # soot under the louvres
        a0, a1 = ((-SY1 + 0.15, -SY0 - 0.15) if u[1] else (-SX1 + 0.15, -SX0 - 0.15))
        decal(rect(a0, 8.4, a1, 9.37), o, u, (0, 0, 1), "soot", 0.004)
    apron(cx, cy, 3.0, 3.0, [0.0, 0.5, 1.6], 0.005, "worn", noise=0.5, seed=33, ns=4, nc=3)


build_stack()
finish_group("hushStack")


# =====================================================================================================================
# the nodes the game reads
# =====================================================================================================================
empty("hushMount", (MOUNT_X, AXY, AXZ))
for i, x in enumerate((-43.11, -42.98, -42.85, -42.72)):
    empty("hushCradle%d" % i, (x, AXY, 0.90))
empty("hushLow", (-43.0, AXY, 0.80))
empty("hushInlet", (INLET_X, AXY, AXZ))
empty("hushOutlet", ((SX0 + SX1) / 2, (SY0 + SY1) / 2, STOP))
empty("hushWindow", (-42.8, -15.9, 1.55))
empty("hushBay", (-60.5, -10.0, 1.7))
empty("hushDoor", ((PX0 + PX1) / 2, (BD0 + BD1) / 2, 1.6))
empty("hushBench", (-54.5, -12.0, FL + 0.9))
empty("hushLamp0", (-43.0, -14.4, 4.5))
empty("hushLamp1", (-43.0, -9.6, 4.5))
empty("hushLamp2", (-59.0, -12.0, 6.6))
empty("hushLamp3", (-51.5, -12.0, 6.6))
empty("hushCellMin", (PX1, Y0, FL))
empty("hushCellMax", (X1, Y1, CEIL))

finish_all(OUT, T0, ao=not FAST)


# =====================================================================================================================
# check renders (only with --render DIR): flat palette colours times the baked AO, a sun and the lamps. Not exported.
# =====================================================================================================================
def render_checks(outdir):
    import mathutils
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        if not b:
            continue
        col = tuple(b.inputs["Base Color"].default_value)
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        tint = nt.nodes.new("ShaderNodeMix")
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1.0
        ia = [s for s in tint.inputs if s.identifier == "A_Color"][0]
        ib = [s for s in tint.inputs if s.identifier == "B_Color"][0]
        ia.default_value = col
        nt.links.new(vc.outputs["Color"], ib)
        out = [s for s in tint.outputs if s.identifier == "Result_Color"][0]
        nt.links.new(out, b.inputs["Base Color"])
        if m.name == "glass":
            b.inputs["Alpha"].default_value = 0.12
        if m.get("emitboost") is None and b.inputs["Emission Strength"].default_value > 0:
            b.inputs["Emission Strength"].default_value = 4.0
    if sc.world is None:                          # a fast (no AO bake) run has no world yet
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.72, 0.78, 0.86, 1)
    bg.inputs[1].default_value = 0.7
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-60))
    sc.collection.objects.link(sun)
    for name, (x, y, z), e in (("l0", (-43.0, -14.4, 4.4), 900), ("l1", (-43.0, -9.6, 4.4), 900),
                               ("l2", (-59.0, -12.0, 6.5), 1500), ("l3", (-51.5, -12.0, 6.5), 1500),
                               ("lc", (-43.2, -17.3, 2.8), 250)):
        L = bpy.data.objects.new(name, bpy.data.lights.new(name, "POINT"))
        L.data.energy = e
        L.data.shadow_soft_size = 0.15
        L.location = (x, y, z)
        sc.collection.objects.link(L)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.engine = "CYCLES"
    sc.cycles.samples = int(os.environ.get("HUSH_SAMPLES", "24"))
    try:
        sc.cycles.use_denoising = True
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = 960, 640
    sc.view_settings.view_transform = "Standard"
    shots = [("bay", (-60.5, -10.0, 1.7), (-46.5, -12.0, 1.6), 62),
             ("side", (-42.6, -9.5, 1.2), (-43.0, -12.0, 1.05), 62),
             ("window", (-42.8, -15.9, 1.55), (-43.0, -12.0, 1.05), 55),
             ("exterior", (-20.0, 10.0, 6.0), (-46.0, -12.0, 4.0), 50),
             ("cell", (-37.0, -5.8, 4.6), (-43.0, -13.0, 1.0), 70),
             ("control", (-41.0, -18.45, 1.9), (-43.3, -15.7, 1.2), 75),
             ("bayback", (-48.3, -7.0, 2.4), (-60.0, -14.0, 1.0), 70),
             ("stand", (-42.3, -11.0, 1.35), (-43.15, -12.0, 1.0), 50)]
    only = os.environ.get("HUSH_SHOTS")
    for name, pos, tgt, fov in shots:
        if only and name not in only.split(","):
            continue
        cam.location = pos
        d = mathutils.Vector(tgt) - mathutils.Vector(pos)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam.data.angle = math.radians(fov)
        sc.render.filepath = os.path.join(outdir, "hush-%s.png" % name)
        bpy.ops.render.render(write_still=True)
        print("rendered", sc.render.filepath)


if "--render" in sys.argv:
    render_checks(sys.argv[sys.argv.index("--render") + 1])
