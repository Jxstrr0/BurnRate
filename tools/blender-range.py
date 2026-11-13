"""Burn Rate: build models/range.glb, the 3D test range (stage 7, plan section 9.3), with scripted Blender.

No Blender UI and no hand modelling: every block, beam and mast is placed by this script, so the model can be rebuilt and
changed by editing numbers. Run it headless from the repo root, either way:

    blender -b -P tools/blender-range.py        (a Blender install, 4.2 or newer)
    python tools/blender-range.py               (the bpy module from PyPI: pip install bpy)

It writes models/range.glb. Commit that file with this script. src/vis/stand3d.js loads it and reads the named nodes
below; the procedural parts (the motor, the plume, the ground, the hills, the rocket) are drawn by three.js because they
change with every design.

What is in it (Blender is Z-up; the exporter turns it Y-up, so Blender (x, y, z) is three.js (x, z, -y)):
  - Stand 3 at the origin: concrete pad, the thrust block with hazard chevrons, the steel thrust plate, the load cell, two
    rails with cradle posts, sandbags, a camera mast and an earth blast berm downrange. The motor lies along +X with its
    forward end on the load cell; its axis is at the "motorMount" empty.
  - The blockhouse (old Site 41 bunker), 40 m off to the side, abeam of the motor: earth-banked concrete, a slit window facing the stand, a steel door,
    periscopes and an antenna mast.
  - The launch pad, 70 m to the side: pad, blast plate, a tripod and the 3 m launch rail. "railBase" is the rail's foot.
  - Range clutter: the startup's cobalt container workshop, a water tower, floodlight masts, an old radar dish, fence posts.

Colours are the game's palette (src/css/style.css), as plain material base colours; no textures.
"""
import bpy, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "models", "range.glb")

AXIS_Z = 0.85          # motor axis height above the ground (m); src/vis/stand3d.js reads the motorMount node, not this
MOUNT_X = -0.04        # the motor's forward end (the load cell's face)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---- materials: the palette ----
def hexrgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb] + [1.0]

MATS = {}
def mat(name, hexcol, rough=0.9, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hexrgb(hexcol)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    MATS[name] = m
    return m

mat("concrete", "#CFCBC2")
mat("concreteDark", "#A29E95")
mat("concreteOld", "#B8B3A8")
mat("steel", "#6E737A", 0.55, 0.6)
mat("steelDark", "#3E4247", 0.6, 0.5)
mat("alu", "#B9BDC2", 0.4, 0.7)
mat("hazard", "#E0A526", 0.7)
mat("ink", "#23262A", 0.8)
mat("stateGreen", "#5E7F6E", 0.85)
mat("stencil", "#A8322A", 0.8)
mat("cobalt", "#2A55C9", 0.6)
mat("earth", "#C4B79E", 1.0)
mat("sand", "#B5A685", 1.0)
mat("glass", "#2B3440", 0.2, 0.1)
mat("white", "#EDEBE5", 0.8)
mat("lamp", "#FFF3D6", 0.3)

# ---- primitives: each makes an object, applies its scale and rotation, gives it one material ----
GROUP = []                                   # objects of the current group, joined into one mesh at the end
def keep(o, m):
    o.data.materials.clear()
    o.data.materials.append(MATS[m])
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)   # origin at the world origin, so a
    # joined group's origin is (0, 0, 0) and place() moves it as a whole
    GROUP.append(o)
    return o

def box(size, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return keep(o, m)

def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=16, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    return keep(bpy.context.active_object, m)

def sphere(r, loc, m, segs=12, rings=6, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object
    o.scale = scale
    return keep(o, m)

def prism(pts, height, z0, m):
    """an upright prism over a polygon (x, y) list, from z0 to z0 + height"""
    me = bpy.data.meshes.new("prism")
    n = len(pts)
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z0 + height) for x, y in pts]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("prism", me)
    scene.collection.objects.link(o)
    return keep(o, m)

def wedge(x0, x1, y0, y1, h0, h1, m):
    """a ramp: a box whose top slopes from height h0 at x0 to h1 at x1 (earth berms)"""
    me = bpy.data.meshes.new("wedge")
    v = [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0), (x0, y0, h0), (x1, y0, h1), (x1, y1, h1), (x0, y1, h0)]
    f = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    me.from_pydata(v, [], f)
    o = bpy.data.objects.new("wedge", me)
    scene.collection.objects.link(o)
    return keep(o, m)

def empty(name, loc):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    scene.collection.objects.link(o)
    return o

