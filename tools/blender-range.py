"""Burn Rate: build models/range.glb, the 3D test range (stage 7, plan section 9.3), with scripted Blender.

No Blender UI and no hand modelling: every slab, beam, bolt and sandbag is placed by this script, so the model can be
rebuilt and changed by editing numbers. Run it headless from the repo root, either way (about 15 seconds):

    blender -b -P tools/blender-range.py        (a Blender install, 4.2 or newer)
    python tools/blender-range.py               (the bpy module from PyPI: pip install bpy)

It writes models/range.glb. Commit that file with this script. The shared helpers (materials with texture keys, box
projected UVs in metres, the baked ambient occlusion, export) are in tools/blender_lib.py. src/vis/stand3d.js loads the
model and reads the named nodes below; the procedural parts (the motor, the plume, the ground, the hills, the rocket) are
drawn by three.js because they change with every design.

Blender is Z-up; the exporter turns it Y-up, so Blender (x, y, z) is three.js (x, z, -y). The game's side-on camera sits
on Blender +Y of the motor, the blockhouse window camera on -Y, so both those sides of the pad are kept low.

What is in it (each group is one joined mesh, one draw call per material):
  - stand: Stand 3 at the origin, exhaust along +X. Reinforced concrete pad cast in slabs with sealed expansion joints
    and a grated drain channel; the bevelled concrete thrust block (form-tie holes, hazard chevron band, a big stencil
    "3"), a beacon and two floodlights on top; a steel thrust frame (embedded back plate, box gussets, front thrust
    plate on a bolted base plate with side gussets, bolt pattern); the load cell assembly (flexure, flange, stainless
    cell, load button, cable gland and its cable to the DAQ); a pressure-transducer stand-off bracket with its stainless
    line; twin I-beam rails (real I profile) on welded pedestals with base plates and anchor bolts; four screw-jack saddle
    supports; the old green junction box with conduit, the startup's graphite DAQ case on a stand, sandbag walls of lumpy
    bags, a camera mast with a weatherproof housing aimed at the motor, the amber firing line on a cable reel, fire
    extinguisher, warning sign, pallet, drums and a wooden cable drum, the covered cable trench to the blockhouse,
    worn ground, tyre ruts and salt crust round the pad, and downrange (from x = 11.2 m) an earth berm with a scorched
    concrete blast deflector.
  - blockhouse: the old Site 41 bunker, 40 m off on -Y, abeam of the motor: earth-banked concrete, the armoured slit
    window (deep surround, steel lining, hinged shutter hanging open below) facing the stand, periscopes, vent stacks,
    an antenna mast with guy wires, the blast door (hinges, wheel lock, dogs) down a flight of steps between retaining
    walls, a stencil plate, and a cable pit where the trench ends.
  - launchpad: 70 m off on +Y. Slab pad, steel blast plate, the 3 m rail (a 1010-style slotted extrusion) on stand-off
    arms from a braced mast, a blast shield, igniter clip leads, the startup's cobalt launch controller on a tripod, a
    tarp-covered crate and a windsock.
  - workshop: the startup's cobalt 20 ft container (real corrugation, door leaves with locking bars, a cut-in door and
    barred window, an awning over a workbench) with a generator and drums.
  - watertower (lattice legs, girts and cross braces, tank, balcony, ladder), flood0..2 (floodlight masts with lamp heads
    aimed at the stand / pad), radar (the old dish on its plinth with a lattice back structure and feed), fence (old
    cranked concrete posts and wire strands), plus portacabin and clutter (pallets, drums, road blocks, marker posts and
    the dirt tracks between them).

Nodes the game reads (keep these names and meanings):
  motorMount   the motor's forward end, on the load button face: (-0.04, 0, 0.85) Blender
  cradle5, cradle15, cradle26, cradle38   saddle support tops at x = 0.5, 1.5, 2.6, 3.8 m, y = 0, z = 0.64
  railBase     the launch rail's foot: (-12, 70, 0.24) Blender
  blockhouse   its local point (-3.8, 2.05, 0.6) in three.js terms (Blender local (-3.8, -0.6, 2.05)) is just outside
               the slit window, which faces the stand
  stand, launchpad, workshop, watertower, flood0, flood1, flood2, radar, fence (and portacabin, clutter)

Kept clear for the cameras: nothing stands in the exhaust path for 8 m along +X (the berm starts at 11.2 m), between
the blockhouse slit and the motor, between the side-on camera (+Y) and the motor, or between the pad camera and the
rail (flood2 is set off to the side for that).

Materials are the game's palette (src/css/style.css) times a shared tileable texture (textures/, see blender_lib.py).

Budget: the phone downloads this file, so it must stay at or under 1.5 MB. The file size, not the triangle count, is the
limit: every exported vertex costs about 40 bytes (position, normal, UV, AO colour) and every triangle 6, so 1.5 MB is
about 32k vertices. Vertices are split wherever a normal, UV or material changes, which is why small parts are smooth
shaded with flat UVs (prep_parts, flat_uvs), resting faces are culled (cull_resting) and the AO is averaged per vertex.
tally() prints what each section costs; the end of the run prints triangles per mesh and the file size.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_lib import *            # noqa: F401,F403  (reset, mat, box, cyl, join, place, bake_ao, export...)
from blender_lib import GROUP, MATS, keep
import bpy, bmesh                    # bmesh loads once bpy has
from mathutils import Vector, Matrix

T0 = time.time()
OUT = os.path.join(ROOT, "models", "range.glb")

AXIS_Z = 0.85          # motor axis height above the ground (m); src/vis/stand3d.js reads the motorMount node, not this
MOUNT_X = -0.04        # the motor's forward end (the load button's face)
CRADLE_TOP = 0.64      # saddle support tops; stand3d.js builds saddles from here up to the motor
PAD_T = 0.25           # stand pad thickness (its top is the floor of the stand)
BH_POS, BH_RZ = (4.0, -40.0), math.atan2(40, 1.6 - 4) - math.pi   # blockhouse: abeam; its local -X faces the stand
LP = (-12.0, 70.0)     # launch pad centre
LP_T = 0.2             # launch pad thickness; the blast plate on it tops out at railBase height 0.24

scene = reset()

# ---- materials: the palette times a texture key (tile = metres per texture repeat) --------------------------------
mat("concrete", "#CFCBC2", tex="concrete", tile=2.0)
mat("concreteDark", "#A29E95", tex="concrete", tile=2.0)
mat("concreteOld", "#B8B3A8", tex="concreteOld", tile=3.0)
mat("soot", "#5B5751", tex="concreteOld", tile=3.0)                     # scorch on the deflector, tie-hole plugs
mat("steel", "#7A8087", tex="metal", tile=0.5, rough=0.5, metal=0.6)    # bare / galvanised steel
mat("steelDark", "#3E4247", tex="paint", tile=1.0, rough=0.6, metal=0.3)  # dark painted steel
mat("alu", "#B9BDC2", tex="metal", tile=0.5, rough=0.35, metal=0.7)     # stainless and aluminium
mat("hazard", "#E0A526", tex="paint", tile=1.0, rough=0.7)
mat("ink", "#23262A", tex="paint", tile=1.0, rough=0.8)
mat("stateGreen", "#5E7F6E", tex="paint", tile=1.0, rough=0.85)
mat("stencil", "#A8322A", tex="paint", tile=1.0, rough=0.8)
mat("cobalt", "#2A55C9", tex="paint", tile=1.0, rough=0.6)
mat("kitGraphite", "#3A3E44", tex="paint", tile=1.0, rough=0.55)        # the startup's graphite kit
mat("white", "#EDEBE5", tex="paint", tile=1.0, rough=0.8)
mat("rust", "#EDE6DC", tex="rust", tile=1.0, rough=0.9, metal=0.2)
mat("earth", "#F2ECE2", tex="earth", tile=4.0, rough=1.0)
mat("worn", "#D8CFC0", tex="earth", tile=4.0, rough=1.0)                # trodden ground, tyre ruts
mat("salt", "#ECE7DC", tex="salt", tile=20.0, rough=1.0)
mat("sand", "#B5A685", tex="burlap", tile=0.5, rough=1.0)               # sandbags
mat("tarp", "#5873A3", tex="burlap", tile=0.5, rough=0.9)               # faded blue tarp and awning
mat("wood", "#F2E8DA", tex="wood", tile=1.0, rough=0.9)
mat("glass", "#2B3440", rough=0.15)
mat("rubber", "#1E2023", rough=0.8)
mat("cableAmber", "#E0A526", rough=0.6)                                 # the firing line
mat("cableRed", "#B3261E", rough=0.6)
mat("sealant", "#2A2927", rough=0.9)
mat("lamp", "#FFF3D6", rough=0.3, emit="#FFF3D6")
mat("beacon", "#C8341E", rough=0.3, emit="#B02A18")
mat("strobe", "#E0A526", rough=0.3, emit="#C88A10")


# =====================================================================================================================
# helpers on top of blender_lib
# =====================================================================================================================
class frame:
    """build parts in a local frame: everything added to the group inside `with frame(...)` is moved by
    translate(loc) . rotZ(rz) . rotY(ry) . rotX(rx) when the block ends (frames nest)"""
    def __init__(self, loc=(0, 0, 0), rz=0.0, ry=0.0, rx=0.0, M=None):
        self.M = M if M is not None else (Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, "Z") @
                                          Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X"))

    def __enter__(self):
        self.n = len(GROUP)
        return self

    def __exit__(self, *a):
        for o in GROUP[self.n:]:
            o.data.transform(self.M)
            o.data.update()

    def __call__(self, p):
        return self.M @ Vector(p)


def align(p, n):
    """a matrix that puts local +Z along n, at point p (for bolts and fittings on any face)"""
    return Matrix.Translation(Vector(p)) @ Vector((0, 0, 1)).rotation_difference(Vector(n).normalized()).to_matrix().to_4x4()


_box, _cyl = box, cyl


def box(size, loc, m, rot=(0, 0, 0), bevel=0.0, segs=1):
    """blender_lib.box with one bevel segment by default, and no bevel on parts under 10 cm (unseen, ~30 triangles)"""
    if max(size) < 0.1:
        bevel = 0.0
    return _box(size, loc, m, rot, bevel, segs)


def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=24, r2=None, bevel=0.0, segs=1):
    if max(r, depth) < 0.03:
        bevel = 0.0
    return _cyl(r, depth, loc, m, rot, verts, r2, bevel, segs)


def mk(name, verts, faces, m, bevel=0.0, segs=1, recalc=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return keep(o, m, bevel, segs)


def nb(o, zmax=None):
    """drop the downward faces of a part that sits on something (never seen; saves triangles)"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    kill = [f for f in bm.faces if f.normal.z < -0.98 and (zmax is None or f.calc_center_median().z < zmax)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    return o


def cull_resting(levels=(0.0,), tol=0.004):
    """before a join: drop every downward face lying on one of the given heights (the ground, a pad's top). They are
    never seen and cost vertices, which are what the glb's size is made of"""
    for o in GROUP:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        kill = [f for f in bm.faces if f.normal.z < -0.98 and
                any(abs(f.calc_center_median().z - L) < tol for L in levels)]
        if kill:
            bmesh.ops.delete(bm, geom=kill, context="FACES")
            bm.to_mesh(o.data)
        bm.free()


def prep_parts(sharp=61):
    """before a join: mark each part's hard edges (sharper than `sharp` degrees) for the split, and tag thin or small
    parts (rods, wires, cables, bolts, plugs) so finish_group() shades them smooth and gives each one a single UV.
    UV seams and hard edges each duplicate vertices in the glb, and on thin parts neither can be seen"""
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
        thin = ext[1] < 0.05 or ext[2] < 0.06
        bm = bmesh.new()
        bm.from_mesh(me)
        lim = math.radians(140 if thin else sharp)
        for e in bm.edges:
            if e.is_manifold and e.calc_face_angle(0.0) > lim:
                e.smooth = False
        bm.to_mesh(me)
        bm.free()
        a = me.attributes.get("part") or me.attributes.new("part", "INT", "FACE")
        a.data.foreach_set("value", [i + 1 if thin else 0] * len(me.polygons))


def flat_uvs(o):
    """after the join: every thin part gets one UV (its own mean), so it samples one patch of its texture and has no
    seams"""
    me = o.data
    a = me.attributes.get("part")
    uv = me.uv_layers.active
    if not a or not uv:
        return
    acc = {}
    for p in me.polygons:
        k = a.data[p.index].value
        if k:
            t = acc.setdefault(k, [0.0, 0.0, 0])
            for li in p.loop_indices:
                u, v = uv.data[li].uv
                t[0] += u
                t[1] += v
                t[2] += 1
    for p in me.polygons:
        k = a.data[p.index].value
        if k:
            t = acc[k]
            for li in p.loop_indices:
                uv.data[li].uv = (t[0] / t[2], t[1] / t[2])
    me.attributes.remove(a)


def finish_group(name, levels=(0.0,), sharp=61):
    """close a group: drop hidden faces, mark hard edges, join it into one mesh, flatten thin parts' UVs"""
    tally("end")
    cull_resting(levels)
    prep_parts(sharp)
    o = join(name, smooth_angle=180, max_edge=0)
    flat_uvs(o)
    return o


