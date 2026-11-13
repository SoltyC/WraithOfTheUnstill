# Limestone outcrops for the meadow (docs/meadow-overhaul.md M6): run headless in Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/outcrop_pieces.py -- <out_dir> [atlas_px] [quick]
#
# The same pipeline as tools/models/walker_pieces.py (seeded high-poly sculpts in the game frame →
# decimated LOD0/LOD1 sharing UVs → one atlas, object-space normal + AO baked on the GPU), for one
# family: pale bedded limestone scarps, the rock that breaks through the forest on the meadow
# reference's hill (screenshots/reference/meadow-target.jpg). Outputs outcrop-pieces.glb / .webp.

import bpy, bmesh, sys, math, os, random, zlib
import numpy as np
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('outcrop-out')
ATLAS = int(argv[1]) if len(argv) > 1 else 4096
QUICK = len(argv) > 2 and argv[2] == 'quick'
HI = 5 if QUICK else 7
os.makedirs(OUT, exist_ok=True)

FAMILIES = { 'limestone': (10, 4000, 25.0) }
LOD1 = 0.3

def V(x, y, z): return Vector((x, y, z))
def fbm(p, oct=5, lac=2.0, gain=0.5):
    a, f, s = 1.0, 1.0, 0.0
    for _ in range(oct):
        s += a * noise.noise(p * f, noise_basis='PERLIN_NEW'); a *= gain; f *= lac
    return s
def vor(p):
    d, _ = noise.voronoi(p, distance_metric='DISTANCE', exponent=2.5)
    return d[0], d[1]
def cube_grid(level):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for _ in range(level):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm

def sculpt_limestone(g, r):
    """A limestone scarp: a blocky mass in thick beds (the softer ones undercut), cut by deep vertical
    joints into pillars, its top rounded and runnelled (karren), its faces broken by fracture facets,
    the edges weathered round; a buried, splayed foot. Unit space, +y up, the long axis along x."""
    off = V(r['ox'], r['oy'], r['oz'])
    rng = random.Random(int(r['seed'] * 1e6))
    beds = 4 + int(r['a'] * 4)
    hard = [rng.random() for _ in range(32)]
    tilt = (r['b'] - 0.5) * 0.25                      # gently dipping beds
    planes = [(Vector((rng.uniform(-1, 1), rng.uniform(-0.3, 0.5), rng.uniform(-1, 1))).normalized(), rng.uniform(0.62, 0.9)) for _ in range(7)]
    def f(p):
        # A rounded box, wider than tall, the top lower toward one end.
        q = Vector((p.x * 0.95, p.y * 0.62, p.z * 0.55))
        k = 6.0
        rad_box = (abs(q.x) ** k + abs(q.y) ** k + abs(q.z) ** k) ** (1.0 / k)
        n = q.normalized()
        s = q / max(rad_box, 1e-6)
        s.y *= 1.0 - 0.25 * (s.x * 0.5 + 0.5) * r['a']
        # Fracture facets: planar cuts at seeded orientations (blocky, angular).
        # (not through the foot: a cut there left a thin lip standing proud of the buried base)
        footK = 1.0
        for pn, d in planes:
            t = s.dot(pn) - d
            if t > 0: s -= pn * min(t, 0.25) * 0.9 * footK
        # Beds: height warped by the dip and noise; soft beds recess (undercut), seams between.
        h = (s.y + tilt * s.x + 0.05 * fbm(s * 1.3 + off, 2)) * 0.5 + 0.5
        b = h * beds; bi = int(math.floor(b)) % 32; t = b - math.floor(b)
        side = max(0.0, 1.0 - abs(n.y) * 1.4)
        recess = (0.03 + 0.09 * (1.0 - hard[bi])) * side
        recess += 0.025 * side * math.exp(-((t if t < 0.5 else 1.0 - t) * 9.0) ** 2)
        # Joints: deep vertical clefts from voronoi cell edges in xz.
        d0, d1 = vor(V(s.x * 1.6, 0.0, s.z * 1.6) + off)
        # (wide and rounded: narrow V-joints aliased on the ~20 cm sculpt grid into bright zigzag creases)
        recess += 0.1 * math.exp(-((d1 - d0) * 3.2) ** 2) * (0.4 + 0.6 * side)
        # Karren: runnels down the upper faces and on the top.
        up = max(0.0, n.y)
        recess += 0.012 * up * (0.5 + 0.5 * math.sin((s.x * 0.7 + s.z * 0.7) * 26.0 + 4.0 * fbm(s * 3.0 + off, 2)))
        # Weathering: rounded, pitted, a little lumpy.
        recess += 0.02 * max(0.0, fbm(s * 4.0 + off, 3)) + 0.006 * noise.noise(s * 40.0 + off)
        # The foot splays into the ground.
        # The foot tucks in under the body (it is buried): a splay, or an uncut foot past the fracture cuts,
        # stood out of the slope as a thin shelf.
        if s.y < -0.25: s = Vector((s.x * (1.0 - 0.45 * (-s.y - 0.25)), s.y, s.z * (1.0 - 0.45 * (-s.y - 0.25))))
        return s * (1.0 - recess)
    return f

