"""Burn Rate: build textures/, the shared tileable texture set for the 3D range and the motor, with scripted Blender.

No photos and no hand painting: every texture is a Cycles node graph (noise, Voronoi, a few lines of maths) that this
script builds on a 1 x 1 plane and bakes. So there are no third-party images and no licensing questions, and a texture
can be changed by editing numbers here. Run it headless from the repo root, either way:

    blender -b -P tools/blender-textures.py      (a Blender install, 4.2 or newer)
    python3 tools/blender-textures.py            (the bpy module from PyPI: pip install bpy; 5.3 used)

It writes, for each key below, textures/<key>.jpg (colour, sRGB) and textures/<key>-n.jpg (a tangent-space normal map,
OpenGL convention: green means "up the picture", +v). Commit them with this script. The models name a key and a tile
size in each material (see tools/blender_lib.py), and src/vis/glb.js repeats the texture every <tile> metres.

How it works:
  - Seamless by construction. Every noise and Voronoi is sampled in 4D on two circles: for (u, v) in [0, 1) the point is
    (cos 2pi u * Ru, sin 2pi u * Ru, cos 2pi v * Rv) with W = sin 2pi v * Rv. u = 0 and u = 1 are the same point, so are
    v = 0 and v = 1, and that torus is flat, so features keep their shape. Ru and Rv set how many features fit across a
    tile (more along one than the other gives streaks). Weaves, planks, rings and the spiral seams are plain maths with a
    whole number of repeats per tile, so they wrap too.
  - Two bakes per texture: an emission bake of the colour and one of a height field. The normal map is worked out from
    the height with wrap-around differences (numpy), which keeps it seamless and lets each texture set its own strength.
  - Neutral keys (concrete, paint, metal...) are near-grey: the game multiplies them by the material's palette colour,
    so their average is pulled to about 0.82 in linear light (0.92 as stored) and the palette colour shows through at
    about its real value. Carbon is the exception: it keeps the contrast of its weave (average about 0.52 linear).
    Coloured keys (rust, earth, wood, kraft) carry their real colour and go on a white material.
  - No large-scale shading or ambient occlusion is baked in: the models carry that in vertex colours.
  - Deterministic: fixed seeds and offsets, the same files every run (up to the JPEG encoder).

Colours here are written as sRGB hex and stored as they are (the bake works on raw numbers, no colour management).
"""
import bpy, math, os, sys, time
from statistics import NormalDist
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "textures")
TAU = 2 * math.pi
SAMPLES = 8            # bake samples per pixel (anti-aliases the weaves and the thin lines)
Q_COLOUR = 80          # JPEG quality
Q_NORMAL = 85
NEUTRAL_MEAN = 0.82    # target average of a neutral texture in linear light


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hexc(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]