def plate(pts, o, u, v, t, m, bevel=0.0, segs=1, caps=True):
    """a flat part: the polygon pts (counter-clockwise in u, v) on the plane through o, extruded t along u x v
    (caps=False leaves the two polygon faces off, for a profile whose ends are hidden)"""
    o, u, v = Vector(o), Vector(u).normalized(), Vector(v).normalized()
    n = u.cross(v)
    k = len(pts)
    V = [o + u * a + v * b for a, b in pts] + [o + u * a + v * b + n * t for a, b in pts]
    F = ([list(range(k))[::-1], list(range(k, 2 * k))] if caps else []) + \
        [[i, (i + 1) % k, k + (i + 1) % k, k + i] for i in range(k)]
    return mk("plate", V, F, m, bevel, segs)


def rect(u0, v0, u1, v1):
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def catmull(P, sub):
    out = []
    n = len(P)
    for i in range(n - 1):
        p0, p1, p2 = P[max(i - 1, 0)], P[i], P[i + 1]
        p3 = P[min(i + 2, n - 1)]
        for s in range(sub):
            t = s / sub
            out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (3 * p1 - p0 - 3 * p2 + p3) * t * t * t))
    out.append(P[-1])
    return out


def tube(pts, r, m, sides=8, sub=0, caps=True):
    """a round section swept along a polyline (Catmull-Rom smoothed with sub points per span): cables, pipes, rods"""
    P = [Vector(p) for p in pts]
    if sub:
        P = catmull(P, sub)
    n = len(P)
    T = [(P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = (ref - T[0] * ref.dot(T[0])).normalized()
    V, F = [], []
    for i in range(n):
        if i:
            N2 = N - T[i] * N.dot(T[i])
            N = N2.normalized() if N2.length > 1e-6 else N
        B = T[i].cross(N)
        for k in range(sides):
            a = 2 * math.pi * k / sides
            V.append(P[i] + r * (math.cos(a) * N + math.sin(a) * B))
    for i in range(n - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            F.append([a, b, b + sides, a + sides])
    if caps:
        F.append(list(range(sides))[::-1])
        F.append([(n - 1) * sides + k for k in range(sides)])
    return mk("tube", V, F, m)


def rod(p0, p1, r, m, sides=6):
    return tube([p0, p1], r, m, sides)


def ngon_prism(n, r, h, M, m, bottom=False, rot0=0.0):
    """an n-sided prism (bolt heads, washers, plugs) of radius r and height h, standing on local z = 0 of matrix M;
    the bottom face is left off unless asked (it sits on something)"""
    V = []
    for z in (0.0, h):
        for k in range(n):
            a = rot0 + 2 * math.pi * k / n
            V.append(M @ Vector((r * math.cos(a), r * math.sin(a), z)))
    F = [[k, (k + 1) % n, n + (k + 1) % n, n + k] for k in range(n)] + [list(range(n, 2 * n))]
    if bottom:
        F.append(list(range(n))[::-1])
    return mk("ngon", V, F, m)


def bolt(p, n, m="steel", r=0.012, h=None, washer=False, stud=0.0):
    """a hex head (or a nut with the thread end sticking out, stud > 0), optionally on a washer, on a face at p with
    normal n. No hidden faces: a bolt is 16 triangles, 38 with a washer and a stud"""
    h = h or r * 0.7
    M = align(p, n)
    z = 0.0
    if washer:
        ngon_prism(8, r * 1.5, r * 0.22, M, m)
        z = r * 0.22
    ngon_prism(6, r, h, M @ Matrix.Translation((0, 0, z)), m, rot0=math.pi / 6)
    if stud:
        ngon_prism(6, r * 0.55, stud, M @ Matrix.Translation((0, 0, z + h)), m)


def disc(p, n, r, m, sides=8, lift=0.002):
    """a flat round patch on a face (plugged tie holes, labels, lamp lenses): one polygon, lifted off the face"""
    M = align(Vector(p) + Vector(n).normalized() * lift, n)
    V = [M @ Vector((r * math.cos(2 * math.pi * k / sides), r * math.sin(2 * math.pi * k / sides), 0)) for k in range(sides)]
    return mk("disc", V, [list(range(sides))], m)


def clip(poly, x0, x1, y0, y1):
    """Sutherland-Hodgman: clip a polygon to a rectangle"""
    def cut(P, inside, inter):
        out = []
        for i in range(len(P)):
            a, b = P[i - 1], P[i]
            if inside(b):
                if not inside(a):
                    out.append(inter(a, b))
                out.append(b)
            elif inside(a):
                out.append(inter(a, b))
        return out

    def ix(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def iy(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)
    for inside, inter in ((lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
                          (lambda p: p[1] >= y0, iy(y0)), (lambda p: p[1] <= y1, iy(y1))):
        poly = cut(poly, inside, inter)
        if not poly:
            break
    return poly


def chevrons(o, u, v, L, H, w, t=0.004, m1="hazard", m2="ink"):
    """a hazard band: diagonal amber stripes over black, L by H, on a face"""
    plate(rect(0, 0, L, H), o, u, v, t, m2)
    k = -int(H / w) - 2
    while k * 2 * w < L:
        x = k * 2 * w
        p = clip([(x, 0), (x + w, 0), (x + w + H, H), (x + H, H)], 0, L, 0, H)
        if len(p) >= 3:
            plate(p, o, u, v, t * 1.6, m1)
        k += 1


SEG = {   # stencil digits as strokes on a unit 0.6 x 1 cell, with the bridges a stencil leaves
    "3": [(0.05, 0.88, 0.55, 1.0), (0.43, 0.56, 0.55, 0.85), (0.15, 0.44, 0.55, 0.56), (0.43, 0.15, 0.55, 0.41),
          (0.05, 0.0, 0.55, 0.12)],
    "4": [(0.05, 0.42, 0.17, 1.0), (0.05, 0.36, 0.38, 0.48), (0.43, 0.0, 0.55, 0.32), (0.43, 0.52, 0.55, 1.0),
          (0.43, 0.36, 0.6, 0.48)],
    "1": [(0.2, 0.0, 0.34, 0.86), (0.08, 0.78, 0.18, 0.88), (0.2, 0.9, 0.34, 1.0)],
}


def stencil(text, o, u, v, h, m="stencil", t=0.003, gap=0.18):
    x = 0.0
    for ch in text:
        for (a, b, c, d) in SEG.get(ch, []):
            plate(rect((x + a) * h, b * h, (x + c) * h, d * h), o, u, v, t, m)
        x += 0.6 + gap


def bag(c, rz, L=0.52, W=0.33, H=0.15, seed=0, m="sand"):
    """one sandbag: a lumpy pillow (a squarish superellipsoid with a flat bottom, a tied end and some noise)"""
    rnd = random.Random(seed)
    nu, nv = 8, 4
    ph = [rnd.uniform(0, 6.3) for _ in range(4)]

    def sp(x, e):
        return math.copysign(abs(x) ** e, x)
    V = [Vector((0, 0, -H * 0.42))]
    for k in range(1, nv):
        b = -math.pi / 2 + math.pi * k / nv
        for j in range(nu):
            a = 2 * math.pi * j / nu
            tie = 1 - 0.18 * max(0.0, -math.cos(a)) ** 3
            lump = 1 + 0.07 * math.sin(3 * a + ph[0]) * math.cos(b) + 0.05 * math.sin(2 * b + a + ph[1])
            x = L / 2 * sp(math.cos(b), 0.5) * sp(math.cos(a), 0.4) * lump
            y = W / 2 * sp(math.cos(b), 0.5) * sp(math.sin(a), 0.4) * tie * lump
            z = H / 2 * sp(math.sin(b), 0.7) * tie
            z = max(z, -H * 0.42) + 0.012 * math.sin(4 * a + ph[2])
            V.append(Vector((x, y, z)))
    V.append(Vector((0, 0, H / 2 * (1 + 0.1 * math.sin(ph[3])))))
    F = []
    for j in range(nu):
        F.append([0, 1 + (j + 1) % nu, 1 + j])
    for k in range(nv - 2):
        for j in range(nu):
            a, b = 1 + k * nu + j, 1 + k * nu + (j + 1) % nu
            F.append([a, b, b + nu, a + nu])
    top = len(V) - 1
    for j in range(nu):
        F.append([1 + (nv - 2) * nu + j, 1 + (nv - 2) * nu + (j + 1) % nu, top])
    M = (Matrix.Translation(Vector(c)) @ Matrix.Rotation(rz, 4, "Z") @
         Matrix.Rotation(rnd.uniform(-0.05, 0.05), 4, "X") @ Matrix.Rotation(rnd.uniform(-0.04, 0.04), 4, "Y"))
    V = [M @ (p + Vector((0, 0, H * 0.42))) for p in V]
    return mk("bag", V, F, m, recalc=True)


def bag_wall(p0, p1, courses, z0=0.0, seed=1, L=0.52, W=0.33, H=0.15):
    """a wall of sandbags laid in running bond from p0 to p1 (ground points), courses high"""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    n = max(1, round(d.length / (L * 0.96)))
    rz = math.atan2(d.y, d.x)
    rnd = random.Random(seed)
    for k in range(courses):
        odd = k % 2 if n > 1 else 0                  # running bond; a one-bag-long wall just stacks
        m = n - odd
        for i in range(m):
            f = (i + 0.5 + 0.5 * odd) / n
            q = p0 + d * f
            q.z = z0 + k * H * 0.8
            s = rnd.uniform(0.94, 1.05)
            bag(q, rz + rnd.uniform(-0.08, 0.08) + (math.pi if rnd.random() < 0.5 else 0), L * s, W * s, H,
                seed=seed * 100 + k * 17 + i)


def rrect(hx, hy, off, ns, nc):
    """counter-clockwise points round a rectangle (half sizes hx, hy) grown by off with round corners"""
    pts = []
    C = [(hx, -hy, -90), (hx, hy, 0), (-hx, hy, 90), (-hx, -hy, 180)]
    for ci, (cx, cy, a0) in enumerate(C):
        for k in range(nc):
            a = math.radians(a0 + 90 * k / (nc - 1))
            pts.append((cx + off * math.cos(a), cy + off * math.sin(a)))
        nx, ny, _ = C[(ci + 1) % 4]
        ex, ey = pts[-1]
        a1 = math.radians(C[(ci + 1) % 4][2])
        sx, sy = nx + off * math.cos(a1), ny + off * math.sin(a1)
        for k in range(1, ns + 1):
            f = k / (ns + 1)
            pts.append((ex + (sx - ex) * f, ey + (sy - ey) * f))
    return pts


def apron(cx, cy, hx, hy, offs, z, m, noise=0.4, seed=3, ns=4, nc=4, rz=0.0):
    """a flat ground patch in rings round a footprint: worn ground, gravel. The rings give the AO bake vertices
    near the footprint's edge, so things seem to sit on the ground; the outer ring is ragged"""
    rnd = random.Random(seed)
    rings = []
    for k, off in enumerate(offs):
        P = rrect(hx, hy, max(off, 0.01), ns, nc)
        if k == len(offs) - 1:
            n = len(P)
            ph = [rnd.uniform(0, 6.3) for _ in range(3)]
            Q = []
            for i, (x, y) in enumerate(P):
                a = 2 * math.pi * i / n
                g = 1 + noise * (0.5 * math.sin(3 * a + ph[0]) + 0.3 * math.sin(7 * a + ph[1]) + 0.2 * math.sin(13 * a + ph[2]))
                ix, iy = max(-hx, min(hx, x)), max(-hy, min(hy, y))
                Q.append((ix + (x - ix) * g, iy + (y - iy) * g))
            P = Q
        rings.append(P)
    n = len(rings[0])
    ca, sa = math.cos(rz), math.sin(rz)
    V = [(cx + x * ca - y * sa, cy + x * sa + y * ca, z) for R in rings for (x, y) in R]
    F = []
    for k in range(len(rings) - 1):
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n
            F.append([a, a + n, b + n, b])
    return mk("apron", V, F, m)


def blob(cx, cy, r, z, m, seed=5, n=14, squash=0.7, rz=0.0):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.3) for _ in range(3)]
    V = [(cx, cy, z)]
    ca, sa = math.cos(rz), math.sin(rz)
    for i in range(n):
        a = 2 * math.pi * i / n
        g = r * (1 + 0.25 * math.sin(2 * a + ph[0]) + 0.15 * math.sin(5 * a + ph[1]) + 0.08 * math.sin(9 * a + ph[2]))
        x, y = g * math.cos(a), g * math.sin(a) * squash
        V.append((cx + x * ca - y * sa, cy + x * sa + y * ca, z))
    F = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]
    return mk("blob", V, F, m)


def strip(pts, w, z, m, sub=4):
    """a flat ribbon on the ground along a smoothed path: tyre ruts"""
    P = catmull([Vector((x, y, 0)) for x, y in pts], sub)
    V, F = [], []
    for i, p in enumerate(P):
        d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        left = Vector((-d.y, d.x, 0)) * (w / 2)
        V += [p + left + Vector((0, 0, z)), p - left + Vector((0, 0, z))]
    for i in range(len(P) - 1):
        F.append([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2])
    return mk("strip", V, F, m)


def ruts(pts, z=0.009, gauge=1.6, w=0.3):
    P = catmull([Vector((x, y, 0)) for x, y in pts], 3)
    for side in (-1, 1):
        Q = []
        for i, p in enumerate(P):
            d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            q = p + Vector((-d.y, d.x, 0)) * (gauge / 2 * side)
            Q.append((q.x, q.y))
        strip(Q, w, z, "worn", sub=1)


def heightfield(xs, ys, h, m, skip=None):
    """a terrain patch over the grid xs by ys (lists), heights h(x, y); quads whose centre skip(x, y) says are hidden
    (under a building) are left out"""
    idx, V, F = {}, [], []

    def vid(i, j):
        if (i, j) not in idx:
            idx[(i, j)] = len(V)
            V.append((xs[i], ys[j], h(xs[i], ys[j])))
        return idx[(i, j)]
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if skip and skip(cx, cy):
                continue
            F.append([vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)])
    return mk("terrain", V, F, m)


def grid(a, b, step, extra=()):
    n = max(1, int(round((b - a) / step)))
    return sorted(set([round(a + (b - a) * k / n, 4) for k in range(n + 1)] + [round(e, 4) for e in extra]))


def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


_TALLY = [0, "start"]


def tally(label):
    """print the triangles added to the group since the last tally (a budget aid: the glb costs about 40 bytes a
    vertex, so 1.5 MB is about 30k vertices in all)"""
    n = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in GROUP[_TALLY[0]:])
    if n:
        print("    %-28s %6d tris" % (_TALLY[1], n))
    _TALLY[0], _TALLY[1] = (0, "") if label == "end" else (len(GROUP), label)


