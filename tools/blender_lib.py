"""Burn Rate: shared helpers for the scripted Blender models (tools/blender-range.py, tools/blender-kit.py).

Nothing here is modelled by hand: the scripts call these helpers to place parts by numbers. Every model follows the same
rules, so src/vis/glb.js can read them all the same way:

  - Materials are palette colours plus a texture key. Each material carries two custom properties that the exporter
    writes as glTF material "extras": tex (a key in textures/, made by tools/blender-textures.py) and tile (how many
    metres one copy of that texture covers). The game multiplies the texture by the material's base colour, so one
    worn-paint texture can be faded green, cobalt or hazard amber. A material with no tex is a plain colour.
  - UVs are world-scale box projection: 1 UV unit is 1 metre, each face projected along its main axis. So a texture
    tiles at the same real size on a 10 m pad and a 5 cm bolt, and the game sets repeat = 1 / tile.
  - Ambient occlusion (the soft dark where parts meet and under things) is baked by Cycles into a vertex colour layer
    called "Color", exported as COLOR_0. Big flat faces are cut up first (densify) so the bake has vertices to land on.
  - Round things are smooth shaded, with hard edges split above 35 degrees (finish).
  - Blender is Z-up; the exporter turns it Y-up, so Blender (x, y, z) is three.js (x, z, -y).

Run under Blender 4.2+ (blender -b -P ...) or the bpy module from PyPI (pip install bpy; 5.3 used).
"""
import bpy, bmesh, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    GROUP.clear()
    return bpy.context.scene


# ---- materials -------------------------------------------------------------------------------------------------------
def hexrgb(h):
    """a #RRGGBB palette colour as linear RGBA (Blender and glTF store linear)"""
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb] + [1.0]


MATS = {}