def join(name):
    """join the group's objects into one mesh (one draw call per material), flat shaded"""
    global GROUP
    bpy.ops.object.select_all(action="DESELECT")
    for o in GROUP:
        o.select_set(True)
    bpy.context.view_layer.objects.active = GROUP[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    for p in o.data.polygons:
        p.use_smooth = False
    GROUP = []
    return o

def place(o, loc, rz=0):
    o.location = loc
    o.rotation_euler = (0, 0, rz)

# =====================================================================================================================
# Stand 3: the static test stand at the origin. The exhaust points +X.
# =====================================================================================================================
box((8.0, 4.4, 0.25), (1.6, 0, 0.125), "concrete")                         # the pad
for i in range(1, 6):                                                      # expansion joints
    box((0.03, 4.42, 0.02), (-2.4 + i * 1.6, 0, 0.255), "concreteDark")
box((0.9, 2.4, 1.9), (-0.65, 0, 0.25 + 0.95), "concreteOld")               # the thrust block
box((1.1, 2.6, 0.12), (-0.65, 0, 2.21), "concreteDark")                    # its cap
for i in range(8):                                                         # hazard chevrons along the cap's face
    box((0.02, 0.3, 0.14), (-0.19, -1.05 + i * 0.3, 1.95), "hazard" if i % 2 == 0 else "ink", rot=(0.6, 0, 0))
box((0.02, 0.5, 0.18), (-0.19, 0.75, 1.55), "stencil")                     # stencil plate (the stand number)
box((0.06, 0.9, 0.9), (-0.17, 0, AXIS_Z), "steel")                         # thrust plate
for dy in (-0.36, 0.36):
    for dz in (-0.36, 0.36):
        cyl(0.025, 0.05, (-0.13, dy, AXIS_Z + dz), "steelDark", rot=(0, math.pi / 2, 0), verts=8)   # bolt heads
cyl(0.075, 0.09, (MOUNT_X - 0.045, 0, AXIS_Z), "ink", rot=(0, math.pi / 2, 0), verts=20)            # the load cell
cyl(0.05, 0.02, (MOUNT_X - 0.005, 0, AXIS_Z), "alu", rot=(0, math.pi / 2, 0), verts=20)
for y in (-0.2, 0.2):                                                      # the rails: I-beams
    box((5.6, 0.12, 0.02), (2.7, y, 0.27), "steel")
    box((5.6, 0.02, 0.12), (2.7, y, 0.34), "steel")
    box((5.6, 0.12, 0.02), (2.7, y, 0.41), "steel")
for x in (0.5, 1.5, 2.6, 3.8):                                             # cradle posts (three.js adds the clamp rings)
    box((0.08, 0.5, 0.04), (x, 0, 0.44), "steelDark")
    box((0.06, 0.06, 0.18), (x, 0, 0.55), "steelDark")
    empty(f"cradle{int(x * 10)}", (x, 0, 0.64))
for i in range(5):                                                         # sandbags along the pad's edge
    for j in range(2 - i % 2):
        sphere(0.3, (-1.2 + i * 0.55 + j * 0.28, -2.6, 0.18 + j * 0.0), "sand", segs=8, rings=4, scale=(1, 0.6, 0.45))
for i in range(6):
    sphere(0.3, (-1.4 + i * 0.55, 2.6, 0.18), "sand", segs=8, rings=4, scale=(1, 0.6, 0.45))
cyl(0.05, 3.2, (2.2, 3.4, 1.6), "steel", verts=8)                          # camera mast
box((0.3, 0.18, 0.18), (2.2, 3.32, 3.1), "white")
cyl(0.05, 0.1, (2.2, 3.2, 3.1), "glass", rot=(math.pi / 2, 0, 0), verts=10)
box((0.5, 0.4, 0.6), (-1.9, -1.6, 0.55), "stateGreen")                     # junction box, old green paint
box((0.5, 34, 0.06), (-1.9, -19, 0.03), "concreteDark")                    # cable trench to the blockhouse
wedge(10.5, 14.5, -5, 5, 3.0, 0.0, "earth")                                # earth blast berm downrange
wedge(10.5, 9.0, -5, 5, 3.0, 0.0, "earth")
join("stand")
empty("motorMount", (MOUNT_X, 0, AXIS_Z))

# =====================================================================================================================
# The blockhouse: the old programme's concrete bunker, banked with earth, its slit window facing the stand.
# Built around its own origin, then placed 40 m to the side of the stand, looking at it side-on.
# =====================================================================================================================
box((7, 5, 2.8), (0, 0, 1.4), "concreteOld")                               # the body
box((7.8, 5.8, 0.45), (0, 0, 3.02), "concreteDark")                        # roof slab
wedge(3.5, 6.5, -2.9, 2.9, 2.6, 0.0, "earth")                              # earth bank behind
wedge(-3.5, -6.0, -2.9, 2.9, 1.3, 0.0, "earth")                            # low bank under the slit (local -X faces the stand)
box((0.04, 3.2, 0.32), (-3.52, 0, 2.05), "glass")                          # the slit window
box((0.3, 3.6, 0.12), (-3.65, 0, 2.3), "concreteDark")                     # its brow
box((0.06, 1.0, 2.0), (-1.2, -2.53, 1.0), "stateGreen", rot=(0, 0, math.pi / 2))   # steel door, faded green
box((0.8, 0.04, 0.3), (-1.2, -2.56, 2.25), "stencil")                      # the "41" plate
for x in (1.2, 2.0):                                                       # periscopes
    cyl(0.08, 0.7, (x, 0.8, 3.6), "steel", verts=8)
    box((0.22, 0.16, 0.14), (x - 0.06, 0.8, 3.98), "steelDark")
cyl(0.06, 9.0, (2.6, -1.6, 3.25 + 4.5), "steel", verts=8)                  # antenna mast
for z in (5.5, 7.5, 9.5):
    box((1.4, 0.04, 0.04), (2.6, -1.6, 3.25 + z - 3.0), "steel")
sphere(0.12, (2.6, -1.6, 12.3), "stencil", segs=8, rings=4)                # mast beacon
o = join("blockhouse")
place(o, (4, -40, 0), rz=math.atan2(40, 1.6 - 4) - math.pi)   # abeam of the stand; the slit (local -X) faces it

# =====================================================================================================================
# The launch pad for flight jobs: a pad, a blast plate, a tripod and the 3 m rail. Placed 70 m to the side.
# =====================================================================================================================
LP = (-12.0, 70.0)
box((4.2, 4.2, 0.2), (0, 0, 0.1), "concrete")
box((1.0, 1.0, 0.04), (0, 0, 0.22), "steel")                               # blast plate
for a in (0, 2.094, 4.189):                                                # tripod legs
    lx, ly = math.cos(a) * 0.55, math.sin(a) * 0.55
    cyl(0.025, 1.1, (lx * 0.5, ly * 0.5, 0.65), "steel", rot=(-math.atan2(ly, 1.0) * 0.4, math.atan2(lx, 1.0) * 0.4, 0), verts=6)
box((0.18, 0.18, 0.06), (0, 0, 1.1), "steelDark")                          # rail clamp
box((0.03, 0.03, 3.2), (0, 0, 0.24 + 1.6), "alu")                          # the rail (1010-style extrusion)
box((0.012, 0.045, 3.2), (0, 0, 0.24 + 1.6), "alu")
for i in range(5):                                                         # pad edge stripes
    box((0.3, 0.06, 0.02), (-1.6 + i * 0.8, -2.08, 0.21), "hazard" if i % 2 == 0 else "ink")
box((0.5, 0.4, 0.5), (1.6, 1.5, 0.45), "cobalt")                           # the startup's igniter box
o = join("launchpad")
place(o, (LP[0], LP[1], 0))
empty("railBase", (LP[0], LP[1], 0.24))

# =====================================================================================================================
# Range clutter: makes it Site 41 rather than a blank plane.
# =====================================================================================================================
# the startup's workshop: a cobalt shipping container with a white stripe
box((6.06, 2.44, 2.59), (0, 0, 1.3), "cobalt")
box((6.1, 2.46, 0.25), (0, 0, 2.0), "white")
box((0.04, 1.0, 2.0), (3.05, 0, 1.0), "steelDark")
o = join("workshop")
place(o, (-30, -42, 0), rz=math.radians(-10))
# the old water tower, faded green
for a in range(4):
    x, y = math.cos(a * math.pi / 2 + 0.785) * 1.6, math.sin(a * math.pi / 2 + 0.785) * 1.6
    cyl(0.08, 9.0, (x, y, 4.5), "steel", verts=6)
cyl(2.0, 3.0, (0, 0, 10.5), "stateGreen", verts=16)
cyl(2.1, 0.8, (0, 0, 12.4), "stateGreen", verts=16, r2=0.2)
o = join("watertower")
place(o, (-70, 18, 0))
# floodlight masts
for k, (x, y) in enumerate(((-6, -8), (9, 8), (-18, 62))):
    cyl(0.1, 10, (0, 0, 5), "steel", verts=8)
    box((1.4, 0.3, 0.5), (0, 0, 10.1), "steelDark")
    for dx in (-0.45, 0, 0.45):
        box((0.32, 0.05, 0.3), (dx, 0.18, 10.1), "lamp")
    o = join(f"flood{k}")
    place(o, (x, y, 0), rz=math.atan2(-y, -x) + math.pi / 2)
# the old radar dish on its plinth
box((2.4, 2.4, 1.2), (0, 0, 0.6), "concreteOld")
cyl(0.25, 1.6, (0, 0, 2.0), "steel", verts=8)
sphere(2.2, (0, 0, 3.5), "stateGreen", segs=14, rings=7, scale=(1, 1, 0.35))
o = join("radar")
place(o, (55, -40, 0))
o.rotation_euler = (math.radians(-35), 0, math.radians(25))
# fence posts along the range boundary
for i in range(28):
    cyl(0.04, 1.4, (-90 + i * 7, -75, 0.7), "steelDark", verts=5)
for i in range(18):
    cyl(0.04, 1.4, (-90, -75 + i * 8, 0.7), "steelDark", verts=5)
join("fence")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_texcoords=False,
                          export_normals=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
                          export_extras=False, use_selection=False)
print("wrote", OUT, os.path.getsize(OUT), "bytes")