def drum(x, y, z=0.0, m="stateGreen", lying=False, rz=0.0):
    """an oil drum: body, two rolling hoops, the top rim and a bung"""
    M = Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(rz, 4, "Z")
    if lying:
        M = M @ Matrix.Translation(Vector((0, 0, 0.29))) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Translation(Vector((0, 0, -0.44)))
    with frame(M=M):
        cyl(0.285, 0.88, (0, 0, 0.44), m, verts=12)
        for hz in (0.29, 0.59):
            tube([(0, 0, hz - 0.012), (0, 0, hz + 0.012)], 0.294, m, sides=12, caps=False)
        tube([(0, 0, 0.87), (0, 0, 0.89)], 0.29, m, sides=12, caps=False)
        cyl(0.03, 0.012, (0.17, 0.05, 0.886), "steel", verts=6)


def pallet(x, y, z=0.0, rz=0.0, m="wood"):
    """a 1.2 x 0.8 m stringer pallet: three stringers under a slatted deck"""
    with frame((x, y, z), rz=rz):
        for by in (-0.35, 0, 0.35):
            box((1.2, 0.08, 0.1), (0, by, 0.05), m)
        for k in range(5):
            box((0.12, 0.8, 0.022), (-0.54 + k * 0.27, 0, 0.111), m)