# ---- a small node-graph builder ----------------------------------------------------------------------------------------
class Graph:
    """one material whose Emission colour is the thing being baked. Methods return output sockets; any input may be a
    socket or a plain number."""

    def __init__(self, name):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        self.mat = m
        self.nt = m.node_tree
        self.N, self.L = self.nt.nodes, self.nt.links
        for n in list(self.N):
            self.N.remove(n)
        out = self.N.new("ShaderNodeOutputMaterial")
        self.em = self.N.new("ShaderNodeEmission")
        self.L.new(self.em.outputs[0], out.inputs["Surface"])
        tc = self.N.new("ShaderNodeTexCoord")
        sep = self.N.new("ShaderNodeSeparateXYZ")
        self.L.new(tc.outputs["UV"], sep.inputs[0])
        self.u, self.v = sep.outputs[0], sep.outputs[1]
        self.colour = None
        self.height = None
        self._angles = {}

    def _set(self, sock, x):
        if isinstance(x, (int, float)):
            sock.default_value = x
        elif isinstance(x, (list, tuple)):
            sock.default_value = x
        else:
            self.L.new(x, sock)

    # maths on numbers
    def m(self, op, a, b=None, c=None):
        n = self.N.new("ShaderNodeMath")
        n.operation = op
        for i, x in enumerate((a, b, c)):
            if x is not None:
                self._set(n.inputs[i], x)
        return n.outputs[0]

    def add(self, a, b): return self.m("ADD", a, b)
    def sub(self, a, b): return self.m("SUBTRACT", a, b)
    def mul(self, a, b): return self.m("MULTIPLY", a, b)
    def mx(self, a, b): return self.m("MAXIMUM", a, b)
    def mn(self, a, b): return self.m("MINIMUM", a, b)
    def fract(self, a): return self.m("FRACT", a)
    def floor(self, a): return self.m("FLOOR", a)
    def sin(self, a): return self.m("SINE", a)
    def cos(self, a): return self.m("COSINE", a)
    def abs(self, a): return self.m("ABSOLUTE", a)
    def mod(self, a, b): return self.m("FLOORED_MODULO", a, b)
    def lerp(self, t, a, b): return self.add(a, self.mul(t, self.sub(b, a)))   # a at t = 0, b at t = 1

    def mr(self, x, a, b, c=0.0, d=1.0, smooth=False):
        """map x from [a, b] to [c, d], clamped (smoothstep when smooth)"""
        n = self.N.new("ShaderNodeMapRange")
        n.data_type = "FLOAT"
        n.interpolation_type = "SMOOTHSTEP" if smooth else "LINEAR"
        n.clamp = True
        for i, y in enumerate((x, a, b, c, d)):
            self._set(n.inputs[i], y)
        return n.outputs[0]

    def comb(self, x, y, z):
        n = self.N.new("ShaderNodeCombineXYZ")
        for i, s in enumerate((x, y, z)):
            self._set(n.inputs[i], s)
        return n.outputs[0]

    def vadd(self, a, b):
        n = self.N.new("ShaderNodeVectorMath")
        n.operation = "ADD"
        self._set(n.inputs[0], a)
        self._set(n.inputs[1], b)
        return n.outputs[0]

    def vscale(self, a, s):
        n = self.N.new("ShaderNodeVectorMath")
        n.operation = "SCALE"
        self._set(n.inputs[0], a)
        self._set(n.inputs["Scale"], s)
        return n.outputs[0]

    # seamless coordinates
    def _ang(self, s):
        """2pi * s, its cosine and sine, cached per socket"""
        key = s.node.name + s.identifier
        if key not in self._angles:
            a = self.mul(s, TAU)
            self._angles[key] = (self.cos(a), self.sin(a))
        return self._angles[key]

    def torus(self, fu, fv, seed, u=None, v=None):
        """the 4D point (vector, W) for (u, v) on two circles. fu, fv: about how many unit features fit across one
        period of u and of v. u, v default to the plane's UVs; any other sockets must repeat every 1 too."""
        u = self.u if u is None else u
        v = self.v if v is None else v
        cu, su = self._ang(u)
        cv, sv = self._ang(v)
        ru, rv = fu / TAU, fv / TAU
        o = [((seed * 7919 + k * 104729) % 997) * 0.37 - 180 for k in range(4)]    # fixed per-seed offsets
        vec = self.comb(self.add(self.mul(cu, ru), o[0]), self.add(self.mul(su, ru), o[1]),
                        self.add(self.mul(cv, rv), o[2]))
        w = self.add(self.mul(sv, rv), o[3])
        return vec, w

    def _warp(self, vec, w, warp):
        if warp:
            col, amt = warp
            d = self.vscale(self.vadd(col, (-0.5, -0.5, -0.5)), amt / 0.07)   # amt: shift in feature sizes
            vec = self.vadd(vec, d)
        return vec, w

    def noise(self, fu, fv=None, seed=0, detail=2.0, rough=0.5, lac=2.0, dist=0.0, kind="FBM", u=None, v=None,
              warp=None, out="Fac"):
        fv = fu if fv is None else fv
        vec, w = self._warp(*self.torus(fu, fv, seed, u, v), warp)
        n = self.N.new("ShaderNodeTexNoise")
        n.noise_dimensions = "4D"
        n.noise_type = kind
        self._set(n.inputs["Vector"], vec)
        self._set(n.inputs["W"], w)
        n.inputs["Scale"].default_value = 1.0
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Lacunarity"].default_value = lac
        n.inputs["Distortion"].default_value = dist
        return n.outputs[out]

    def z(self, fu, fv=None, seed=0, detail=2.0, rough=0.5, **kw):
        """noise rescaled to mean 0, spread 1 (Blender's fractal noise sits around 0.5 with a spread that shrinks as
        detail grows; this undoes that so amounts and thresholds read the same for every noise)"""
        d = int(detail)
        sd = 0.124 * math.sqrt(sum(rough ** (2 * i) for i in range(d + 1))) / sum(rough ** i for i in range(d + 1))
        return self.mul(self.sub(self.noise(fu, fv, seed, detail, rough, **kw), 0.5), 1 / sd)

    def cover(self, z, frac, soft=0.3):
        """1 where the spread-1 field z is in its top frac (0..1) share, with a soft edge soft wide"""
        t = NormalDist().inv_cdf(1 - frac)
        return self.mr(z, t - soft / 2, t + soft / 2)

    def vor(self, fu, fv=None, seed=0, feature="F1", rand=1.0, u=None, v=None, warp=None, out="Distance"):
        fv = fu if fv is None else fv
        vec, w = self._warp(*self.torus(fu, fv, seed, u, v), warp)
        n = self.N.new("ShaderNodeTexVoronoi")
        n.voronoi_dimensions = "4D"
        n.feature = feature
        self._set(n.inputs["Vector"], vec)
        self._set(n.inputs["W"], w)
        n.inputs["Scale"].default_value = 1.0
        n.inputs["Randomness"].default_value = rand
        return n.outputs[out]

    # colours
    def rgb(self, h):
        n = self.N.new("ShaderNodeRGB")
        n.outputs[0].default_value = hexc(h)
        return n.outputs[0]

    def mixc(self, t, a, b, blend="MIX"):
        """colour a where t = 0, b where t = 1 (blend MULTIPLY: a times b, by t)"""
        n = self.N.new("ShaderNodeMix")
        n.data_type = "RGBA"
        n.blend_type = blend
        n.clamp_result = False
        ins = {s.identifier: s for s in n.inputs}
        self._set(ins["Factor_Float"], t)
        self._set(ins["A_Color"], a if not isinstance(a, str) else self.rgb(a))
        self._set(ins["B_Color"], b if not isinstance(b, str) else self.rgb(b))
        return [s for s in n.outputs if s.identifier == "Result_Color"][0]

    def shade(self, col, s):
        """colour times a number"""
        return self.vscale(col, s)

    def ramp(self, x, stops, interp="LINEAR"):
        """a colour ramp: stops are (position, '#hex') or (position, grey value)"""
        n = self.N.new("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for e, (p, c) in zip(cr.elements, stops):
            e.position = p
            e.color = hexc(c) if isinstance(c, str) else (c, c, c, 1.0)
        self._set(n.inputs[0], x)
        return n.outputs["Color"]


# ---- baking ------------------------------------------------------------------------------------------------------------
def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    bpy.ops.mesh.primitive_plane_add(size=1)
    return bpy.context.active_object


def bake(plane, g, sock, size):
    """bake one socket of graph g into a size x size float array (rows bottom-up, i.e. row = v), RGB"""
    g.L.new(sock, g.em.inputs["Color"])
    img = bpy.data.images.new("bake", size, size, float_buffer=True, alpha=False)
    img.colorspace_settings.name = "Linear Rec.709"
    node = g.N.new("ShaderNodeTexImage")
    node.image = img
    g.N.active = node
    plane.data.materials.clear()
    plane.data.materials.append(g.mat)
    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type="EMIT", margin=0, use_clear=True)
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    g.N.remove(node)
    bpy.data.images.remove(img)
    return a.reshape(size, size, 4)[..., :3].astype(np.float64)