def mat(name, hexcol, tex=None, tile=1.0, rough=0.9, metal=0.0, emit=None):
    """one material: a base colour (multiplies the texture), roughness, metalness, and the texture key and tile size.
    emit: a #RRGGBB glow (lamps, the beacon), exported as emissive."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hexrgb(hexcol)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = hexrgb(emit)
        b.inputs["Emission Strength"].default_value = 1.0
    if tex:
        m["tex"] = tex
        m["tile"] = float(tile)
    MATS[name] = m
    return m


# ---- building parts --------------------------------------------------------------------------------------------------
GROUP = []          # objects of the current group, joined into one mesh by join()


def _activate(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def keep(o, m, bevel=0.0, segs=2):
    """give o one material, optionally bevel its edges (width in m), apply its transform (so a group's origin is the
    world origin and place() moves the joined group as a whole) and add it to the group"""
    o.data.materials.clear()
    o.data.materials.append(MATS[m])
    _activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel > 0:
        md = o.modifiers.new("bevel", "BEVEL")
        md.width = bevel
        md.segments = segs
        md.limit_method = "ANGLE"
        md.angle_limit = math.radians(40)
        md.harden_normals = False
        bpy.ops.object.modifier_apply(modifier=md.name)
    GROUP.append(o)
    return o


def box(size, loc, m, rot=(0, 0, 0), bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return keep(o, m, bevel, segs)


def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=24, r2=None, bevel=0.0, segs=2):
    """a cylinder (or a cone when r2 is given) along its local Z"""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    return keep(bpy.context.active_object, m, bevel, segs)


def sphere(r, loc, m, segs=16, rings=8, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    return keep(o, m)


def torus(R, r, loc, m, rot=(0, 0, 0), major=32, minor=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot,
                                     major_segments=major, minor_segments=minor)
    return keep(bpy.context.active_object, m)


def mesh_obj(name, verts, faces, m, bevel=0.0, segs=2):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return keep(o, m, bevel, segs)


def prism(pts, height, z0, m, bevel=0.0):
    """an upright prism over a polygon (x, y) list (counter-clockwise), from z0 to z0 + height"""
    n = len(pts)
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z0 + height) for x, y in pts]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return mesh_obj("prism", verts, faces, m, bevel)


def wedge(x0, x1, y0, y1, h0, h1, m):
    """a ramp: a box whose top slopes from height h0 at x0 to h1 at x1 (earth berms)"""
    v = [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0), (x0, y0, h0), (x1, y0, h1), (x1, y1, h1), (x0, y1, h0)]
    f = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    if x1 < x0:
        f = [list(reversed(q)) for q in f]
    return mesh_obj("wedge", v, f, m)


def lathe(profile, m, verts=32, loc=(0, 0, 0), rot=(0, 0, 0), cap=False):
    """a surface of revolution about local Z from a list of (radius, z) points, in order along the outline.
    cap closes the first and last points onto the axis when their radius is above 0."""
    ring = []
    for i in range(verts):
        a = 2 * math.pi * i / verts
        ring.append((math.cos(a), math.sin(a)))
    V, F = [], []
    for (r, z) in profile:
        for (c, s) in ring:
            V.append((r * c, r * s, z))
    n = len(profile)
    for j in range(n - 1):
        for i in range(verts):
            a, b = j * verts + i, j * verts + (i + 1) % verts
            F.append([a, b, b + verts, a + verts])
    if cap:
        for j, flip in ((0, True), (n - 1, False)):
            if profile[j][0] > 1e-6:
                face = [j * verts + i for i in range(verts)]
                F.append(face[::-1] if flip else face)
    o = mesh_obj("lathe", V, F, m)
    o.rotation_euler = rot
    o.location = loc
    _activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def empty(name, loc, rot=(0, 0, 0)):
    """a named point the game reads (motorMount, cradle positions, railBase...)"""
    o = bpy.data.objects.new(name, None)
    o.location = loc
    o.rotation_euler = rot
    bpy.context.scene.collection.objects.link(o)
    return o


def place(o, loc, rz=0.0):
    o.location = loc
    o.rotation_euler = (0, 0, rz)


# ---- finishing a group -----------------------------------------------------------------------------------------------
def densify(o, max_edge=0.6):
    """cut edges longer than max_edge (m) so the AO bake has vertices on big flat faces"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for _ in range(6):
        long_edges = {}
        for e in bm.edges:
            n = int(e.calc_length() / max_edge)
            if n >= 1:
                long_edges.setdefault(min(n, 8), []).append(e)
        if not long_edges:
            break
        for n, es in sorted(long_edges.items(), reverse=True):
            es = [e for e in es if e.is_valid]
            if es:
                bmesh.ops.subdivide_edges(bm, edges=es, cuts=n, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(o.data)
    bm.free()


def uv_box(o):
    """world-scale box projection: each face takes UVs from the two axes across its main normal; 1 UV unit = 1 m"""
    me = o.data
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = (co.y if n.x > 0 else -co.y), co.z
            elif ax == 1:
                u, v = (-co.x if n.y > 0 else co.x), co.z
            else:
                u, v = co.x, (co.y if n.z > 0 else -co.y)
            uv.data[li].uv = (u, v)


def uv_cyl(o, axis="Z", radius=None):
    """cylindrical UVs about an axis through the origin: u = arc length around (m), v = distance along (m).
    For tubes (motor case, rocket body) where box projection would seam badly. Caps fall back to box projection."""
    me = o.data
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    ai = "XYZ".index(axis)
    oth = [i for i in range(3) if i != ai]
    for p in me.polygons:
        if abs(p.normal[ai]) > 0.8:          # a cap: flat projection
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = (co[oth[0]], co[oth[1]])
            continue
        c = p.center
        a0 = math.atan2(c[oth[1]], c[oth[0]])
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(co[oth[1]], co[oth[0]])
            while a - a0 > math.pi:            # keep a face's corners on one side of the seam
                a -= 2 * math.pi
            while a - a0 < -math.pi:
                a += 2 * math.pi
            r = radius if radius else math.hypot(co[oth[0]], co[oth[1]])
            uv.data[li].uv = (a * r, co[ai])


def join(name, smooth_angle=35, uv="box", max_edge=0.6):
    """join the group's objects into one mesh (one draw call per material), project UVs, cut up big faces for the AO
    bake, smooth shade with hard edges split above smooth_angle degrees, and add the "Color" layer the bake fills"""
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
    finish(o, smooth_angle, uv, max_edge)
    return o


def finish(o, smooth_angle=35, uv="box", max_edge=0.6):
    if max_edge:
        densify(o, max_edge)
    if uv == "box":
        uv_box(o)
    elif uv:
        uv_cyl(o, uv)
    for p in o.data.polygons:
        p.use_smooth = True
    _activate(o)
    md = o.modifiers.new("split", "EDGE_SPLIT")
    md.split_angle = math.radians(smooth_angle)
    md.use_edge_sharp = True
    bpy.ops.object.modifier_apply(modifier=md.name)
    if "Color" not in o.data.color_attributes:
        o.data.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
    o.data.color_attributes.active_color = o.data.color_attributes["Color"]
    o["_bake"] = 1
    return o


# ---- the AO bake -----------------------------------------------------------------------------------------------------
def bake_ao(samples=48, distance=1.2, ground=True, objects=None):
    """bake ambient occlusion into each finished mesh's "Color" layer with Cycles. Everything in the scene occludes
    (so a bolt darkens the plate under it); a temporary ground plane darkens the feet of things, then goes."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.target = "VERTEX_COLORS"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("world")
    scene.world.light_settings.distance = distance
    g = None
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -0.001))
        g = bpy.context.active_object
        g.name = "_bakeGround"
    objs = objects or [o for o in scene.objects if o.type == "MESH" and o.get("_bake")]
    for o in objs:
        _activate(o)
        o.data.color_attributes.active_color = o.data.color_attributes["Color"]
        bpy.ops.object.bake(type="AO")
    if g:
        bpy.data.objects.remove(g, do_unlink=True)
    for o in objs:
        del o["_bake"]


def lift_ao(floor=0.35, gamma=0.8):
    """soften the baked AO so it reads as grime and contact shadow, not black: v -> floor + (1 - floor) * v^gamma"""
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or "Color" not in o.data.color_attributes:
            continue
        ca = o.data.color_attributes["Color"]
        for d in ca.data:
            c = d.color
            v = floor + (1 - floor) * (max(0.0, c[0]) ** gamma)
            d.color = (v, v, v, 1.0)


# ---- export ----------------------------------------------------------------------------------------------------------
def export(path):
    """write a .glb: meshes with POSITION, NORMAL, TEXCOORD_0 and COLOR_0, materials with their extras (tex, tile),
    named empties. No images: textures live in textures/ and are shared by every model."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT",
                              export_image_format="NONE", export_vertex_color="ACTIVE",
                              export_all_vertex_colors=False, export_cameras=False, export_lights=False,
                              export_extras=True, use_selection=False)
    print("wrote", path, os.path.getsize(path), "bytes")