# =====================================================================================================================
# Stand 3: the static test stand at the origin. The exhaust points +X; the motor lies on the saddles from motorMount.
# =====================================================================================================================
def build_stand():
    Z = PAD_T
    tally("the pad: cast in slabs wit")
    # ---- the pad: cast in slabs with sealed expansion joints; a drain channel across the downrange end ----
    XB = [-3.2, -0.3, 2.2, 4.6, 6.6]
    YB = [-2.6, 0.0, 2.6]
    g = 0.014
    for i in range(len(XB) - 1):
        for j in range(2):
            xa, xb, ya, yb = XB[i] + g / 2, XB[i + 1] - g / 2, YB[j] + g / 2, YB[j + 1] - g / 2
            o = box((xb - xa, yb - ya, Z), ((xa + xb) / 2, (ya + yb) / 2, Z / 2), "concrete", bevel=0.012, segs=1)
            densify(nb(o), 1.2)
    o = box((0.3, 5.2 - g, Z), (7.05, 0, Z / 2), "concrete", bevel=0.012, segs=1)   # curb beyond the drain
    densify(nb(o), 1.0)
    plate(rect(-3.2, -2.6, 7.2, 2.6), (0, 0, Z - 0.03), (1, 0, 0), (0, 1, 0), 0.01, "sealant")  # seen in the joints
    box((0.3, 5.2, 0.04), (6.75, 0, 0.08), "concreteDark")                           # drain channel floor
    for y in (-2.59, 2.59):
        box((0.3, 0.02, Z - 0.1), (6.75, y, 0.1 + (Z - 0.1) / 2), "concreteDark")
    for x in (6.61, 6.89):                                                           # grating frame (angle)
        box((0.02, 5.2, 0.03), (x, 0, Z - 0.015), "steel")
    for k in range(4):                                                               # bearing bars
        box((0.005, 5.18, 0.03), (6.666 + k * 0.056, 0, Z - 0.018), "steel")
    for k in range(6):                                                               # cross bars
        box((0.28, 0.008, 0.008), (6.75, -2.25 + k * 0.9, Z - 0.006), "steel")

    tally("the thrust block: a reinfo")
    # ---- the thrust block: a reinforced concrete monolith behind the motor ----
    BX0, BX1, BY = -1.6, -0.57, 1.3
    BZ1 = Z + 2.05
    o = box((BX1 - BX0, 2 * BY, BZ1 - Z), ((BX0 + BX1) / 2, 0, (Z + BZ1) / 2), "concreteOld", bevel=0.035, segs=1)
    densify(nb(o), 0.9)
    chevrons((BX1, -1.25, BZ1 - 0.34), (0, 1, 0), (0, 0, 1), 2.5, 0.24, 0.11)        # hazard band on the face
    chevrons((BX1 - 0.06, BY, Z + 0.06), (-1, 0, 0), (0, 0, 1), 0.92, 0.2, 0.1)      # and along the +Y foot
    plate(rect(0.08, 0.0, 0.94, 1.02), (BX1, BY, Z + 0.62), (-1, 0, 0), (0, 0, 1), 0.002, "stencil")  # painted panel
    stencil("3", (BX1 - 0.32, BY + 0.002, Z + 0.72), (-1, 0, 0), (0, 0, 1), 0.78, m="white", t=0.003)
    plate(rect(0, 0, 0.42, 0.16), (BX1, 0.72, Z + 1.36), (0, 1, 0), (0, 0, 1), 0.004, "stencil")  # range plate
    for k in range(3):
        plate(rect(0.04 + k * 0.13, 0.05, 0.12 + k * 0.13, 0.11), (BX1 + 0.004, 0.72, Z + 1.36), (0, 1, 0), (0, 0, 1), 0.002, "white")
    for zz in (0.42, 1.0, 1.58):                                                     # form-tie holes, plugged
        for yy in (-1.05, -0.65, 0.65, 1.05):
            if not (yy > 0.6 and zz > 1.3):
                disc((BX1, yy, Z + zz), (1, 0, 0), 0.018, "soot", 6)
            disc((BX0, yy, Z + zz), (-1, 0, 0), 0.018, "soot", 6)
        for xx in (-1.42, -1.09, -0.76):
            disc((xx, -BY, Z + zz), (0, -1, 0), 0.018, "soot", 6)
            if zz < 0.6:
                disc((xx, BY, Z + zz), (0, 1, 0), 0.018, "soot", 6)
    # beacon and two floodlights on top
    cyl(0.022, 0.42, (-1.45, -1.12, BZ1 + 0.21), "steel", verts=8)
    cyl(0.06, 0.05, (-1.45, -1.12, BZ1 + 0.445), "ink", verts=12)
    sphere(0.052, (-1.45, -1.12, BZ1 + 0.5), "beacon", segs=12, rings=6, scale=(1, 1, 1.25))
    for fy in (-0.95, 0.95):
        cyl(0.03, 0.2, (-0.78, fy, BZ1 + 0.1), "steel", verts=8)
        with frame((-0.74, fy, BZ1 + 0.26), rz=math.atan2(-fy, 1.8), ry=0.42):
            box((0.07, 0.30, 0.22), (0, 0, 0), "kitGraphite", bevel=0.008)
            box((0.006, 0.26, 0.18), (0.037, 0, 0), "lamp")
            for k in range(3):
                box((0.03, 0.26, 0.006), (-0.05, 0, -0.06 + k * 0.06), "kitGraphite")
            box((0.03, 0.34, 0.03), (0, 0, -0.14), "steelDark")

    tally("the thrust frame: embedded")
    # ---- the thrust frame: embedded back plate, box gussets, the front thrust plate on a bolted base plate ----
    box((0.02, 1.0, 1.12), (BX1 + 0.01, 0, Z + 0.59), "steelDark", bevel=0.004)          # embedded plate
    for yy in (-0.42, -0.14, 0.14, 0.42):
        box((0.29, 0.02, 1.1), (-0.405, yy, Z + 0.03 + 0.55), "steelDark", bevel=0.003)  # vertical gussets
    for zz in (Z + 0.06, Z + 1.12):
        box((0.29, 0.86, 0.02), (-0.405, 0, zz), "steelDark", bevel=0.003)               # stiffeners
    box((0.6, 1.0, 0.03), (-0.25, 0, Z + 0.015), "steelDark", bevel=0.004)              # base plate on the pad
    box((0.05, 0.9, 1.12), (-0.235, 0, Z + 0.03 + 0.56), "steelDark", bevel=0.005)    # front thrust plate
    for sy in (1, -1):                                                                    # side gussets
        plate([(-0.21, Z + 0.03), (0.03, Z + 0.03), (0.03, Z + 0.06), (-0.21, Z + 0.55)], (0, sy * 0.44 + 0.0125, 0),
              (1, 0, 0), (0, 0, 1), 0.025, "steelDark", bevel=0.003)
    for (bx, by) in ((-0.06, 0.3), (-0.06, -0.3), (-0.49, 0.28), (-0.49, -0.28)):
        bolt((bx, by, Z + 0.03), (0, 0, 1), "steel", r=0.019, washer=True, stud=0.025)                # anchor bolts
    for (yy, zz) in ((0.37, 0.38), (-0.37, 0.38), (0.37, 1.32), (-0.37, 1.32)):
        bolt((-0.21, yy, zz), (1, 0, 0), "steel", r=0.016)                               # plate to frame
    for k in range(6):
        a = math.pi / 6 + k * math.pi / 3
        bolt((-0.21, 0.24 * math.cos(a), AXIS_Z + 0.24 * math.sin(a)), (1, 0, 0), "steel", r=0.012)
    # the load cell stack: flexure, flange, cell, load button. Its face is the motor's forward end (motorMount)
    RX = (0, math.pi / 2, 0)
    cyl(0.03, 0.04, (-0.19, 0, AXIS_Z), "steel", rot=RX, verts=16)                     # flexure neck
    for xx in (-0.205, -0.178):
        cyl(0.075, 0.005, (xx, 0, AXIS_Z), "steel", rot=RX, verts=20)                  # flexure blades
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        bolt((-0.1755, 0.058 * math.cos(a), AXIS_Z + 0.058 * math.sin(a)), (1, 0, 0), "steel", r=0.006, washer=False)
    cyl(0.085, 0.015, (-0.1625, 0, AXIS_Z), "alu", rot=RX, verts=24, bevel=0.002)       # mounting flange
    for k in range(6):
        a = k * math.pi / 3
        disc((-0.155, 0.072 * math.cos(a), AXIS_Z + 0.072 * math.sin(a)), (1, 0, 0), 0.0065, "ink", 6, 0.001)
    cyl(0.062, 0.095, (-0.1075, 0, AXIS_Z), "alu", rot=RX, verts=32, bevel=0.003)     # the load cell
    tube([(-0.121, 0, AXIS_Z), (-0.089, 0, AXIS_Z)], 0.0628, "kitGraphite", sides=32, caps=False)  # label band
    cyl(0.038, 0.02, (MOUNT_X - 0.01, 0, AXIS_Z), "alu", rot=RX, verts=32, bevel=0.002)  # load button
    cyl(0.011, 0.008, (-0.08, -0.066, AXIS_Z), "steel", rot=(math.pi / 2, 0, 0), verts=6)   # cable gland
    cyl(0.008, 0.022, (-0.08, -0.081, AXIS_Z), "ink", rot=(math.pi / 2, 0, 0), verts=10)
    tube([(-0.08, -0.09, AXIS_Z), (-0.08, -0.16, AXIS_Z + 0.005), (-0.06, -0.30, AXIS_Z - 0.05),
          (-0.02, -0.47, AXIS_Z - 0.2), (0.04, -0.6, Z + 0.17), (0.07, -0.7, Z + 0.02), (0.0, -0.95, Z + 0.006),
          (-0.35, -1.35, Z + 0.006), (-0.66, -1.72, Z + 0.006), (-0.86, -1.98, Z + 0.07), (-0.85, -2.06, Z + 0.3),
          (-0.84, -2.08, Z + 0.42)], 0.0055, "rubber", sides=6, sub=2)
    # the pressure transducer on its stand-off bracket, its stainless line to the button's port, its cable
    box((0.01, 0.08, 0.1), (-0.205, -0.30, 1.02), "steelDark")
    box((0.23, 0.04, 0.008), (-0.095, -0.30, 1.07), "steelDark", bevel=0.002)
    box((0.03, 0.045, 0.035), (0.01, -0.30, 1.05), "steelDark", bevel=0.003)
    for zz in (0.995, 1.045):
        bolt((-0.2, -0.30, zz), (1, 0, 0), "steel", r=0.008, washer=False)
    cyl(0.0105, 0.10, (0.012, -0.30, 1.02), "alu", verts=16, bevel=0.002)
    cyl(0.013, 0.012, (0.012, -0.30, 0.965), "steel", verts=6)
    cyl(0.009, 0.022, (0.012, -0.30, 1.08), "ink", verts=10)
    tube([(0.012, -0.30, 0.958), (0.0, -0.28, 0.93), (-0.045, -0.19, 0.89), (-0.05, -0.09, 0.862),
          (-0.05, -0.04, AXIS_Z + 0.002)], 0.003, "alu", sides=6, sub=3)
    tube([(0.012, -0.30, 1.09), (0.0, -0.36, 1.16), (-0.15, -0.53, 1.1), (-0.25, -0.57, 0.8), (-0.32, -0.6, 0.4),
          (-0.36, -0.64, Z + 0.006), (-0.6, -1.2, Z + 0.006), (-0.82, -1.72, Z + 0.006), (-0.93, -1.98, Z + 0.07),
          (-0.9, -2.1, Z + 0.3), (-0.87, -2.12, Z + 0.42)], 0.0045, "rubber", sides=6, sub=2)

    tally("twin I-beam rails on welde")
    # ---- twin I-beam rails on welded pedestals with base plates and anchor bolts ----
    def ibeam_x(x0, x1, yc, zb, b=0.10, h=0.12, tf=0.009, tw=0.006, m="steel"):
        P = [(-b / 2, 0), (b / 2, 0), (b / 2, tf), (tw / 2, tf), (tw / 2, h - tf), (b / 2, h - tf), (b / 2, h),
             (-b / 2, h), (-b / 2, h - tf), (-tw / 2, h - tf), (-tw / 2, tf), (-b / 2, tf)]
        P = [(yc + a, zb + c) for a, c in P]
        return plate(P, (x0, 0, 0), (0, 1, 0), (0, 0, 1), x1 - x0, m)
    RY, RZB = 0.22, Z + 0.08
    for yy in (-RY, RY):
        densify(ibeam_x(0.15, 6.2, yy, RZB), 1.0)
    for xs in (0.3, 1.75, 3.2, 4.55, 5.85):
        for yy in (-RY, RY):
            box((0.24, 0.24, 0.02), (xs, yy, Z + 0.01), "steelDark")
            box((0.1, 0.1, 0.06), (xs, yy, Z + 0.05), "steelDark")
            for d in (-0.085, 0.085):
                bolt((xs + d, yy + d, Z + 0.02), (0, 0, 1), "steel", r=0.011)
            for dx, dy, lx, ly in ((0.051, 0, 0.006, 0.1), (-0.051, 0, 0.006, 0.1)):
                box((lx, ly, 0.008), (xs + dx, yy + dy, Z + 0.024), "steel")                # weld beads
        box((0.05, 2 * RY - 0.1, 0.05), (xs, 0, Z + 0.05), "steel")                       # cross tie
    tally("saddle supports: a cross b")
    # ---- saddle supports: a cross beam on the rails and a screw jack; tops at CRADLE_TOP ----
    for x in (0.5, 1.5, 2.6, 3.8):
        zt = RZB + 0.12
        box((0.07, 0.6, 0.05), (x, 0, zt + 0.025), "steelDark", bevel=0.004)
        for yy in (-RY - 0.035, RY + 0.035):
            bolt((x, yy, zt + 0.05), (0, 0, 1), "steel", r=0.008)
        for yy in (-RY, RY):
            box((0.07, 0.13, 0.008), (x, yy, RZB + 0.105), "steelDark")                    # clamp plates
        z = zt + 0.05
        box((0.1, 0.1, 0.012), (x, 0, z + 0.006), "steelDark", bevel=0.002)
        cyl(0.028, 0.045, (x, 0, z + 0.012 + 0.0225), "steelDark", verts=12)
        top = CRADLE_TOP
        cyl(0.012, top - 0.023 - (z + 0.057), (x, 0, (top - 0.023 + z + 0.057) / 2), "steel", verts=8)
        cyl(0.024, 0.014, (x, 0, z + 0.07), "steel", verts=6)
        cyl(0.02, 0.011, (x, 0, top - 0.0175), "steel", verts=10)
        box((0.08, 0.2, 0.012), (x, 0, top - 0.006), "steelDark", bevel=0.002)             # saddle plate
        for yy in (-0.094, 0.094):
            box((0.08, 0.012, 0.028), (x, yy, top + 0.012), "steelDark", bevel=0.002)
        empty("cradle%d" % int(x * 10), (x, 0, top))

    tally("the old range junction box")
    # ---- the old range junction box on the block, the startup's DAQ on its stand, conduit to the trench ----
    box((0.45, 0.18, 0.55), (-1.05, -BY - 0.09, Z + 1.0), "stateGreen", bevel=0.01)
    plate(rect(-0.2, -0.24, 0.2, 0.24), (-1.05, -BY - 0.18, Z + 1.0), (1, 0, 0), (0, 0, 1), 0.004, "stateGreen", bevel=0.002)
    for zz in (Z + 0.85, Z + 1.15):
        cyl(0.012, 0.06, (-1.26, -BY - 0.19, zz), "steel", verts=8)
    box((0.03, 0.03, 0.08), (-0.86, -BY - 0.195, Z + 1.0), "ink")
    plate(rect(0, 0, 0.12, 0.08), (-1.12, -BY - 0.184, Z + 1.12), (1, 0, 0), (0, 0, 1), 0.002, "stencil")
    tube([(-1.05, -BY - 0.09, Z + 0.72), (-1.05, -BY - 0.11, Z + 0.1), (-1.2, -BY - 0.12, Z + 0.03),
          (-1.42, -1.6, Z + 0.025), (-1.45, -2.45, Z + 0.025), (-1.45, -2.66, Z - 0.1)], 0.02, "steel", sides=8, sub=2)
    for k in range(3):
        box((0.06, 0.05, 0.01), (-1.05, -BY - 0.1, Z + 0.2 + k * 0.2), "steel")              # conduit saddles
    DX, DY = -1.05, -2.15
    for dx in (-0.17, 0.17):
        for dy in (-0.12, 0.12):
            box((0.03, 0.03, 0.35), (DX + dx, DY + dy, Z + 0.175), "steelDark")
    box((0.4, 0.3, 0.02), (DX, DY, Z + 0.36), "steelDark", bevel=0.003)
    box((0.45, 0.32, 0.22), (DX, DY, Z + 0.48), "kitGraphite", bevel=0.02)              # the DAQ case
    box((0.455, 0.325, 0.02), (DX, DY, Z + 0.53), "ink", bevel=0.004)                    # lid seam
    for dy in (-0.08, 0.08):
        box((0.02, 0.05, 0.05), (DX + 0.23, DY + dy, Z + 0.53), "cobalt", bevel=0.004)  # latches
    box((0.2, 0.03, 0.02), (DX, DY, Z + 0.605), "ink", bevel=0.006)                      # handle
    plate(rect(-0.12, -0.04, 0.12, 0.04), (DX, DY - 0.162, Z + 0.46), (1, 0, 0), (0, 0, 1), 0.002, "cobalt")
    cyl(0.006, 0.18, (DX - 0.15, DY + 0.1, Z + 0.68), "ink", verts=6)                    # telemetry antenna
    for k in range(3):
        cyl(0.012, 0.02, (DX + 0.225, DY - 0.09 + k * 0.05, Z + 0.43), "ink", rot=(0, math.pi / 2, 0), verts=8)
    tube([(DX - 0.1, DY - 0.16, Z + 0.4), (DX - 0.2, DY - 0.3, Z + 0.15), (-1.35, -2.5, Z + 0.02),
          (-1.42, -2.66, Z - 0.1)], 0.013, "rubber", sides=6, sub=2)                     # flexible conduit
    bag_wall((-0.3, -1.66), (-0.3, -2.56), 3, z0=Z, seed=3)                              # shields the DAQ
    bag_wall((-0.62, -2.98), (1.6, -2.98), 2, z0=0.0, seed=11)                            # low, under the window view
    bag_wall((-0.6, 2.98), (3.0, 2.98), 2, z0=0.0, seed=7)                               # low, under the side camera

    tally("the camera mast: a pole wi")
    # ---- the camera mast: a pole with a weatherproof housing aimed at the motor ----
    MX, MY, MH = -1.3, 3.15, 3.0
    box((0.5, 0.5, 0.15), (MX, MY, 0.075), "concrete", bevel=0.015)
    box((0.26, 0.26, 0.015), (MX, MY, 0.1575), "steel")
    for d in (-0.1, 0.1):
        bolt((MX + d, MY + d, 0.165), (0, 0, 1), "steel", r=0.01)
        bolt((MX + d, MY - d, 0.165), (0, 0, 1), "steel", r=0.01)
    cyl(0.038, MH, (MX, MY, 0.165 + MH / 2), "steel", verts=12)
    tube([(MX + 0.045, MY, 0.4), (MX + 0.045, MY, MH)], 0.006, "rubber", sides=6)
    box((0.14, 0.1, 0.2), (MX, MY - 0.07, 1.25), "kitGraphite", bevel=0.008)
    cyl(0.05, 0.05, (MX, MY, MH + 0.19), "steelDark", verts=12)
    yaw = math.atan2(0 - MY, 0.9 - MX)
    pitch = math.atan2(MH + 0.25 - AXIS_Z, math.hypot(0.9 - MX, MY))
    with frame((MX, MY, MH + 0.3), rz=yaw, ry=pitch):
        box((0.06, 0.06, 0.1), (0, 0, -0.06), "steelDark")
        box((0.32, 0.12, 0.12), (0.04, 0, 0.0), "white", bevel=0.01)
        box((0.38, 0.16, 0.006), (0.06, 0, 0.068), "white", bevel=0.002)
        box((0.004, 0.08, 0.08), (0.2, 0, 0), "glass")
        box((0.012, 0.11, 0.11), (-0.124, 0, 0), "kitGraphite")
        cyl(0.01, 0.03, (-0.14, 0, -0.02), "ink", rot=(0, math.pi / 2, 0), verts=8)

    tally("the firing line: an amber")
    # ---- the firing line: an amber cable on a reel, one end on the pad by the rails, the other to the trench ----
    RLX, RLY = 5.4, -3.6
    for sx in (-0.17, 0.17):
        rod((RLX + sx, RLY - 0.27, 0.02), (RLX + sx, RLY, 0.43), 0.013, "cobalt")
        rod((RLX + sx, RLY + 0.27, 0.02), (RLX + sx, RLY, 0.43), 0.013, "cobalt")
        rod((RLX + sx, RLY - 0.3, 0.02), (RLX + sx, RLY + 0.3, 0.02), 0.013, "cobalt")
    cyl(0.014, 0.42, (RLX, RLY, 0.43), "steel", rot=RX, verts=8)
    for sx in (-0.12, 0.12):
        cyl(0.24, 0.012, (RLX + sx, RLY, 0.43), "kitGraphite", rot=RX, verts=16)
    cyl(0.17, 0.23, (RLX, RLY, 0.43), "cableAmber", rot=RX, verts=16)
    rod((RLX + 0.13, RLY, 0.43), (RLX + 0.13, RLY + 0.14, 0.52), 0.008, "kitGraphite")
    cyl(0.012, 0.06, (RLX + 0.16, RLY + 0.14, 0.52), "ink", rot=RX, verts=8)
    tube([(RLX, RLY + 0.16, 0.32), (RLX - 0.15, RLY + 0.5, 0.01), (4.6, -2.8, 0.008), (4.25, -2.64, 0.1),
          (4.0, -2.5, Z + 0.006), (3.0, -1.4, Z + 0.006), (2.45, -0.72, Z + 0.006), (2.2, -0.42, Z + 0.006)],
         0.0055, "cableAmber", sides=5, sub=2)
    for dy, m in ((-0.012, "cableRed"), (0.012, "ink")):
        tube([(2.2, -0.42, Z + 0.006), (2.12, -0.36 + dy, Z + 0.005), (2.02, -0.33 + dy, Z + 0.005)], 0.0025, m, sides=4, sub=2)
        box((0.025, 0.01, 0.008), (2.0, -0.33 + dy, Z + 0.005), m)

    tally("the cable trench: kerbs an")
    # ---- the cable trench: kerbs and precast cover slabs, from the pad edge to the blockhouse's cable pit ----
    TA = Vector((-1.45, -2.75, 0))
    ca, sa = math.cos(BH_RZ), math.sin(BH_RZ)
    lx, ly = -6.15, -2.0
    TB = Vector((BH_POS[0] + lx * ca - ly * sa, BH_POS[1] + lx * sa + ly * ca, 0))
    d = TB - TA
    Lt = d.length
    with frame((TA.x, TA.y, 0), rz=math.atan2(d.y, d.x)):
        for yy in (-0.32, 0.32):
            densify(box((Lt, 0.1, 0.16), (Lt / 2, yy, 0.03), "concreteDark"), 3.0)
        x = 0.0
        k = 0
        while x < Lt - 0.05:
            ln = 0.98 if k < 6 else 3.98
            ln = min(ln, Lt - x - 0.02)
            o = box((ln, 0.6, 0.05), (x + ln / 2 + 0.01, 0, 0.1 + 0.025 - 0.01), "concrete",
                    bevel=0.008 if k < 6 else 0.0)
            if k >= 6:
                densify(o, 2.0)
            x += ln + 0.02
            k += 1
        tube([(2.3, 0.4, 0.007), (3.0, 0.42, 0.007)], 0.006, "cableAmber", sides=4)
    # the firing line's other end joins the trench
    p = TA + d.normalized() * 2.3 + Vector((d.y, -d.x, 0)).normalized() * 0.42
    tube([(RLX, RLY - 0.16, 0.32), (RLX - 0.2, RLY - 0.55, 0.008), (3.2, -4.75, 0.008), (0.6, -5.0, 0.008),
          (p.x, p.y, 0.008)], 0.0055, "cableAmber", sides=4, sub=2)

    tally("fire extinguisher on a pos")
    # ---- fire extinguisher on a post, a warning sign, a pallet, drums and a wooden cable drum ----
    EX, EY = -2.6, 2.75
    box((0.06, 0.06, 1.55), (EX, EY, 0.775), "stencil", bevel=0.005)
    box((0.3, 0.02, 0.3), (EX, EY - 0.04, 1.45), "stencil", bevel=0.004)
    plate(rect(-0.09, -0.09, 0.09, 0.09), (EX, EY - 0.05, 1.45), (1, 0, 0), (0, 0, 1), 0.002, "white")
    box((0.12, 0.08, 0.02), (EX, EY - 0.07, 0.48), "steelDark")
    lathe([(0.0, 0.49), (0.075, 0.49), (0.08, 0.51), (0.08, 0.93), (0.07, 0.98), (0.04, 1.0), (0.02, 1.01)], "stencil",
          verts=16, loc=(EX, EY - 0.12, 0), cap=True)
    GROUP[-1].data.update()
    keep_last = GROUP[-1]
    keep_last.data.materials.clear()
    keep_last.data.materials.append(MATS["stencil"])
    box((0.04, 0.04, 0.05), (EX, EY - 0.12, 1.03), "ink")
    box((0.1, 0.015, 0.012), (EX + 0.04, EY - 0.12, 1.06), "ink")
    plate(rect(-0.05, 0, 0.05, 0.14), (EX, EY - 0.2, 0.68), (1, 0, 0), (0, 0, 1), 0.003, "white")
    tube([(EX + 0.03, EY - 0.12, 1.02), (EX + 0.09, EY - 0.16, 0.95), (EX + 0.09, EY - 0.18, 0.7),
          (EX + 0.07, EY - 0.2, 0.62)], 0.007, "rubber", sides=6, sub=2)
    with frame((-4.6, -3.3, 0), rz=-0.9):
        for sx in (-0.42, 0.42):
            box((0.05, 0.05, 1.85), (sx, 0, 0.925), "steelDark")
        box((1.0, 0.025, 0.7), (0, -0.04, 1.45), "white", bevel=0.006)
        plate(rect(-0.5, 0.17, 0.5, 0.35), (0, -0.0535, 1.45), (1, 0, 0), (0, 0, 1), 0.002, "stencil")
        for k in range(3):
            plate(rect(-0.15, -0.05 - k * 0.09, 0.42, -0.01 - k * 0.09), (0, -0.0535, 1.45), (1, 0, 0), (0, 0, 1), 0.002, "ink")
        disc((-0.3, -0.0535, 1.37), (0, -1, 0), 0.12, "stencil", 16, 0.002)
        disc((-0.3, -0.0535, 1.37), (0, -1, 0), 0.085, "white", 16, 0.003)
    pallet(-4.3, 1.5, rz=0.15)
    drum(-4.55, 1.35, 0.122, "stateGreen")
    drum(-4.0, 1.7, 0.122, "rust")
    drum(-3.85, 0.7, 0.0, "cobalt", lying=True, rz=0.4)
    with frame((-4.9, -1.2, 0), rz=0.3):
        for sy in (-0.3, 0.3):
            cyl(0.5, 0.045, (0, sy, 0.5), "wood", rot=(math.pi / 2, 0, 0), verts=14)
        tube([(0, -0.28, 0.5), (0, 0.28, 0.5)], 0.36, "rubber", sides=14, caps=False)
        cyl(0.07, 0.7, (0, 0, 0.5), "steel", rot=(math.pi / 2, 0, 0), verts=6)

    tally("downrange: an earth berm f")
    # ---- downrange: an earth berm faced with a scorched concrete blast deflector (front at x = 11.2) ----
    F0, F1, CR = 11.2, 13.4, 3.0

    def berm_h(x, y):
        if x < F1:
            h = CR * (x - F0) / (F1 - F0)
        elif x < 14.4:
            h = CR + 0.1 * math.sin(x * 3.0)
        else:
            h = CR * (1 - smooth01((x - 14.4) / 4.2))
        h *= 1 - smooth01((abs(y) - 5.2) / 3.0)
        if not (x < F1 + 0.3 and abs(y) < 5.4):
            h += 0.08 * math.sin(1.3 * x + 0.7 * y) + 0.06 * math.sin(2.1 * y - 0.8 * x)
        return max(h, 0.0) - 0.06
    heightfield(grid(F0, 18.8, 0.9), grid(-8.4, 8.4, 0.9, (-5.2, 5.2)), berm_h, "earth",
                skip=lambda x, y: x < F1 - 0.2 and abs(y) < 4.9)
    sl = math.hypot(F1 - F0, CR)
    vd = ((F1 - F0) / sl, 0, CR / sl)
    plate(rect(0, -0.06, 10.4, sl + 0.02), (F0 - 0.04, 5.2, -0.06), (0, -1, 0), vd, 0.28, "concreteOld", bevel=0.03)
    box((0.9, 10.4, 0.3), (F1 + 0.3, 0, CR + 0.05), "concreteOld", bevel=0.03)
    nrm = Vector((0, -1, 0)).cross(Vector(vd))
    rnd = random.Random(41)
    def scorch(ru, rv, lift, m, ph, amp):                                                # a ragged plume mark on the face
        pts = []
        for k in range(26):
            a = 2 * math.pi * k / 26
            g = 1 + amp * math.sin(3 * a + ph) + 0.12 * math.sin(7 * a + 2 * ph) + 0.07 * math.sin(11 * a + 3 * ph)
            pts.append((5.2 + ru * g * math.cos(a), 1.2 + rv * g * math.sin(a) * (1.12 if math.sin(a) > 0 else 0.8)))
        plate(pts, Vector((F0 - 0.04, 5.2, -0.06)) + nrm * (0.28 + lift), (0, -1, 0), vd, 0.003, m)
    scorch(2.3, 1.1, 0.0, "concreteDark", 0.4, 0.06)                                     # a grey halo round
    scorch(1.25, 0.62, 0.004, "soot", 1.7, 0.2)                                          # a darker core
    for k in range(6):                                                              # lifting anchors along the crest
        cyl(0.03, 0.01, (F1 + 0.3, -4.5 + k * 1.8, CR + 0.2 + 0.005), "steel", verts=8)

    tally("the ground round the pad:")
    # ---- the ground round the pad: trodden apron, tyre ruts, salt crust ----
    apron(2.0, 0.0, 5.2, 2.6, [0.0, 0.35, 0.9, 1.9], 0.006, "worn", noise=0.55, seed=4, ns=6, nc=4)
    apron(13.0, 0.0, 1.5, 5.6, [0.0, 0.8, 2.0], 0.004, "salt", noise=0.6, seed=8, ns=3, nc=3)
    for (cx, cy, r, s) in ((7.5, 5.2, 1.6, 21), (-6.5, -5.5, 2.4, 22), (9.0, -6.0, 1.8, 23), (-7.0, 4.0, 1.4, 24)):
        blob(cx, cy, r, 0.003, "salt", seed=s)
    ruts([(-3.6, -0.6), (-6.5, -2.2), (-10.5, -5.0), (-15.0, -9.0), (-20.0, -15.5), (-24.5, -24.0), (-27.0, -32.0)])
    ruts([(-3.6, 1.0), (-6.0, 4.0), (-8.5, 11.0), (-10.5, 22.0)], gauge=1.5)


