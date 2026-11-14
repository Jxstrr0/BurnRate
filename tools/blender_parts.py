"""Burn Rate: the shared building blocks for the range-scale Blender scripts (blender-range.py, blender-hush.py,
blender-stands.py, blender-site.py): the game's material palette, local frames, bevelled boxes and cylinders, plates,
tubes, bolts, stencils, sandbags, aprons, drums and pallets, and finish_all() (weighted normals, the AO bake, export).
They sit on top of blender_lib.py. Every script that imports this builds in the same world frame as range.glb
(Blender Z up, Stand 2 at the origin, its exhaust +X), so all the models line up when the game loads them together.
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_lib import *            # noqa: F401,F403
from blender_lib import GROUP, MATS, keep
from blender_lib import box as _lbox, cyl as _lcyl
import bpy, bmesh
from mathutils import Vector, Matrix


def palette():
    """the shared materials (call once after reset())"""
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


_box, _cyl = _lbox, _lcyl


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
    "0": [(0.05, 0.1, 0.17, 0.9), (0.43, 0.1, 0.55, 0.9), (0.12, 0.9, 0.48, 1.0), (0.12, 0.0, 0.48, 0.1)],
    "2": [(0.05, 0.88, 0.55, 1.0), (0.43, 0.56, 0.55, 0.85), (0.05, 0.44, 0.55, 0.56), (0.05, 0.15, 0.17, 0.41),
          (0.05, 0.0, 0.55, 0.12)],
    "5": [(0.05, 0.88, 0.55, 1.0), (0.05, 0.56, 0.17, 0.85), (0.05, 0.44, 0.55, 0.56), (0.43, 0.15, 0.55, 0.41),
          (0.05, 0.0, 0.55, 0.12)],
    "6": [(0.05, 0.88, 0.55, 1.0), (0.05, 0.15, 0.17, 0.85), (0.2, 0.44, 0.55, 0.56), (0.43, 0.15, 0.55, 0.41),
          (0.05, 0.0, 0.55, 0.12)],
    "7": [(0.05, 0.88, 0.55, 1.0), (0.43, 0.0, 0.55, 0.85)],
    "8": [(0.05, 0.88, 0.55, 1.0), (0.05, 0.59, 0.17, 0.85), (0.43, 0.59, 0.55, 0.85), (0.05, 0.44, 0.55, 0.56),
          (0.05, 0.15, 0.17, 0.41), (0.43, 0.15, 0.55, 0.41), (0.05, 0.0, 0.55, 0.12)],
    "9": [(0.05, 0.88, 0.55, 1.0), (0.05, 0.59, 0.17, 0.85), (0.43, 0.15, 0.55, 0.85), (0.05, 0.44, 0.4, 0.56),
          (0.05, 0.0, 0.55, 0.12)],
    "-": [(0.1, 0.44, 0.5, 0.56)],
    " ": [],
    # block capitals (Latin and a few Cyrillic), the same stroke and bridges
    "A": [(0.05, 0.0, 0.17, 0.85), (0.43, 0.0, 0.55, 0.85), (0.05, 0.88, 0.55, 1.0), (0.2, 0.44, 0.4, 0.56)],
    "B": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.5, 1.0), (0.43, 0.59, 0.55, 0.85), (0.2, 0.44, 0.5, 0.56),
          (0.43, 0.15, 0.55, 0.41), (0.2, 0.0, 0.5, 0.12)],
    "C": [(0.05, 0.12, 0.17, 0.88), (0.2, 0.88, 0.55, 1.0), (0.2, 0.0, 0.55, 0.12)],
    "D": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.45, 1.0), (0.43, 0.15, 0.55, 0.85), (0.2, 0.0, 0.45, 0.12)],
    "E": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.55, 1.0), (0.2, 0.44, 0.48, 0.56), (0.2, 0.0, 0.55, 0.12)],
    "F": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.55, 1.0), (0.2, 0.44, 0.48, 0.56)],
    "H": [(0.05, 0.0, 0.17, 1.0), (0.43, 0.0, 0.55, 1.0), (0.2, 0.44, 0.4, 0.56)],
    "I": [(0.24, 0.0, 0.36, 1.0)],
    "L": [(0.05, 0.15, 0.17, 1.0), (0.05, 0.0, 0.55, 0.12)],
    "P": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.5, 1.0), (0.43, 0.56, 0.55, 0.85), (0.2, 0.44, 0.5, 0.56)],
    "R": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.5, 1.0), (0.43, 0.56, 0.55, 0.85), (0.2, 0.44, 0.5, 0.56),
          (0.43, 0.0, 0.55, 0.41)],
    "T": [(0.05, 0.88, 0.55, 1.0), (0.24, 0.0, 0.36, 0.85)],
    "U": [(0.05, 0.15, 0.17, 1.0), (0.43, 0.15, 0.55, 1.0), (0.05, 0.0, 0.55, 0.12)],
    "Б": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.55, 1.0), (0.2, 0.44, 0.5, 0.56), (0.43, 0.15, 0.55, 0.41),
          (0.2, 0.0, 0.5, 0.12)],
    "Г": [(0.05, 0.0, 0.17, 1.0), (0.2, 0.88, 0.55, 1.0)],
    "П": [(0.05, 0.0, 0.17, 0.85), (0.43, 0.0, 0.55, 0.85), (0.05, 0.88, 0.55, 1.0)],
    "Ш": [(0.03, 0.15, 0.13, 1.0), (0.25, 0.15, 0.35, 1.0), (0.47, 0.15, 0.57, 1.0), (0.03, 0.0, 0.57, 0.12)],
}
SEG["O"], SEG["S"], SEG["Л"] = SEG["0"], SEG["5"], SEG["П"]


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
    for o in bpy.context.scene.objects:
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


def finish_all(out, t0, samples=64, distance=1.2, ao=True):
    """weighted normals (big faces stay flat, bevels read round), zeroed UVs on plain materials, the AO bake, export.
    ao=False skips the bake (far scenery, where it isn't seen and costs bake time)"""
    scene = bpy.context.scene
    for ob in list(scene.objects):
        if ob.type == "MESH":
            bpy.ops.object.select_all(action="DESELECT")
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            md = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
            md.mode = "FACE_AREA"
            md.keep_sharp = True
            bpy.ops.object.modifier_apply(modifier=md.name)
    for ob in scene.objects:
        if ob.type == "MESH":
            plain_uvs(ob)
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in scene.objects if ob.type == "MESH")
    for ob in scene.objects:
        if ob.type == "MESH":
            print("  %-12s %6d tris" % (ob.name, sum(len(p.vertices) - 2 for p in ob.data.polygons)))
    print("triangles:", tris)
    if ao:
        bake_ao(samples=samples, distance=distance)
        lift_ao(floor=0.35, gamma=0.8)
        ao_per_vertex()
    export(out)
    print("done in %.1f s" % (time.time() - t0))