def normal_map(h, strength):
    """tangent-space normals from a height field (rows bottom-up), wrap-around differences so it tiles; OpenGL (+Y up)"""
    h = (np.roll(h, 1, 0) + 2 * h + np.roll(h, -1, 0)) / 4          # a light 1-2-1 blur against JPEG speckle
    h = (np.roll(h, 1, 1) + 2 * h + np.roll(h, -1, 1)) / 4
    k = strength * h.shape[0] / 512                                  # same look at 1024 px
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * k
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * k
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def neutralise(rgb):
    """scale a neutral texture so its average in linear light is NEUTRAL_MEAN (a few rounds, because of clipping)"""
    for _ in range(10):
        m = srgb_to_lin(np.clip(rgb, 0, 1)).mean()
        rgb = rgb * (NEUTRAL_MEAN / m) ** (1 / 2.4)
    return np.clip(rgb, 0, 1)


def save_jpeg(rgb, path, quality):
    size = rgb.shape[0]
    img = bpy.data.images.new("out", size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"                      # store the numbers as they are
    p = np.ones((size, size, 4), np.float32)
    p[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(p.ravel())
    img.file_format = "JPEG"
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


# ---- the textures ------------------------------------------------------------------------------------------------------
# Each builder gets a Graph and sets g.colour (a colour socket) and g.height (a number socket, any range: only its slopes
# matter). Feature counts are "per tile", so a count of 40 on a 2 m tile is a 5 cm feature. g.z gives noise with spread
# 1, so "z * 0.03" is a 3% brightness wobble, and g.cover(z, 0.1) picks out the top 10% of it.

def lines(g, seed, f_across, along, density, width=1.0, f_along=3.0, px=512, seg=None):
    """thin straight lines (scratches, cracks along grain, grass blades): where a noise stretched along the lines
    crosses its middle, kept only along a share density of their length. along: 'u', 'v', 'd1' or 'd2' (diagonals),
    or a whole-number direction (i, j) in uv; width in pixels; seg: how many kept pieces fit along a tile (sets their
    length). Returns 0..1, 1 on a line."""
    a, b = g.u, g.v
    if along == "v":
        a, b = g.v, g.u
    elif along in ("d1", "d2"):
        a, b = (g.add(g.u, g.v), g.sub(g.u, g.v)) if along == "d1" else (g.sub(g.u, g.v), g.add(g.u, g.v))
    elif isinstance(along, tuple):
        i, j = along                                                 # whole numbers, so a and b still wrap
        a = g.add(g.mul(g.u, i), g.mul(g.v, j))
        b = g.add(g.mul(g.u, -j), g.mul(g.v, i))
        n = math.hypot(i, j)
        f_across, f_along = f_across / n, f_along / n
        seg = seg / n if seg else None
    z = g.z(f_along, f_across, seed=seed, detail=1, u=a, v=b)
    w = width * f_across / 200 * 512 / px * (math.hypot(*along) if isinstance(along, tuple) else 1)
    line = g.mr(g.abs(z), 0.0, w, 1.0, 0.0)
    keep = g.cover(g.z(seg or f_along * 4, f_across, seed=seed + 1, detail=1, u=a, v=b), density, 0.25)  # per line
    return g.mul(line, keep)


def grain(g, seed, f_pore, f_agg, pore_amt, agg_amt):
    """concrete surface: small dark pores and light/dark aggregate speckle, as (brightness factor, height)"""
    pv = g.vor(f_pore, seed=seed)
    pore = g.mul(g.mr(pv, 0.20, 0.30, 1.0, 0.0), g.cover(g.z(f_pore / 3, seed=seed + 1), 0.5, 0.5))
    agg = g.z(f_agg, seed=seed + 2, detail=2, rough=0.6)
    speck = g.mr(agg, -2.5, 2.5, -1.0, 1.0)
    bright = g.add(g.sub(1.0, g.mul(pore, pore_amt)), g.mul(speck, agg_amt))
    return bright, g.add(g.mul(pore, -1.0), g.mul(speck, 0.2))


def t_concrete(g):
    # 2 m tile: cast pad: fine pores, aggregate speckle, faint formwork boards (8 across v), light water stains
    b, h = grain(g, 10, 260, 150, 0.35, 0.05)
    # formwork boards: each a slightly different tone, a faint broken seam line and a little grain along u
    vb = g.mul(g.floor(g.mul(g.v, 8)), 1 / 8)
    tone = g.z(9, 9, seed=11, detail=0, v=vb)
    fy = g.fract(g.mul(g.v, 8))
    seam = g.mul(g.mr(g.abs(g.sub(fy, 0.5)), 0.485, 0.5), g.cover(g.z(14, 4, seed=12), 0.45, 0.6))
    bgrain = g.z(3, 70, seed=13, detail=3)
    b = g.add(b, g.add(g.mul(tone, 0.012), g.add(g.mul(seam, -0.035), g.mul(bgrain, 0.008))))
    # water stains: soft darker blotches with a darker tide line at their edge
    st = g.z(6, seed=14, detail=4, rough=0.55, dist=0.3)
    b = g.sub(b, g.mul(g.cover(st, 0.18, 0.8), 0.03))
    b = g.sub(b, g.mul(g.mr(g.abs(g.sub(st, 0.92)), 0.0, 0.12, 1, 0), 0.025))
    b = g.add(b, g.add(g.mul(g.z(4, seed=15, detail=5, rough=0.6), 0.012), g.mul(g.z(14, seed=16, detail=4), 0.025)))
    b = g.add(b, g.mul(g.z(32, seed=20, detail=3, rough=0.6), 0.015))
    b = g.add(b, g.mul(g.z(60, seed=17, detail=2), 0.012))
    base = g.mixc(g.cover(g.z(5, seed=18), 0.5, 2.0), "#E9E9E6", "#EEEAE2")
    g.colour = g.shade(base, b)
    g.height = g.add(g.add(h, g.mul(seam, -0.4)), g.mul(g.z(20, seed=19, detail=3), 0.06))


def t_concreteOld(g):
    # 3 m tile: weathered 1960s state concrete: vertical rain streaks, damp patches, spalls, hairline cracks
    b, h = grain(g, 20, 330, 200, 0.45, 0.08)
    # rain streaks: long thin noise along v, gathered into bands that come and go
    zs = g.add(g.mul(g.z(90, 2.5, seed=21, detail=4, rough=0.6), 0.7), g.mul(g.z(30, 1.5, seed=22), 0.6))
    band = g.cover(g.z(6, 2, seed=23), 0.5, 1.2)
    streak = g.mul(g.mr(zs, -0.3, 2.0), band)
    damp = g.cover(g.z(5, 6, seed=24, detail=5, rough=0.6, dist=0.4), 0.3, 1.4)
    # spalls: a few irregular broken patches, darker and rough inside, a pale fresh rim
    zp = g.z(7, seed=25, detail=6, rough=0.65, dist=0.5)
    spall = g.cover(zp, 0.03, 0.3)
    rim = g.sub(g.cover(zp, 0.055, 0.2), spall)
    rin = g.z(120, seed=26, detail=3, rough=0.7)
    # hairline cracks: warped Voronoi cell edges, only where a mask lets them through
    wc = g.noise(14, seed=27, detail=5, rough=0.7, out="Color")      # small, jagged wander
    ce = g.vor(5, seed=28, feature="DISTANCE_TO_EDGE", warp=(wc, 0.10))
    crack = g.mul(g.mr(ce, 0.0, 0.015, 1.0, 0.0), g.cover(g.z(4, seed=29, detail=3), 0.45, 0.5))
    wf = g.noise(40, seed=34, detail=4, rough=0.7, out="Color")
    fine = g.mul(g.mr(g.vor(14, seed=30, feature="DISTANCE_TO_EDGE", warp=(wf, 0.12)), 0.0, 0.02, 1, 0),
                 g.cover(g.z(6, seed=31), 0.15, 0.5))
    cr = g.mx(crack, g.mul(fine, 0.6))
    b = g.add(b, g.add(g.mul(g.z(12, seed=32, detail=6, rough=0.62), 0.03), g.mul(g.z(4, seed=35, detail=4), 0.025)))
    b = g.sub(b, g.mul(streak, 0.11))
    b = g.sub(b, g.mul(damp, 0.05))
    b = g.add(b, g.mul(rim, 0.05))
    b = g.sub(b, g.mul(spall, g.add(0.07, g.mul(g.mr(rin, -2, 2), 0.14))))
    b = g.sub(b, g.mul(cr, 0.40))
    base = g.mixc(damp, "#E8E7E2", "#E0E2DE")
    base = g.mixc(g.mul(streak, 0.6), base, "#E7E2D8")
    g.colour = g.shade(base, b)
    hh = g.add(g.mul(h, 1.0), g.mul(spall, -1.2))
    hh = g.add(hh, g.mul(spall, g.mul(rin, 0.25)))
    hh = g.sub(hh, g.mul(cr, 1.2))
    hh = g.add(hh, g.mul(g.z(24, seed=33, detail=4), 0.12))
    g.height = g.sub(hh, g.mul(streak, 0.25))


def t_paint(g):
    # 1 m tile: worn industrial paint on steel, near-white: scratches, chips showing dark steel, dust, faint drips
    sc = g.mx(g.mx(lines(g, 40, 130, "u", 0.10), lines(g, 42, 110, "d1", 0.10)),
              g.mx(lines(g, 44, 100, "d2", 0.10), lines(g, 46, 90, "v", 0.06)))
    # chips: irregular flakes, more where a slow "wear" field is high
    zc = g.mul(g.add(g.z(14, seed=48, detail=6, rough=0.7, dist=0.4), g.mul(g.z(3, seed=47, detail=3), 0.6)), 0.86)
    chip = g.cover(zc, 0.028, 0.12)
    edge = g.sub(g.cover(zc, 0.05, 0.15), chip)
    steel = g.mixc(g.cover(g.z(60, seed=49, detail=3), 0.5, 2.0), "#46494C", "#5E5F5E")
    dust = g.cover(g.z(5, seed=50, detail=5, rough=0.6), 0.45, 2.0)
    drip = g.mul(g.cover(g.z(45, 1.5, seed=51), 0.08, 0.6), g.cover(g.z(8, 3, seed=52), 0.4, 0.6))
    c = g.shade(g.rgb("#F2F1EC"), g.add(g.add(1.0, g.mul(g.z(140, seed=53), 0.01)),
                                        g.mul(g.z(9, seed=54, detail=5), 0.015)))
    c = g.mixc(g.mul(dust, 0.35), c, "#DCD7CB")
    c = g.mixc(g.mul(drip, 0.35), c, "#D3CFC6")
    c = g.mixc(g.mul(sc, 0.6), c, "#8E8D89")
    c = g.mixc(g.mul(edge, 0.6), c, "#C4C1B9")
    g.colour = g.mixc(chip, c, steel)
    hh = g.add(g.mul(chip, -2.0), g.mul(sc, -0.6))
    hh = g.add(hh, g.mul(drip, 0.4))
    g.height = g.add(hh, g.mul(g.z(30, seed=55, detail=3), 0.03))


def t_metal(g):
    # 0.5 m tile: bare steel or aluminium: brushed streaks along u, faint mill-scale mottling, a few scuffs
    br = g.add(g.mul(g.z(2, 260, seed=60, detail=3, rough=0.7), 0.025), g.mul(g.z(5, 80, seed=61), 0.015))
    mill = g.z(4, seed=62, detail=6, rough=0.6, dist=0.6)
    scm = g.cover(g.z(5, seed=63, detail=3), 0.15, 0.5)
    scuff = g.mul(g.mx(lines(g, 64, 200, "d1", 0.4), lines(g, 66, 180, "d2", 0.4)), scm)
    fine = g.mx(lines(g, 68, 160, "u", 0.12), lines(g, 70, 150, "d1", 0.06))
    b = g.add(g.add(1.0, br), g.mul(g.mr(mill, -2, 2, -1, 1), 0.035))
    b = g.sub(b, g.mul(scuff, 0.08))
    b = g.sub(b, g.mul(fine, 0.05))
    base = g.mixc(g.mr(mill, -1.5, 1.5), "#E9E8E5", "#E4E6E9")
    g.colour = g.shade(base, b)
    g.height = g.add(g.add(g.mul(br, 4.0), g.mul(scuff, -0.5)), g.mul(fine, -0.4))


def weave_plain(g, n, seed, wobble):
    """a plain over-under weave, n threads each way per tile. Returns (height 0..1, warp-on-top 0/1, gap 0..1)."""
    wu = g.mul(g.z(4, 6, seed=seed), wobble * 0.07)
    wv = g.mul(g.z(6, 4, seed=seed + 1), wobble * 0.07)
    x = g.add(g.mul(g.u, n), wu)
    y = g.add(g.mul(g.v, n), wv)
    fx, fy = g.fract(x), g.fract(y)
    px = g.m("POWER", g.sin(g.mul(fx, math.pi)), 0.5)            # across a thread: 0 at its edge, 1 in its middle
    py = g.m("POWER", g.sin(g.mul(fy, math.pi)), 0.5)
    ew = g.sin(g.mul(g.add(y, g.floor(x)), math.pi))              # along a thread: over and under, cell by cell
    ef = g.mul(g.sin(g.mul(g.add(x, g.floor(y)), math.pi)), -1.0)
    hw = g.add(g.mul(px, 0.6), g.mul(ew, 0.35))
    hf = g.add(g.mul(py, 0.6), g.mul(ef, 0.35))
    top = g.m("GREATER_THAN", hw, hf)
    gap = g.mul(g.mr(px, 0.0, 0.45, 1, 0), g.mr(py, 0.0, 0.45, 1, 0))
    return g.mx(hw, hf), top, gap


def t_burlap(g):
    # 0.5 m tile: sandbag hessian, a coarse plain weave of hairy jute, dusty
    h, top, gap = weave_plain(g, 56, 80, 0.35)
    ttone = g.lerp(top, g.z(3, 56, seed=83, detail=1), g.z(56, 3, seed=82, detail=1))     # thread to thread
    fuzz = g.z(220, seed=84)
    fib = g.lerp(top, g.z(20, 240, seed=86), g.z(240, 20, seed=85))
    dust = g.cover(g.z(4, seed=87, detail=5, rough=0.6), 0.4, 2.0)
    b = g.add(0.80, g.mul(h, 0.20))
    b = g.add(b, g.add(g.mul(ttone, 0.05), g.add(g.mul(fuzz, 0.025), g.mul(fib, 0.03))))
    b = g.sub(b, g.mul(gap, 0.45))
    b = g.add(b, g.mul(g.z(6, seed=88, detail=4), 0.02))
    c = g.shade(g.rgb("#ECEAE4"), b)
    g.colour = g.mixc(g.mul(dust, 0.35), c, "#E8E3D8")
    g.height = g.add(g.add(h, g.mul(gap, -0.4)), g.mul(fib, 0.02))


def t_graphite(g):
    # 0.2 m tile: machined graphite: fine lathe rings running along u (so they circle a part whose u goes around it,
    # as uv_cyl in tools/blender_lib.py lays out), soot smudges
    amp = g.mr(g.z(1.5, 30, seed=90), -1.5, 1.5, 0.3, 1.0)
    r1 = g.sin(g.mul(g.v, TAU * 160))
    r2 = g.sin(g.mul(g.add(g.v, g.mul(g.z(1.5, 12, seed=91, detail=1), 0.0006)), TAU * 48))
    rings = g.add(g.mul(r1, g.mul(amp, 0.025)), g.mul(r2, 0.012))
    tone = g.mul(g.z(1.5, 40, seed=92, detail=3), 0.025)
    groove = g.cover(g.z(1.5, 25, seed=93, detail=1), 0.05, 0.3)
    soot = g.cover(g.z(9, seed=94, detail=5, rough=0.62, dist=0.5), 0.3, 1.6)
    b = g.add(g.add(1.0, rings), g.add(tone, g.mul(g.z(150, seed=95), 0.012)))
    b = g.sub(b, g.mul(groove, 0.10))
    b = g.sub(b, g.mul(soot, 0.045))
    b = g.add(b, g.mul(g.z(10, seed=96, detail=4), 0.02))
    g.colour = g.shade(g.rgb("#E6E6E6"), b)
    g.height = g.add(g.add(g.mul(r1, g.mul(amp, 0.10)), g.mul(r2, 0.06)), g.mul(groove, -0.4))


def t_glass(g):
    # 0.2 m tile: fibreglass cloth under resin: a faint plain weave of flat tows, resin sheen, a few tiny bubbles
    h, top, gap = weave_plain(g, 24, 100, 0.12)
    fib = g.lerp(top, g.z(12, 200, seed=103), g.z(200, 12, seed=102))
    resin = g.mul(g.z(7, seed=104, detail=4), 0.008)
    bub = g.mul(g.mr(g.vor(60, seed=105), 0.19, 0.24, 1, 0), g.cover(g.z(30, seed=106, detail=1), 0.3, 0.5))
    b = g.add(0.92, g.mul(h, 0.08))
    b = g.add(b, g.add(g.mul(fib, 0.015), resin))
    b = g.sub(b, g.mul(gap, 0.06))
    b = g.add(b, g.mul(bub, 0.05))
    g.colour = g.shade(g.rgb("#EEEEEB"), b)
    g.height = g.mul(g.add(h, g.mul(fib, 0.03)), 0.6)


def t_carbon(g):
    # 0.1 m tile: 2x2 twill carbon fibre, 32 tows each way; tinted near-black in the game, so the weave keeps contrast
    n = 32
    x, y = g.mul(g.u, n), g.mul(g.v, n)
    fx, fy = g.fract(x), g.fract(y)
    k = g.mod(g.add(g.floor(x), g.floor(y)), 4)                    # 0, 1: warp (along v) on top; 2, 3: weft on top
    warp = g.m("LESS_THAN", k, 1.5)
    t = g.lerp(warp, g.mul(g.add(g.sub(k, 2), fx), 0.5), g.mul(g.add(k, fy), 0.5))   # along each two-cell float
    across = g.lerp(warp, fy, fx)
    pa = g.m("POWER", g.sin(g.mul(across, math.pi)), 0.45)
    pl = g.m("POWER", g.sin(g.mul(t, math.pi)), 0.6)
    h = g.mul(pa, g.add(0.4, g.mul(pl, 0.6)))
    fibres = g.lerp(warp, g.z(8, 300, seed=111), g.z(300, 8, seed=110))
    # the classic look: one direction catches the light, the other is darker; each float brightest at its middle
    b = g.mul(g.lerp(warp, 0.58, 0.97), g.add(0.78, g.mul(h, 0.22)))
    b = g.add(b, g.mul(fibres, 0.025))
    b = g.sub(b, g.mul(g.mr(pa, 0.0, 0.25, 1, 0), 0.18))
    b = g.add(b, g.mul(g.z(4, seed=112, detail=3), 0.015))
    g.colour = g.shade(g.rgb("#FFFFFF"), b)
    g.height = g.add(h, g.mul(fibres, 0.01))


def t_salt(g):
    # 20 m tile (1024 px): salt-flat crust: raised polygon ridges a metre or two across, finer cracks, mottled patches
    w1 = g.noise(6, seed=120, detail=3, out="Color")
    e1 = g.vor(8, seed=121, feature="DISTANCE_TO_EDGE", rand=0.85, warp=(w1, 0.2))
    wn = g.z(60, seed=122, detail=3)                                 # crumple along the ridges
    ridge = g.mr(g.sub(e1, g.mul(wn, 0.004)), 0.0, g.add(0.03, g.mul(g.mr(wn, -2, 2), 0.015)), 1, 0, True)
    crackc = g.mul(g.mr(e1, 0.0, 0.005, 1, 0), g.cover(g.z(12, seed=130), 0.5, 0.6))   # split along some ridge tops
    w2 = g.noise(20, seed=123, detail=2, out="Color")
    e2 = g.vor(45, seed=124, feature="DISTANCE_TO_EDGE", warp=(w2, 0.25))
    small = g.mul(g.mr(e2, 0.0, 0.025, 1, 0), g.cover(g.z(10, seed=125), 0.3, 0.5))
    m1 = g.z(7, seed=126, detail=6, rough=0.6, dist=0.3)
    m2 = g.z(15, seed=127, detail=4, rough=0.6)
    damp = g.cover(m1, 0.3, 1.5)
    b = g.add(0.88, g.mul(m2, 0.025))
    b = g.add(b, g.mul(g.z(400, seed=128), 0.012))
    b = g.add(b, g.mul(g.z(50, seed=129, detail=3), 0.015))
    b = g.sub(b, g.mul(damp, 0.035))
    b = g.add(b, g.mul(ridge, 0.10))
    b = g.sub(b, g.mul(crackc, 0.12))
    b = g.sub(b, g.mul(small, 0.05))
    base = g.mixc(g.cover(m2, 0.5, 2.0), "#EEEAE2", "#E9E6DE")
    base = g.mixc(damp, base, "#E2E0DA")
    g.colour = g.shade(base, b)
    hh = g.add(g.mul(ridge, 1.6), g.mul(crackc, -0.5))
    hh = g.add(hh, g.mul(small, -0.4))
    g.height = g.add(hh, g.mul(m2, 0.05))


def t_rust(g):
    # 1 m tile (coloured): rusty steel, orange-brown with pitting and a few flecks of old dark paint
    z1 = g.z(9, seed=130, detail=7, rough=0.62, dist=0.4)
    z2 = g.z(25, seed=131, detail=5, rough=0.6)
    c = g.ramp(g.add(0.5, g.mul(g.add(g.mul(z1, 0.55), g.mul(z2, 0.8)), 0.17)),
               [(0.10, "#502C19"), (0.30, "#7C421F"), (0.50, "#9E582A"), (0.70, "#B97036"), (0.90, "#CC8F52")])
    c = g.shade(c, g.add(1.0, g.mul(g.z(120, seed=132), 0.05)))
    pit = g.mul(g.mr(g.vor(110, seed=133), 0.19, 0.27, 1, 0), g.cover(g.z(8, seed=134, detail=3), 0.5, 0.8))
    c = g.mixc(g.mul(pit, 0.75), c, "#3A1E12")
    flake = g.cover(g.z(18, seed=135, detail=5, rough=0.65, dist=0.6), 0.12, 0.2)
    c = g.mixc(g.mul(flake, 0.35), c, "#5A2D17")
    paint = g.cover(g.z(10, seed=136, detail=6, rough=0.7, dist=0.5), 0.05, 0.1)
    g.colour = g.mixc(paint, c, g.mixc(g.noise(40, seed=137), "#3A3B36", "#4A4A43"))
    hh = g.add(g.mul(z2, 0.12), g.mul(g.z(120, seed=132), 0.03))
    hh = g.sub(hh, g.mul(pit, 1.4))
    hh = g.add(hh, g.mul(flake, 0.6))
    g.height = g.add(hh, g.mul(paint, 0.6))


def t_earth(g):
    # 4 m tile (coloured): dry steppe earth: cracked tan clay, pebbles, sparse straw-coloured grass tufts
    wc = g.noise(8, seed=140, detail=3, out="Color")
    ce = g.vor(11, seed=141, feature="DISTANCE_TO_EDGE", rand=0.9, warp=(wc, 0.25))
    crack = g.mr(ce, 0.0, 0.025, 1, 0)
    lip = g.mr(ce, 0.025, 0.08, 1, 0)                               # cracked plates curl up a little at their edges
    zm = g.add(g.mul(g.z(7, seed=142, detail=6, rough=0.6, dist=0.3), 0.55), g.mul(g.z(40, seed=143, detail=4), 0.8))
    soil = g.ramp(g.add(0.5, g.mul(zm, 0.17)), [(0.15, "#9A8264"), (0.5, "#B49C7A"), (0.85, "#C8B290")])
    soil = g.shade(soil, g.add(1.0, g.mul(g.z(250, seed=144), 0.04)))
    soil = g.mixc(g.mul(crack, 0.85), soil, "#5E4C38")
    # pebbles: Voronoi cells shrunk to round stones, only some cells
    pd = g.vor(70, seed=145)
    pc = g.vor(70, seed=145, out="Color")
    pick = g.mul(g.m("GREATER_THAN", pc, 0.72), g.cover(g.z(6, seed=146), 0.5, 1.0))
    peb = g.mul(g.mr(pd, 0.21, 0.29, 1, 0, True), pick)
    pcol = g.mixc(pc, "#8A8276", "#C6BBA8")
    soil = g.mixc(peb, soil, g.shade(pcol, g.add(0.85, g.mul(g.mr(pd, 0.29, 0.15), 0.25))))
    # grass tufts: sparse clumps of short blades in a few directions, over a darker patch of litter
    tz = g.z(9, seed=147, detail=3)
    tuft = g.cover(tz, 0.10, 0.5)
    blades = lines(g, 148, 220, "v", 0.35, 1.3, 20, seg=45)
    for k, d in enumerate(((1, 2), (-1, 2), (2, 1), (-2, 1), (1, 1), (-1, 1))):
        blades = g.mx(blades, lines(g, 150 + 2 * k, 220, d, 0.3, 1.3, 20, seg=45))
    grass = g.mx(g.mul(tuft, blades), g.mul(g.cover(tz, 0.07, 0.6), 0.45))
    gcol = g.mixc(g.noise(30, seed=154), "#C4AC74", "#DDCA96")
    soil = g.mixc(g.mul(g.cover(tz, 0.16, 0.8), 0.35), soil, "#8A765A")
    g.colour = g.mixc(grass, soil, gcol)
    hh = g.add(g.mul(crack, -1.6), g.mul(lip, 0.25))
    hh = g.add(hh, g.mul(peb, 1.4))
    hh = g.add(hh, g.mul(grass, 0.7))
    g.height = g.add(hh, g.mul(zm, 0.05))


def t_wood(g):
    # 1 m tile (coloured): sun-greyed planks, 8 boards across u, grain along v, a butt joint and two nails per board
    nb = 8
    xb = g.mul(g.u, nb)
    bi = g.mul(g.floor(xb), 1 / nb)                                  # board index / 8 (repeats every 1 in u)
    fx = g.fract(xb)
    rnd = g.noise(13, 13, seed=160, detail=0, u=bi, v=bi)            # numbers fixed per board
    rnd2 = g.noise(13, 13, seed=161, detail=0, u=bi, v=bi)
    gap = g.mr(g.abs(g.sub(fx, 0.5)), 0.47, 0.49)
    wv = g.noise(4, 2, seed=162, detail=3, out="Color")
    zg = g.z(70, 2.5, seed=163, detail=4, rough=0.6, warp=(wv, 0.06))
    bands = g.sin(g.mul(g.add(g.mul(fx, 9.0), g.mul(g.z(3, 3, seed=164), 0.5)), TAU))
    check = lines(g, 165, 110, "v", 0.25, 1.3, 1.5)                  # weather checks along the grain
    jv = g.fract(g.add(g.v, g.mul(rnd, 3.7)))
    joint = g.mr(g.abs(g.sub(jv, 0.5)), 0.496, 0.499)
    nx = g.mul(g.sub(g.abs(g.sub(fx, 0.5)), 0.25), 1 / nb)           # tile units
    ny = g.sub(g.abs(g.sub(jv, 0.5)), 0.47)
    nail = g.mr(g.m("SQRT", g.add(g.mul(nx, nx), g.mul(ny, ny))), 0.004, 0.007, 1, 0)
    grey = g.ramp(g.add(0.5, g.mul(g.add(g.mul(zg, 0.8), g.mul(g.sub(rnd2, 0.5), 3.0)), 0.16)),
                  [(0.10, "#736D66"), (0.40, "#968F86"), (0.65, "#B1AAA0"), (0.90, "#C2BCB1")])
    brown = g.mixc(rnd, "#8C7860", "#A38B6C")                        # less-weathered boards keep a little brown
    c = g.mixc(g.mul(g.mr(rnd2, 0.5, 0.8), 0.4), grey, brown)
    c = g.shade(c, g.add(1.0, g.mul(bands, 0.03)))
    c = g.shade(c, g.add(0.93, g.mul(rnd, 0.14)))
    c = g.mixc(g.mul(check, 0.7), c, "#4A443E")
    c = g.mixc(joint, c, "#3C3732")
    c = g.mixc(nail, c, "#55504A")
    g.colour = g.mixc(gap, c, "#2E2A26")
    hh = g.add(g.mul(zg, 0.12), g.mul(bands, 0.06))
    hh = g.sub(hh, g.mul(check, 0.8))
    hh = g.sub(hh, g.mul(gap, 2.0))
    hh = g.sub(hh, g.mul(joint, 1.2))
    g.height = g.add(hh, g.mul(nail, 0.4))


def t_kraft(g):
    # 0.3 m tile (coloured): spiral-wound kraft paper tube. Seams run along (5, 3) in uv, about 31 degrees off u, so on
    # a tube whose u goes around it (uv_cyl) they spiral; sqrt(34) = 5.8 strips cross a tile (about 5 cm wide). On the
    # torus that is one single strip, so there is no per-strip tone; the mottling does that job.
    p = g.sub(g.mul(g.u, 3), g.mul(g.v, 5))                          # across the strips (whole numbers: wraps)
    q = g.add(g.mul(g.u, 5), g.mul(g.v, 3))                          # along the strips
    fp = g.fract(p)
    seam = g.mr(fp, 0.0, 0.04, 1, 0)                                 # the shadow line where one strip overlaps
    ridge = g.mul(g.mr(fp, 0.03, 0.07), g.mr(fp, 0.07, 0.14, 1, 0))  # the raised overlap edge just past it
    fib = g.z(40, 1.5, seed=170, detail=4, rough=0.6, u=p, v=q)
    fleck = g.cover(g.z(260, seed=171), 0.04, 0.5)
    zm = g.add(g.mul(g.z(9, seed=173, detail=5, rough=0.6), 0.5), g.mul(g.z(2, 12, seed=172, u=p, v=q), 0.5))
    c = g.ramp(g.add(0.5, g.mul(zm, 0.17)), [(0.15, "#987350"), (0.50, "#AD865C"), (0.85, "#BF9A6C")])
    c = g.shade(c, g.add(1.0, g.mul(fib, 0.045)))
    c = g.mixc(g.mul(fleck, 0.3), c, "#7A5A3A")
    c = g.mixc(g.mul(ridge, 0.4), c, "#C9A577")
    g.colour = g.mixc(g.mul(seam, 0.8), c, "#5A3F26")
    g.height = g.add(g.add(g.mul(ridge, 0.6), g.mul(seam, -0.6)), g.mul(fib, 0.02))


# key: (builder, size in px, pull its average to NEUTRAL_MEAN?, normal strength). Tile sizes (m) are set per material
# in the models.
TEXTURES = {
    "concrete":    (t_concrete,    512,  True,  2.0),
    "concreteOld": (t_concreteOld, 512,  True,  2.6),
    "paint":       (t_paint,       512,  True,  1.6),
    "metal":       (t_metal,       512,  True,  1.0),
    "burlap":      (t_burlap,      512,  True,  2.2),
    "graphite":    (t_graphite,    512,  True,  1.0),
    "glass":       (t_glass,       512,  True,  0.9),
    "carbon":      (t_carbon,      512,  False, 2.0),            # neutral, but keeps its own contrast
    "salt":        (t_salt,        1024, True,  2.0),
    "rust":        (t_rust,        512,  False, 2.4),
    "earth":       (t_earth,       512,  False, 2.6),
    "wood":        (t_wood,        512,  False, 1.8),
    "kraft":       (t_kraft,       512,  False, 1.2),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    only = [a for a in argv if a in TEXTURES] or list(TEXTURES)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    for key in only:
        build, size, neutral, strength = TEXTURES[key]
        t1 = time.time()
        plane = setup()
        g = Graph(key)
        build(g)
        col = bake(plane, g, g.colour, size)
        g.L.remove(g.em.inputs["Color"].links[0])
        h = bake(plane, g, g.height, size)[..., 0]
        if neutral:
            col = neutralise(col)
        save_jpeg(col, os.path.join(OUT, key + ".jpg"), Q_COLOUR)
        save_jpeg(normal_map(h, strength), os.path.join(OUT, key + "-n.jpg"), Q_NORMAL)
        lin = srgb_to_lin(np.clip(col, 0, 1)).mean()
        print("%-12s %4d px  mean %.3f stored, %.3f linear  %.1f s" % (key, size, col.mean(), lin, time.time() - t1))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith(".jpg"))
    print("textures/: %.0f KB of JPEGs, %.0f s" % (total / 1024, time.time() - t0))


if __name__ == "__main__":
    main()