build_stand()
o = finish_group("stand", (0.0, PAD_T))
empty("motorMount", (MOUNT_X, 0, AXIS_Z))


# =====================================================================================================================
# The blockhouse: the old programme's concrete bunker, earth-banked, its slit window facing the stand.
# Built round its own origin (local -X faces the stand), then placed 40 m off to the side, looking at it side-on.
# =====================================================================================================================
def bh_height(x, y):
    """the earth banked round the bunker (body x -3.5..3.5, y -2.5..2.5): low under the window (-X), high at the back,
    a terrace on the door side (-Y) that the entrance steps go down from"""
    if abs(x) < 3.5 and abs(y) < 2.5:
        return 2.0

    def prof(d, H, R):
        return H * (1 - smooth01(d / R)) if d < R else 0.0

    def terrace(d):
        if d < 1.2:
            return 1.9 - 1.0 * smooth01(d / 1.2)
        if d < 4.2:
            return 0.9
        return 0.9 * (1 - smooth01((d - 4.2) / 2.4))
    out = []
    dl = max(0.0, abs(y) - 2.5)
    if x < -3.5:
        out.append(prof(math.hypot(-3.5 - x, dl), 1.0, 2.6))
    if x > 3.5:
        out.append(prof(math.hypot(x - 3.5, dl), 2.8, 3.6))
    dl = max(0.0, abs(x) - 3.5)
    taper = smooth01((x + 3.5) / 1.6)
    if y > 2.5:
        out.append(prof(math.hypot(y - 2.5, dl), 1.0 + 1.4 * taper, 3.2))
    if y < -2.5:
        d = math.hypot(-2.5 - y, dl)
        out.append(terrace(d) * (0.55 + 0.45 * taper) if d < 1.2 else terrace(d))
    h = max(out) if out else 0.0
    if h > 0.15:
        h += 0.06 * math.sin(1.7 * x + 0.3 * y) + 0.05 * math.sin(0.9 * y - 1.3 * x + 1.1) + 0.035 * math.sin(2.9 * x + 2.3 * y)
    return h - 0.06