def to_blender(g): return Vector((g.x, -g.z, g.y))          # game (y up, z fwd) -> Blender (z up)

def build_high(fam, idx):
    rnd = random.Random(zlib.crc32(f'{fam}:{idx}'.encode()))
    r = {'a': rnd.random(), 'b': rnd.random(), 'ox': rnd.uniform(-50, 50), 'oy': rnd.uniform(-50, 50), 'oz': rnd.uniform(-50, 50), 'seed': rnd.random()}
    bm = cube_grid(HI); f = sculpt_limestone(None, r)
    for v in bm.verts:
        b = v.co; g = Vector((b.x, b.z, -b.y))                  # Blender -> game
        v.co = to_blender(f(g))
    me = bpy.data.meshes.new(f'{fam}_{idx}_high'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def decimated(src, name, tris):
    me = src.data.copy(); me.name = name
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = min(1.0, tris / max(1, len(src.data.polygons)))
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec')
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def main():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices: d.use = d.type == kind
                    sc.cycles.device = 'GPU'; print('bake device', kind); break
            except Exception: pass
    except Exception as e: print('no gpu', e)
    pairs = []
    for fam, (n, tris, size) in FAMILIES.items():
        for i in range(1 if QUICK else n):
            hi = build_high(fam, i)
            lo = decimated(hi, f'{fam}_{i}_lod0', tris)
            pairs.append((fam, i, hi, lo, size))
            print('sculpted', fam, i, len(hi.data.polygons), '->', len(lo.data.polygons), flush=True)
    # UVs: unwrap each low piece, then pack all of them into one atlas at an even texel density in
    # metres (scaled by the family's typical size while packing).
    bpy.ops.object.select_all(action='DESELECT')
    for fam, i, hi, lo, size in pairs:
        lo.select_set(True); lo.scale = (size, size, size)
    bpy.context.view_layer.objects.active = pairs[0][3]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.008)
    bpy.ops.object.mode_set(mode='OBJECT')
    for fam, i, hi, lo, size in pairs:
        lo.data.transform(__import__('mathutils').Matrix.Scale(1.0 / size, 4))
    # Bake targets.
    imgN = bpy.data.images.new('nrm', ATLAS, ATLAS, float_buffer=True, alpha=False)
    imgA = bpy.data.images.new('ao', ATLAS, ATLAS, float_buffer=True, alpha=False)
    mat = bpy.data.materials.new('bake'); mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    mat.node_tree.nodes.active = node
    for fam, i, hi, lo, size in pairs:
        lo.data.materials.clear(); lo.data.materials.append(mat)
        hi.data.materials.clear(); hi.data.materials.append(bpy.data.materials.new('hi'))
    bk = sc.render.bake
    bk.use_selected_to_active = True; bk.use_clear = False; bk.margin = 32; bk.margin_type = 'EXTEND'
    bk.normal_space = 'OBJECT'
    # The low pieces must not occlude the high ones' AO rays (else everything bakes black).
    for fam, i, hi, lo, size in pairs:
        lo.visible_diffuse = lo.visible_glossy = lo.visible_transmission = lo.visible_shadow = lo.visible_volume_scatter = False
    # Apart for the bake: pieces at one origin would occlude each other's AO.
    for k, (fam, i, hi, lo, size) in enumerate(pairs):
        hi.location = lo.location = (k * 4.0, 0.0, 0.0)
    if sc.world is None: sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = 0.35          # AO reach in unit-piece space
    for img, kind, samples in ((imgN, 'NORMAL', 1), (imgA, 'AO', 32)):
        node.image = img
        sc.cycles.samples = samples
        for fam, i, hi, lo, size in pairs:
            bpy.ops.object.select_all(action='DESELECT')
            hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
            bpy.ops.object.bake(type=kind, use_selected_to_active=True, use_clear=False, margin=32, cage_extrusion=0.1, max_ray_distance=0.3, normal_space='OBJECT')
            print('baked', kind, fam, i, flush=True)
    # Pack: object normal (Blender frame) -> game frame -> octahedral RG; AO in B.
    n = np.array(imgN.pixels[:], dtype=np.float32).reshape(ATLAS, ATLAS, 4)[..., :3] * 2.0 - 1.0
    a = np.array(imgA.pixels[:], dtype=np.float32).reshape(ATLAS, ATLAS, 4)[..., 0]
    g = np.stack([n[..., 0], n[..., 2], -n[..., 1]], -1)
    g /= np.maximum(np.abs(g).sum(-1, keepdims=True), 1e-6)
    ox, oy = g[..., 0].copy(), g[..., 1].copy()
    neg = g[..., 2] < 0
    sx = np.where(ox >= 0, 1.0, -1.0); sy = np.where(oy >= 0, 1.0, -1.0)
    ox2 = np.where(neg, (1.0 - np.abs(g[..., 1])) * sx, ox)
    oy2 = np.where(neg, (1.0 - np.abs(g[..., 0])) * sy, oy)
    out = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
    out[..., 0] = ox2 * 0.5 + 0.5; out[..., 1] = oy2 * 0.5 + 0.5; out[..., 2] = np.clip(a, 0, 1)
    for size, name in ((ATLAS, 'outcrop-pieces'), (ATLAS // 2, 'outcrop-pieces-2k')):
        img = bpy.data.images.new(name, ATLAS, ATLAS, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        img.pixels[:] = out.ravel()
        if size != ATLAS: img.scale(size, size)
        sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 100
        sc.render.image_settings.color_mode = 'RGB'
        img.save_render(os.path.join(OUT, name + '.webp'), scene=sc)
        img.filepath_raw = os.path.join(OUT, name + '.png'); img.file_format = 'PNG'; img.save()
    # LOD1 (same UVs) and export the game meshes only.
    lows = []
    for fam, i, hi, lo, size in pairs:
        lows.append(lo)
        lows.append(decimated(lo, f'{fam}_{i}_lod1', max(60, int(len(lo.data.polygons) * LOD1))))
        lows.append(decimated(lo, f'{fam}_{i}_lod2', max(48, int(len(lo.data.polygons) * 0.08))))
    for fam, i, hi, lo, size in pairs: bpy.data.objects.remove(hi)
    for o in lows: o.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in lows: o.select_set(True); o.data.materials.clear()
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'outcrop-pieces.glb'), use_selection=True,
        export_format='GLB', export_materials='NONE', export_normals=True,
        export_apply=True, export_yup=True)
    for o in lows: print('piece', o.name, len(o.data.polygons))
    print('DONE', flush=True)

main()