def build_blockhouse():
    tally("body and slit")
    tally("body, the deep slit surrou")
    # body, the deep slit surround (sill, cheeks, brow), glass, steel lining, the shutter hanging open
    o = box((6.8, 5.0, 3.0), (0.1, 0, 1.5), "concreteOld", bevel=0.05)
    densify(nb(o), 1.3)                                   # mostly buried in the banking
    box((0.3, 3.8, 0.34), (-3.45, 0, 1.72), "concreteOld", bevel=0.03)
    for sy in (-1, 1):
        box((0.3, 0.3, 0.32), (-3.45, sy * 1.75, 2.05), "concreteOld", bevel=0.02)
    box((0.45, 4.2, 0.34), (-3.525, 0, 2.38), "concreteOld", bevel=0.03)
    box((0.02, 3.2, 0.32), (-3.31, 0, 2.05), "glass")
    for zz in (1.896, 2.204):
        box((0.3, 3.2, 0.012), (-3.45, 0, zz), "steelDark")
    for sy in (-1, 1):
        box((0.3, 0.012, 0.32), (-3.45, sy * 1.594, 2.05), "steelDark")
    box((0.03, 3.4, 0.42), (-3.625, 0, 1.33), "steelDark", bevel=0.005)
    for zz in (1.2, 1.42):
        box((0.015, 3.4, 0.04), (-3.647, 0, zz), "steelDark")
    for yy in (-1.2, 1.2):
        cyl(0.025, 0.25, (-3.63, yy, 1.565), "steel", rot=(math.pi / 2, 0, 0), verts=6)
    tally("roof slab, periscopes, ven")
    # roof slab, periscopes, vent stacks
    o = box((7.8, 5.8, 0.5), (0.0, 0, 3.25), "concreteOld", bevel=0.05)
    densify(o, 1.3)
    for yy in (-1.0, 1.0):
        cyl(0.13, 0.08, (-2.7, yy, 3.54), "steelDark", verts=8)
        cyl(0.07, 0.6, (-2.7, yy, 3.8), "steelDark", verts=8)
        box((0.26, 0.17, 0.2), (-2.72, yy, 4.17), "steelDark", bevel=0.01)
        box((0.01, 0.12, 0.08), (-2.855, yy, 4.19), "glass")
        box((0.08, 0.2, 0.02), (-2.86, yy, 4.28), "steelDark")
    for xx in (1.4, 2.4):
        cyl(0.14, 1.1, (xx, 1.6, 4.05), "rust", verts=8)
        cyl(0.26, 0.18, (xx, 1.6, 4.78), "rust", verts=8, r2=0.04)
        for k in range(0):
            a = k * 2 * math.pi / 3
            rod((xx + 0.13 * math.cos(a), 1.6 + 0.13 * math.sin(a), 4.58), (xx + 0.2 * math.cos(a), 1.6 + 0.2 * math.sin(a), 4.7), 0.01, "rust", 4)
    tally("antenna mast with guy wire")
    # antenna mast with guy wires to anchors
    AX, AY, AZ = 2.6, -1.6, 3.5
    box((0.3, 0.3, 0.02), (AX, AY, AZ + 0.01), "steel")
    cyl(0.05, 8.0, (AX, AY, AZ + 4.0), "steel", verts=8, r2=0.03)
    for zz, w in ((10.4, 1.4), (11.0, 1.0)):
        box((w, 0.03, 0.03), (AX, AY, zz), "steel")
        for sx in (-1, 1):
            rod((AX + sx * w / 2, AY, zz - 0.35), (AX + sx * w / 2, AY, zz + 0.35), 0.008, "steel", 4)
    rod((AX, AY, 11.5), (AX, AY, 12.6), 0.008, "steel", 4)
    sphere(0.07, (AX, AY, 11.56), "beacon", segs=8, rings=5)
    cyl(0.07, 0.06, (AX, AY, 9.2), "steel", verts=8)
    for a in (math.radians(30), math.radians(150), math.radians(270)):
        gx, gy = AX + 4.2 * math.cos(a), AY + 4.2 * math.sin(a)
        gz = 3.5 if (abs(gx) < 3.85 and abs(gy) < 2.85) else max(0.0, bh_height(gx, gy))
        box((0.2, 0.2, 0.1), (gx, gy, gz + 0.02), "concrete")
        rod((AX, AY, 9.2), (gx, gy, gz + 0.35), 0.006, "steel", 4)
        rod((gx, gy, gz + 0.07), (gx + (AX - gx) * 0.05, gy + (AY - gy) * 0.05, gz + 0.07 + (9.2 - gz) * 0.05), 0.012, "steel", 6)
    tally("the blast door on the -Y w")
    # the blast door on the -Y wall, down a flight of steps cut through the terrace
    DXc = -1.0
    box((1.4, 0.1, 2.3), (DXc, -2.55, 1.15), "steelDark", bevel=0.01)
    box((1.1, 0.1, 2.0), (DXc, -2.62, 1.02), "stateGreen", bevel=0.015)
    for zz in (0.35, 1.0, 1.65):
        cyl(0.045, 0.2, (DXc + 0.57, -2.66, zz), "steel", verts=8)
        box((0.25, 0.02, 0.07), (DXc + 0.44, -2.68, zz), "steel")
    with frame((DXc, -2.71, 1.1), rx=math.pi / 2):
        torus(0.2, 0.016, (0, 0, 0), "steel", major=14, minor=4)
        cyl(0.04, 0.06, (0, 0, 0), "steel", verts=8)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            rod((0.03 * math.cos(a), 0.03 * math.sin(a), 0), (0.19 * math.cos(a), 0.19 * math.sin(a), 0), 0.01, "steel", 6)
    for (dx, dz) in ((-0.52, 0.5), (-0.52, 1.6), (0.0, 1.98), (0.0, 0.06)):
        box((0.05, 0.04, 0.12) if dx else (0.12, 0.04, 0.05), (DXc + dx, -2.69, dz), "steel")
    plate(rect(0, 0, 1.6, 0.45), (DXc - 0.8, -2.5, 2.42), (1, 0, 0), (0, 0, 1), 0.004, "stateGreen")
    stencil("41", (DXc - 0.7, -2.507, 2.48), (1, 0, 0), (0, 0, 1), 0.34, t=0.003)
    for k in range(4):
        plate(rect(0, 0, 0.06 if k % 2 else 0.16, 0.05), (DXc + 0.05 + k * 0.17, -2.507, 2.6), (1, 0, 0), (0, 0, 1), 0.003, "stencil")
        plate(rect(0, 0, 0.05, 0.16), (DXc + 0.05 + k * 0.17, -2.507, 2.52), (1, 0, 0), (0, 0, 1), 0.003, "stencil")
    for x0 in (-1.75, 0.0):
        plate([(0, 0), (3.0, 0), (3.0, 1.05), (1.2, 1.05), (0, 2.1)], (x0, -2.5, -0.06), (0, -1, 0), (0, 0, 1), 0.25,
              "concrete", bevel=0.02)
    box((1.5, 0.8, 0.03), (DXc, -2.9, 0.015), "concrete")
    for k in range(1, 6):
        y0, y1 = -3.3 - 0.44 * k, -3.3 - 0.44 * (k - 1)
        box((1.5, y1 - y0, 0.15 * k + 0.06), (DXc, (y0 + y1) / 2, (0.15 * k - 0.06) / 2), "concrete")
    tube([(-0.32, -5.4, 0.75 + 0.9), (-0.32, -3.4, 0.9), (-0.32, -2.7, 0.9)], 0.02, "hazard", sides=6)
    for yy, zz in ((-5.2, 1.6), (-4.0, 1.18), (-2.9, 0.9)):
        rod((-0.32, yy, zz), (-0.25, yy, zz), 0.012, "hazard")
    tally("the earth banking and the")
    # the earth banking and the cable pit where the trench from Stand 3 ends
    heightfield(grid(-6.4, 7.6, 0.95, (-2.0, 0.0, -3.5, 3.5)), grid(-9.4, 6.4, 0.95, (-5.5, -2.5, 2.5)), bh_height, "earth",
                skip=lambda x, y: (abs(x) < 3.45 and abs(y) < 2.45) or (-2.0 < x < 0.0 and -5.5 < y < -2.5))
    box((0.8, 0.8, 0.14), (-6.5, -2.0, 0.07), "concrete", bevel=0.02)
    box((0.6, 0.6, 0.02), (-6.5, -2.0, 0.15), "steelDark")


build_blockhouse()
o = finish_group("blockhouse")
place(o, (BH_POS[0], BH_POS[1], 0), rz=BH_RZ)


# =====================================================================================================================
# The launch pad for flight jobs: slab pad, blast plate, the rail on a braced mast, controller, crate. 70 m off.
# The rocket hangs on the rail's -X face (stand3d.js), so that side stays clear.
# =====================================================================================================================
def build_launchpad():
    tally("slabs and plate")
    g = 0.014
    for xa, xb in ((-2.5, 0.0), (0.0, 2.5)):
        for ya, yb in ((-2.5, 0.0), (0.0, 2.5)):
            o = box((xb - xa - g, yb - ya - g, LP_T), ((xa + xb) / 2, (ya + yb) / 2, LP_T / 2), "concrete", bevel=0.012)
            densify(nb(o), 1.0)
    plate(rect(-2.5, -2.5, 2.5, 2.5), (0, 0, LP_T - 0.03), (1, 0, 0), (0, 1, 0), 0.01, "sealant")
    sc = [(-0.15 + 1.25 * math.cos(a) * (1 + 0.2 * math.sin(3 * a)), 1.05 * math.sin(a) * (1 + 0.15 * math.sin(5 * a + 1)))
          for a in [2 * math.pi * k / 16 for k in range(16)]]
    plate(sc, (0, 0, LP_T), (1, 0, 0), (0, 1, 0), 0.002, "soot")
    box((0.9, 0.9, 0.04), (-0.15, 0, LP_T + 0.02), "steel", bevel=0.004)          # blast plate, top at 0.24
    for dx in (-0.53, 0.23):
        for dy in (-0.38, 0.38):
            disc((dx, dy, LP_T + 0.04), (0, 0, 1), 0.014, "steelDark", 6)
    chevrons((-2.3, -2.42, LP_T), (1, 0, 0), (0, 1, 0), 4.6, 0.14, 0.17, t=0.002)
    tally("the rail: a 1010-style slo")
    # the rail: a 1010-style slotted extrusion, foot on the blast plate at railBase
    a, s, dd = 0.0127, 0.0032, 0.006
    P = [(-a, -a), (-s, -a), (-s, -a + dd), (s, -a + dd), (s, -a), (a, -a), (a, -s), (a - dd, -s), (a - dd, s), (a, s),
         (a, a), (s, a), (s, a - dd), (-s, a - dd), (-s, a), (-a, a), (-a, s), (-a + dd, s), (-a + dd, -s), (-a, -s)]
    densify(prism(P, 3.2, LP_T + 0.04, "alu"), 0.8)
    box((0.026, 0.026, 0.006), (0, 0, LP_T + 0.04 + 3.203), "ink")
    box((0.04, 0.05, 0.08), (0.033, 0, LP_T + 0.08), "cobalt", bevel=0.003)
    for dy in (-0.03, 0.03):
        bolt((0.04, dy, LP_T + 0.04), (0, 0, 1), "steel", r=0.007)
    tally("the mast on a square base")
    # the mast on a square base frame, braces, stand-off arms to the rail
    MXp = 0.45
    for (cx, cy, lx, ly) in ((0.8, -0.45, 0.95, 0.05), (0.8, 0.45, 0.95, 0.05), (0.35, 0, 0.05, 0.95),
                             (1.25, 0, 0.05, 0.95), (MXp, 0, 0.05, 0.85)):
        box((lx, ly, 0.05), (cx, cy, LP_T + 0.025), "kitGraphite")
    box((0.06, 0.06, 2.75), (MXp, 0, LP_T + 0.05 + 1.375), "kitGraphite", bevel=0.004)
    for p in ((1.25, -0.45), (1.25, 0.45)):
        rod((p[0], p[1], LP_T + 0.05), (MXp + 0.03, 0, 1.35), 0.012, "kitGraphite")
    for sy in (-1, 1):
        rod((MXp, sy * 0.45, LP_T + 0.05), (MXp, sy * 0.03, 1.15), 0.012, "kitGraphite")
    for zz in (0.95, 1.95, 2.9):
        box((0.39, 0.02, 0.03), (0.035 + 0.195, 0, zz), "kitGraphite")
        box((0.025, 0.045, 0.06), (0.025, 0, zz), "cobalt", bevel=0.003)
        for sy in (-1, 1):
            bolt((0.025, sy * 0.0225, zz), (0, sy, 0), "steel", r=0.005, washer=False)
    for (bx, by) in ((0.35, -0.45), (0.35, 0.45), (1.25, -0.45), (1.25, 0.45)):
        bolt((bx, by, LP_T + 0.05), (0, 0, 1), "steel", r=0.012, stud=0.015)
    tally("blast shield at the mast f")
    # blast shield at the mast foot, the igniter junction and clip leads
    box((0.46, 0.6, 0.008), (0.25, 0, LP_T + 0.24), "steel", rot=(0, -0.97, 0), bevel=0.002)
    for sy in (-0.28, 0.28):
        rod((0.38, sy, LP_T + 0.44), (MXp - 0.03, sy * 0.1, LP_T + 0.5), 0.008, "steel")
    box((0.08, 0.06, 0.1), (MXp, -0.06, 0.55), "cobalt", bevel=0.005)
    for dy, m in ((-0.012, "cableRed"), (0.012, "ink")):
        tube([(MXp - 0.02, -0.08 + dy, 0.5), (0.32, -0.12 + dy, LP_T + 0.045), (0.05, -0.08 + dy, LP_T + 0.045),
              (-0.06, -0.03 + dy, LP_T + 0.048), (-0.085, dy, LP_T + 0.055)], 0.0022, m, sides=4, sub=2)
        box((0.02, 0.008, 0.008), (-0.09, dy, LP_T + 0.055), m)
    tally("the startup's cobalt launc")
    # the startup's cobalt launch controller on a tripod, its firing line to the junction
    CX, CY = 1.8, -3.4
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.3
        rod((CX + 0.3 * math.cos(a), CY + 0.3 * math.sin(a), 0), (CX, CY, 0.75), 0.011, "kitGraphite")
    box((0.3, 0.22, 0.012), (CX, CY, 0.762), "kitGraphite")
    box((0.32, 0.24, 0.12), (CX, CY, 0.83), "cobalt", bevel=0.012, segs=2)
    plate(rect(-0.14, -0.1, 0.14, 0.1), (CX, CY, 0.89), (1, 0, 0), (0, 1, 0), 0.003, "kitGraphite")
    with frame((CX, CY + 0.12, 0.89), rx=-0.25):
        box((0.32, 0.012, 0.24), (0, 0.0, 0.12), "cobalt", bevel=0.004)
    cyl(0.012, 0.02, (CX - 0.07, CY - 0.04, 0.9), "alu", verts=8)
    cyl(0.016, 0.014, (CX + 0.06, CY - 0.04, 0.9), "stencil", verts=12)
    cyl(0.009, 0.01, (CX + 0.06, CY + 0.04, 0.9), "strobe", verts=8)
    cyl(0.02, 0.03, (CX + 0.12, CY + 0.08, 0.905), "ink", verts=8)
    sphere(0.022, (CX + 0.12, CY + 0.08, 0.93), "strobe", segs=8, rings=4)
    rod((CX - 0.13, CY + 0.09, 0.89), (CX - 0.13, CY + 0.09, 1.15), 0.004, "ink", 4)
    tube([(CX, CY + 0.12, 0.8), (CX - 0.05, CY + 0.4, 0.3), (1.6, -2.7, 0.006), (1.4, -2.5, LP_T + 0.006),
          (0.8, -1.0, LP_T + 0.006), (0.55, -0.3, LP_T + 0.006), (MXp + 0.035, -0.1, 0.35), (MXp + 0.035, -0.08, 0.5)],
         0.005, "cableAmber", sides=5, sub=2)
    tally("a crate under a tied-down")
    # a crate under a tied-down tarp
    TX, TY = -1.6, 1.7
    for sy in (-0.25, 0.25):
        box((1.12, 0.08, 0.06), (TX, TY + sy, LP_T + 0.03), "wood")
    rnd = random.Random(12)
    nu, nv = 10, 5
    V = []
    for k in range(nv + 1):
        b = -math.pi / 2 + math.pi * k / nv
        for j in range(nu):
            aa = 2 * math.pi * j / nu

            def sp(x, e):
                return math.copysign(abs(x) ** e, x)
            x = 0.54 * sp(math.cos(b), 0.22) * sp(math.cos(aa), 0.22)
            y = 0.39 * sp(math.cos(b), 0.22) * sp(math.sin(aa), 0.22)
            z = 0.33 * sp(math.sin(b), 0.22)
            fl = 1.0 + (0.08 if z < -0.22 else 0.0) + 0.025 * math.sin(5 * aa + 3 * b)
            V.append(Vector((TX + x * fl, TY + y * fl, LP_T + 0.33 + max(z, -0.32) + 0.015 * math.sin(7 * aa) * (z > 0.25))))
    F = []
    for k in range(nv):
        for j in range(nu):
            a0, a1 = k * nu + j, k * nu + (j + 1) % nu
            F.append([a0, a1, a1 + nu, a0 + nu])
    F.append([nv * nu + j for j in range(nu)])
    mk("tarp", V, F, "tarp", recalc=True)
    for sx in (-0.25, 0.25):
        tube([(TX + sx, TY - 0.43, LP_T + 0.02), (TX + sx, TY - 0.42, LP_T + 0.55), (TX + sx, TY - 0.34, LP_T + 0.67),
              (TX + sx, TY + 0.34, LP_T + 0.67), (TX + sx, TY + 0.42, LP_T + 0.55), (TX + sx, TY + 0.43, LP_T + 0.02)],
             0.007, "ink", sides=4, sub=2)
    tally("a windsock, off the pad's downrange side")
    # a windsock 6 m off the pad, placed (by angle from both) clear of the pad camera's frame and well to one side of the
    # chase camera's line to the rocket, so it never stands in front of the rocket
    WX, WY = 5.9, -1.0
    box((0.3, 0.3, 0.1), (WX, WY, 0.05), "concrete", bevel=0.01)
    cyl(0.03, 4.4, (WX, WY, 2.25), "steel", verts=8)
    with frame((WX, WY, 4.4), rz=math.atan2(-0.6, 0.8), ry=0.3):
        torus(0.19, 0.008, (0.0, 0, 0), "steel", rot=(0, math.pi / 2, 0), major=8, minor=3)
        for k in range(4):
            r0, r1 = 0.19 - 0.03 * k, 0.19 - 0.03 * (k + 1)
            cyl(r0, 0.34, (0.17 + 0.34 * k, 0, 0), "stencil" if k % 2 == 0 else "white", rot=(0, math.pi / 2, 0), verts=6, r2=r1)
    apron(0, 0, 2.5, 2.5, [0.0, 0.35, 0.9, 1.8], 0.006, "worn", noise=0.5, seed=14)


build_launchpad()
o = finish_group("launchpad", (0.0, LP_T))
place(o, (LP[0], LP[1], 0))
empty("railBase", (LP[0], LP[1], LP_T + 0.04))


# =====================================================================================================================
# The startup's workshop: a cobalt 20 ft container with real corrugation, door bars, a cut-in door and window and an
# awning over a workbench; a generator and drums beside it.
# =====================================================================================================================
def corrugated(o, u, v, length, height, depth=0.036, pitch=0.278, m="cobalt"):
    """a corrugated wall: the trapezoid profile runs along u, crests stand out along v, extruded up (u x v = up)"""
    n = max(1, int(round(length / pitch)))
    p = length / n
    w1, s = p * 0.24, p * 0.16           # slopes shallower than 45 degrees keep one UV axis (no seams)
    line = []
    for k in range(n):
        x = k * p
        line += [(x, depth), (x + w1, depth), (x + w1 + s, 0.0), (x + p - s, 0.0)]
    line.append((length, depth))
    pts = [(0, -0.02), (length, -0.02)] + line[::-1]
    return plate(pts, o, u, v, height, m, caps=False)


def build_workshop():
    tally("container")
    L, W, H = 6.058, 2.438, 2.591
    hx, hy = L / 2, W / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            box((0.16, 0.16, H), (sx * (hx - 0.08), sy * (hy - 0.08), H / 2), "cobalt")
            for zz in (0.06, H - 0.06):
                box((0.18, 0.17, 0.12), (sx * (hx - 0.09), sy * (hy - 0.085), zz), "steelDark")
    for sy in (-1, 1):
        box((L - 0.36, 0.16, 0.18), (0, sy * (hy - 0.08), 0.09), "cobalt")
        box((L - 0.36, 0.12, 0.12), (0, sy * (hy - 0.06), H - 0.06), "cobalt")
    for sx in (-1, 1):
        box((0.16, W - 0.34, 0.2), (sx * (hx - 0.08), 0, 0.1), "cobalt")
        box((0.16, W - 0.34, 0.16), (sx * (hx - 0.08), 0, H - 0.08), "cobalt")
    hz = H - 0.32
    corrugated((-hx + 0.16, hy - 0.08, 0.18), (1, 0, 0), (0, 1, 0), L - 0.32, hz)
    corrugated((hx - 0.16, -hy + 0.08, 0.18), (-1, 0, 0), (0, -1, 0), L - 0.32, hz)
    corrugated((-hx + 0.08, -hy + 0.16, 0.18), (0, 1, 0), (-1, 0, 0), W - 0.32, hz)
    o = box((L - 0.1, W - 0.1, 0.06), (0, 0, H - 0.03), "cobalt")
    densify(o, 2.0)
    tally("the doors (+X end): two co")
    # the doors (+X end): two corrugated leaves in frames, four locking bars with keepers and handles
    lw = (W - 0.32) / 2
    for k in range(2):
        y0 = hy - 0.16 - k * lw
        corrugated((hx - 0.1, y0, 0.2), (0, -1, 0), (1, 0, 0), lw, H - 0.4, depth=0.022, pitch=lw / 4)
        for (cy, cz, ly, lz) in ((y0 - lw / 2, 0.22, lw, 0.08), (y0 - lw / 2, H - 0.22, lw, 0.08),
                                 (y0 - 0.04, H / 2, 0.08, H - 0.36), (y0 - lw + 0.04, H / 2, 0.08, H - 0.36)):
            box((0.04, ly, lz), (hx - 0.06, cy, cz), "cobalt")
        for f in (0.25, 0.75):
            yb = y0 - lw * f
            cyl(0.014, H - 0.3, (hx - 0.01, yb, H / 2), "steel", verts=8)
            for zz in (0.18, H - 0.18):
                box((0.05, 0.06, 0.06), (hx - 0.02, yb, zz), "steel")
            box((0.025, 0.035, 0.32), (hx + 0.005, yb - 0.04, 1.15), "steel")
        plate(rect(0.2, 1.7, lw - 0.2, 2.0), (hx - 0.03, y0, 0), (0, -1, 0), (0, 0, 1), 0.01, "white")
    tally("a cut-in door and a barred")
    # a cut-in door and a barred window on the +Y side, under an awning, with a workbench
    box((1.0, 0.04, 2.12), (-1.7, hy + 0.0, 1.18), "kitGraphite")
    box((0.86, 0.05, 1.98), (-1.7, hy + 0.01, 1.16), "kitGraphite")
    box((0.12, 0.04, 0.03), (-1.38, hy + 0.05, 1.1), "steel")
    box((1.12, 0.04, 0.72), (0.6, hy, 1.62), "kitGraphite")
    box((1.0, 0.045, 0.6), (0.6, hy + 0.002, 1.62), "glass")
    for k in range(5):
        cyl(0.009, 0.62, (0.2 + k * 0.2, hy + 0.05, 1.62), "steel", verts=4)
    box((3.4, 1.7, 0.025), (-0.55, hy + 0.85, 2.36), "tarp", rot=(-0.13, 0, 0))
    box((3.4, 0.03, 0.06), (-0.55, hy + 1.69, 2.25), "steel")
    for xx in (-2.2, 1.1):
        rod((xx, hy + 1.68, 0.0), (xx, hy + 1.68, 2.25), 0.022, "steel", 6)
        rod((xx, hy + 0.02, 1.9), (xx, hy + 1.0, 2.3), 0.012, "steel")
        tube([(xx, hy + 1.68, 2.2), (xx + (0.4 if xx > 0 else -0.4), hy + 2.5, 0.02)], 0.004, "ink", sides=4)
        box((0.03, 0.03, 0.12), (xx + (0.4 if xx > 0 else -0.4), hy + 2.5, 0.04), "steel")
    box((1.6, 0.6, 0.05), (0.55, hy + 0.42, 0.905), "wood")
    for dx in (-0.75, 0.75):
        for dy in (-0.26, 0.26):
            box((0.04, 0.04, 0.88), (0.55 + dx, hy + 0.42 + dy, 0.44), "steelDark")
    box((1.5, 0.5, 0.02), (0.55, hy + 0.42, 0.18), "steelDark")
    box((0.14, 0.1, 0.1), (1.15, hy + 0.2, 0.98), "cobalt")
    box((0.3, 0.2, 0.15), (0.2, hy + 0.45, 1.005), "kitGraphite")
    cyl(0.17, 0.04, (-0.6, hy + 0.9, 0.62), "wood", verts=8)
    for k in range(3):
        a = k * 2 * math.pi / 3
        rod((-0.6 + 0.16 * math.cos(a), hy + 0.9 + 0.16 * math.sin(a), 0), (-0.6 + 0.1 * math.cos(a), hy + 0.9 + 0.1 * math.sin(a), 0.6), 0.012, "steelDark", 4)
    tally("generator and drums")
    # generator and drums
    with frame((-4.3, 0.6, 0), rz=0.2):
        for sy in (-0.3, 0.3):
            box((1.2, 0.08, 0.1), (0, sy, 0.05), "steelDark")
        box((1.1, 0.7, 0.75), (0, 0, 0.475), "kitGraphite", bevel=0.03)
        plate(rect(-0.4, -0.2, 0.1, 0.2), (0, -0.351, 0.5), (1, 0, 0), (0, 0, 1), 0.004, "ink")
        cyl(0.03, 0.4, (0.4, 0.2, 1.0), "steel", verts=8)
        box((0.15, 0.04, 0.06), (-0.3, -0.36, 0.7), "hazard")
    drum(3.9, -1.5, 0, "stateGreen")
    apron(0, 0, hx, hy, [0.0, 0.4, 1.1, 2.4], 0.006, "worn", noise=0.6, seed=31, ns=3, nc=3)


build_workshop()
o = finish_group("workshop")
place(o, (-30, -42, 0), rz=math.radians(-10))


# =====================================================================================================================
# The old water tower: lattice legs with girts and cross braces, the tank with a balcony, a ladder.
# =====================================================================================================================
def build_watertower():
    TOP = 9.2
    legs = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        legs.append(((2.4 * math.cos(a), 2.4 * math.sin(a)), (1.55 * math.cos(a), 1.55 * math.sin(a))))

    def at(k, z):
        (x0, y0), (x1, y1) = legs[k]
        f = z / TOP
        return (x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z)
    for k in range(4):
        box((0.6, 0.6, 0.4), (legs[k][0][0], legs[k][0][1], 0.15), "concreteOld")
        rod(at(k, 0.3), at(k, TOP), 0.1, "rust", 6)
    lv = [0.3, 3.3, 6.3, TOP - 0.1]
    for z in lv[1:]:
        for k in range(4):
            rod(at(k, z), at((k + 1) % 4, z), 0.045, "rust", 5)
    for i in range(3):
        for k in range(4):
            rod(at(k, lv[i]), at((k + 1) % 4, lv[i + 1]), 0.022, "rust", 3)
            rod(at((k + 1) % 4, lv[i]), at(k, lv[i + 1]), 0.022, "rust", 3)
    cyl(0.2, TOP, (0, 0, TOP / 2), "rust", verts=6)
    cyl(2.5, 0.08, (0, 0, TOP + 0.04), "steelDark", verts=16)
    tube([(0, 0, TOP + 0.08), (0, 0, TOP + 3.08)], 2.0, "stateGreen", sides=16, caps=False)
    for zz in (TOP + 1.1, TOP + 2.1):
        tube([(0, 0, zz - 0.02), (0, 0, zz + 0.02)], 2.015, "stateGreen", sides=16, caps=False)
    cyl(2.1, 0.9, (0, 0, TOP + 3.08 + 0.45), "stateGreen", verts=16, r2=0.25)
    cyl(0.12, 0.3, (0, 0, TOP + 4.1), "stateGreen", verts=6)
    torus(2.45, 0.02, (0, 0, TOP + 1.05), "steel", major=16, minor=3)
    for k in range(6):
        a = k * math.pi / 3
        rod((2.45 * math.cos(a), 2.45 * math.sin(a), TOP + 0.08), (2.45 * math.cos(a), 2.45 * math.sin(a), TOP + 1.05), 0.018, "steel", 3)
    for sx in (-0.22, 0.22):
        rod((2.62, sx, 0), (2.62, sx, TOP + 1.0), 0.02, "steel", 3)
    for k in range(12):
        z = 0.6 + k * 0.75
        rod((2.62, -0.22, z), (2.62, 0.22, z), 0.012, "steel", 3)
    for k in range(4):
        z = 2.0 + k * 2.0
        rod((2.62, 0, z), (at(0, z)[0], at(0, z)[1] * 0.0, z), 0.015, "steel", 3)
    apron(0, 0, 2.4, 2.4, [0.0, 0.8, 2.0], 0.006, "worn", noise=0.5, seed=41, ns=2, nc=3)


build_watertower()
o = finish_group("watertower")
place(o, (-70, 18, 0))


# =====================================================================================================================
# Floodlight masts: a tapered pole on a bolted base, a head frame with lamp heads aimed at what they light.
# =====================================================================================================================
def build_flood(k, x, y, aim):
    box((0.8, 0.8, 0.3), (0, 0, 0.1), "concrete")
    box((0.42, 0.42, 0.025), (0, 0, 0.2625), "steel")
    for d in (-0.16, 0.16):
        bolt((d, d, 0.275), (0, 0, 1), "steel", r=0.018)
        bolt((d, -d, 0.275), (0, 0, 1), "steel", r=0.018)
    cyl(0.14, 11.0, (0, 0, 0.275 + 5.5), "steel", verts=8, r2=0.075)
    box((0.3, 0.18, 0.4), (0, -0.18, 1.4), "stateGreen")
    box((1.8, 0.08, 0.08), (0, 0, 11.1), "steel")
    box((1.8, 0.08, 0.08), (0, 0, 11.7), "steel")
    for sx in (-0.85, 0.85):
        box((0.08, 0.08, 0.68), (sx, 0, 11.4), "steel")
    for (lx, lz) in ((-0.55, 11.4), (0.0, 11.4), (0.55, 11.4), (-0.28, 11.9), (0.28, 11.9)):
        with frame((lx, 0.12, lz), rz=math.pi / 2, ry=0.42):
            box((0.12, 0.42, 0.34), (0, 0, 0), "steelDark")
            box((0.006, 0.36, 0.28), (0.063, 0, 0), "lamp")
            box((0.12, 0.04, 0.04), (-0.07, 0, -0.17), "steel")
    o = finish_group("flood%d" % k)
    place(o, (x, y, 0), rz=math.atan2(aim[0] - x, -(aim[1] - y)) + math.pi)
    return o


for k, (x, y, aim) in enumerate(((-6.0, -8.0, (1.5, 0)), (9.0, 8.0, (1.5, 0)), (-26.0, 64.0, LP))):
    build_flood(k, x, y, aim)


# =====================================================================================================================
# The old radar: a dish on a yoke on a concrete plinth, with a lattice back structure and a feed on struts.
# =====================================================================================================================
def build_radar():
    box((2.4, 2.4, 1.2), (0, 0, 0.6), "concreteOld", bevel=0.04)
    for sx in (-1, 1):
        box((0.5, 0.3, 0.6), (sx * 0.9, -1.35, 0.3), "concreteOld")
    cyl(0.6, 0.25, (0, 0, 1.325), "stateGreen", verts=12)
    cyl(0.35, 0.9, (0, 0, 1.9), "stateGreen", verts=8)
    for sy in (-1, 1):
        box((0.3, 0.12, 1.4), (0, sy * 0.95, 2.9), "stateGreen")
    box((0.4, 2.0, 0.2), (0, 0, 2.3), "stateGreen")
    R, D = 2.3, 0.75
    with frame((0, 0, 3.4), ry=-math.radians(55)):
        prof = [(R * k / 4, D * (k / 4) ** 2) for k in range(5)]
        prof = prof + [(R, D - 0.05)] + [(R * (4 - k) / 4, D * ((4 - k) / 4) ** 2 - 0.05) for k in range(1, 5)]
        lathe(prof, "rust", verts=16, cap=False)
        for k in range(8):
            a = k * math.pi / 4
            rod((0.25 * math.cos(a), 0.25 * math.sin(a), -0.35), (R * 0.95 * math.cos(a), R * 0.95 * math.sin(a), D * 0.9 - 0.06), 0.03, "stateGreen", 3)
            rod((0.25 * math.cos(a), 0.25 * math.sin(a), -0.35), (R * 0.5 * math.cos(a), R * 0.5 * math.sin(a), D * 0.25 - 0.06), 0.025, "stateGreen", 3)
        torus(R * 0.5, 0.025, (0, 0, D * 0.25 - 0.08), "stateGreen", major=12, minor=3)
        cyl(0.3, 0.4, (0, 0, -0.25), "stateGreen", verts=8)
        cyl(0.14, 1.95, (0, 0, -0.25), "stateGreen", rot=(math.pi / 2, 0, 0), verts=8)
        for k in range(3):
            a = k * 2 * math.pi / 3
            rod((R * 0.8 * math.cos(a), R * 0.8 * math.sin(a), D * 0.64), (0, 0, 1.55), 0.02, "steel", 4)
        cyl(0.1, 0.3, (0, 0, 1.6), "steelDark", verts=8, r2=0.05)
    apron(0, 0, 1.2, 1.2, [0.0, 0.7, 1.8], 0.006, "worn", noise=0.5, seed=51, ns=2, nc=3)


build_radar()
o = finish_group("radar")
place(o, (55, -40, 0), rz=math.radians(25))


# =====================================================================================================================
# The range fence: old concrete posts with cranked tops and wire strands, along the south and west edges.
# =====================================================================================================================
def build_fence():
    rnd = random.Random(61)
    runs = [((-90.0, -75.0), (98.0, -75.0), (0, -1)), ((-90.0, -75.0), (-90.0, 63.0), (-1, 0))]
    for (a, b, out) in runs:
        a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
        d = b - a
        n = int(d.length / 16)
        o = Vector((out[0], out[1], 0))
        for i in range(n + 1):
            p = a + d * (i / n)
            lean = rnd.uniform(-0.05, 0.05)
            with frame((p.x, p.y, 0), rz=math.atan2(d.y, d.x), rx=lean):
                box((0.12, 0.12, 2.0), (0, 0, 1.0), "concreteOld")
            with frame(M=Matrix.Translation(Vector((p.x, p.y, 2.0))) @ Vector((0, 0, 1)).rotation_difference(
                    (o + Vector((0, 0, 1))).normalized()).to_matrix().to_4x4()):
                box((0.1, 0.1, 0.5), (0, 0, 0.22), "concreteOld")
        for z in (0.5, 1.05, 1.6):
            rod((a.x, a.y, z), (b.x, b.y, z), 0.006, "steelDark", 3)
        for f in (0.18, 0.36):
            q = o * f + Vector((0, 0, 2.0 + f))
            rod(a + q, b + q, 0.006, "steelDark", 3)


build_fence()
finish_group("fence")


# =====================================================================================================================
# A weathered portacabin (the old range office), and range clutter: pallets, drums, road blocks, marker posts, tracks.
# =====================================================================================================================
def build_portacabin():
    for sy in (-0.95, 0.95):
        box((6.2, 0.12, 0.3), (0, sy, 0.15), "steelDark")
    o = box((6.0, 2.4, 2.4), (0, 0, 1.5), "white", bevel=0.03)
    densify(o, 1.6)
    box((6.02, 2.42, 0.2), (0, 0, 0.4), "stateGreen")
    box((6.1, 2.5, 0.08), (0, 0, 2.74), "white", bevel=0.01)
    for sy in (-1, 1):
        for k in range(6):
            box((0.04, 0.02, 2.36), (-2.5 + k * 1.0, sy * 1.21, 1.5), "white")
    for xx in (-1.8, 1.6):
        box((1.0, 0.04, 0.8), (xx, -1.215, 1.75), "steelDark")
        box((0.9, 0.045, 0.7), (xx, -1.217, 1.75), "glass")
        for k in range(3):
            cyl(0.008, 0.7, (xx - 0.3 + k * 0.3, -1.25, 1.75), "steel", verts=4)
    box((0.9, 0.05, 2.0), (0.0, -1.22, 1.32), "stateGreen", bevel=0.005)
    box((0.12, 0.03, 0.03), (0.3, -1.255, 1.3), "steel")
    for k in range(3):
        box((1.0, 0.28, 0.04), (0.0, -1.38 - k * 0.28, 0.28 - k * 0.1), "steel")
    for sx in (-0.5, 0.5):
        box((0.04, 0.84, 0.04), (sx, -1.66, 0.16), "steel", rot=(0.4, 0, 0))
    box((0.35, 0.6, 0.5), (3.18, 0.3, 1.9), "white", bevel=0.02)
    disc((3.355, 0.3, 1.9), (1, 0, 0), 0.2, "ink", 10)
    rod((2.95, 1.22, 2.7), (2.95, 1.22, 0.3), 0.04, "steelDark", 6)
    apron(0, 0, 3.0, 1.2, [0.0, 0.5, 1.6], 0.006, "worn", noise=0.5, seed=71, ns=3, nc=3)


build_portacabin()
o = finish_group("portacabin")
place(o, (-39, -31, 0), rz=math.radians(28))


def build_clutter():
    pallet(-25.5, -36.5, rz=0.3)
    pallet(-25.0, -35.0, z=0.122, rz=0.25)
    drum(-26.4, -37.6, 0, "stateGreen")
    drum(-26.6, -38.3, 0, "rust", lying=True, rz=1.2)
    with frame((-22.0, -40.5, 0), rz=0.6):
        for sy in (-0.35, 0.35):
            cyl(0.7, 0.05, (0, sy, 0.7), "wood", rot=(math.pi / 2, 0, 0), verts=12)
        tube([(0, -0.33, 0.7), (0, 0.33, 0.7)], 0.4, "wood", sides=8, caps=False)
    for i, (x, y, r) in enumerate(((-7.0, -3.5, 0.6), (-9.5, -5.6, 0.7), (-8.5, 2.2, 2.1))):
        with frame((x, y, 0), rz=r):
            plate([(-0.25, 0), (0.25, 0), (0.12, 0.8), (-0.12, 0.8)], (0, -1.0, 0), (1, 0, 0), (0, 0, 1), 2.0, "concreteOld",
                  bevel=0.02)
    for i, (x, y) in enumerate(((-12.0, -7.0), (-19.0, -13.0), (-9.0, 12.0), (-11.0, 30.0), (-5.0, -14.0))):
        cyl(0.04, 1.4, (x, y, 0.7), "white", verts=6)
        for k in range(2):
            tube([(x, y, 0.75 + k * 0.4), (x, y, 0.95 + k * 0.4)], 0.042, "stencil", sides=6, caps=False)
    ruts([(-27.0, -32.0), (-28.6, -28.6), (-31.0, -27.4), (-33.0, -28.5)], gauge=1.6)
    ca, sa = math.cos(BH_RZ), math.sin(BH_RZ)

    def bw(lx, ly):
        return (BH_POS[0] + lx * ca - ly * sa, BH_POS[1] + lx * sa + ly * ca)
    ruts([(-24.0, -36.0), (-14.0, -37.4), (-8.6, -39.4), bw(-1.0, -10.5), bw(-1.0, -7.4)], gauge=1.6)
    ruts([(-10.5, 22.0), (-12.5, 40.0), (-12.8, 60.0), (-12.5, 65.5)], gauge=1.5)


build_clutter()
finish_group("clutter")


# =====================================================================================================================
# finish: weighted normals (big faces stay flat, bevels read round), bake the AO, export
# =====================================================================================================================
for ob in list(scene.objects):
    if ob.type == "MESH":
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        md = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
        md.mode = "FACE_AREA"
        md.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=md.name)

def plain_uvs(o):
    """untextured materials (glass, rubber, cables, lamps) need no UVs: zero them so they cause no seams, which would
    each cost exported vertices"""
    uv = o.data.uv_layers.active
    plain = [i for i, m in enumerate(o.data.materials) if m and "tex" not in m]
    for p in o.data.polygons:
        if p.material_index in plain:
            for li in p.loop_indices:
                uv.data[li].uv = (0.0, 0.0)


def ao_per_vertex():
    """the bake writes each face corner its own AO value; give every corner of a vertex the same (mean) value so the
    exporter doesn't split vertices over tiny shade differences (about 10% of the file)"""
    for o in scene.objects:
        if o.type != "MESH" or "Color" not in o.data.color_attributes:
            continue
        me = o.data
        ca = me.color_attributes["Color"]
        acc = [0.0] * len(me.vertices)
        cnt = [0] * len(me.vertices)
        for lp, d in zip(me.loops, ca.data):
            acc[lp.vertex_index] += d.color[0]
            cnt[lp.vertex_index] += 1
        for lp, d in zip(me.loops, ca.data):
            v = round(acc[lp.vertex_index] / max(1, cnt[lp.vertex_index]) * 255) / 255
            d.color = (v, v, v, 1.0)


for ob in scene.objects:
    if ob.type == "MESH":
        plain_uvs(ob)
tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in scene.objects if ob.type == "MESH")
for ob in scene.objects:
    if ob.type == "MESH":
        print("  %-12s %6d tris" % (ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons)))
print("triangles:", tris)
bake_ao(samples=64, distance=1.2)
lift_ao(floor=0.35, gamma=0.8)
ao_per_vertex()
export(OUT)
print("done in %.1f s" % (time.time() - T0))
