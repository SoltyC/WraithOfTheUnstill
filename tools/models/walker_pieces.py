# The Long Walker's sculpted pieces (docs/hifi-models.md): run headless in Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/walker_pieces.py -- <out_dir> [atlas_px]
#
# For every family (the chunk kinds the Walker is built from) it sculpts a few seeded high-poly
# pieces (~300k triangles each) in the game's frame (+y up, +z forward, unit radius, as the
# icosphere the chunk shader scales), makes the game meshes from them (LOD0 ~2-3k, LOD1 ~1/3 of
# that, decimated so they share UVs), packs every piece's UVs into one atlas and bakes the high
# piece onto the low one: object-space normal and ambient occlusion. Outputs:
#   <out>/walker-pieces.glb    meshes named <family>_<variant>_lod<k> (POSITION, NORMAL, TEXCOORD_0)
#   <out>/walker-pieces.webp   atlas: RG octahedral object-space normal (game frame), B occlusion
# Deterministic: the same seeds give the same pieces.

import bpy, bmesh, sys, math, os, random, zlib
import numpy as np
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('walker-out')
ATLAS = int(argv[1]) if len(argv) > 1 else 4096
QUICK = len(argv) > 2 and argv[2] == 'quick'   # a fast smoke test: one piece per family, coarse
HI = 5 if QUICK else 7
os.makedirs(OUT, exist_ok=True)

# family: (count, LOD0 triangles, typical size in m — sets the texel share in the atlas)
FAMILIES = {
    'hide':      (8, 3200, 9.0),
    'ruin':      (6, 700, 2.4),
    'sandstone': (4, 1100, 1.8),
    'sand':      (4, 1200, 5.0),
    'thorn':     (3, 500, 1.6),
}
LOD1 = 0.33

def V(x, y, z): return Vector((x, y, z))
def fbm(p, oct=5, lac=2.0, gain=0.5):
    a, f, s = 1.0, 1.0, 0.0
    for _ in range(oct):
        s += a * noise.noise(p * f, noise_basis='PERLIN_NEW'); a *= gain; f *= lac
    return s
def vor(p):
    d, _ = noise.voronoi(p, distance_metric='DISTANCE', exponent=2.5)
    return d[0], d[1]

def icosphere(level):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=level, radius=1.0)
    return bm

def cube_grid(level):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for _ in range(level):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm

# --- the sculptors (game frame: g = (x, y up, z forward)) -------------------------------------

def sculpt_hide(g, r):
    """A worn sandstone mass: strata ledges (hard beds stand proud, soft ones recess), vertical
    joints, tafoni (honeycomb weathering) on the flanks, wind polish underneath, fine grain."""
    sq = V(1.0, 0.82 + 0.12 * r['a'], 1.0)
    off = V(r['ox'], r['oy'], r['oz'])
    k = 6 + int(r['b'] * 4)                        # beds across the height
    hard = [random.Random(int(r['seed'] * 977) + i).random() for i in range(64)]
    def f(p):
        n = p.normalized()
        q = Vector((n.x * sq.x, n.y * sq.y, n.z * sq.z))
        rad = 1.0 + 0.13 * fbm(n * 1.1 + off, 3) + 0.05 * fbm(n * 2.7 + off * 2.0, 3)
        # Bedding: height warped a little, quantised into beds with undercut ledges.
        h = (q.y * rad + 0.08 * fbm(n * 1.7 + off, 2)) * 0.5 + 0.5
        b = h * k; bi = int(math.floor(b)) % 64; t = b - math.floor(b)
        hd = hard[bi]
        side = max(0.0, 1.0 - abs(n.y) * 1.25)     # ledges show on the flanks, not on top
        ledge = (0.035 + 0.05 * hd) * (1.0 - math.pow(t, 3.0)) - 0.05 * (1.0 - hd)
        rad += ledge * side
        # Bed seams: a thin groove at each boundary.
        rad -= 0.022 * side * math.exp(-((t if t < 0.5 else 1.0 - t) * 18.0) ** 2)
        # Joints: vertical cracks from voronoi edges in xz.
        d0, d1 = vor(V(n.x * 2.2, n.y * 0.35, n.z * 2.2) + off)
        rad -= 0.03 * side * math.exp(-((d1 - d0) * 14.0) ** 2)
        # Tafoni: rounded hollows clustered on the flanks and under ledges.
        mask = max(0.0, fbm(n * 1.6 + off * 3.0, 2) + 0.15) * side
        t0, t1 = vor(n * 5.5 + off * 1.7)
        rad -= 0.06 * mask * max(0.0, 1.0 - t0 * 2.2) ** 2
        # Underside: wind polish (smoother, tucked in).
        if n.y < -0.3: rad -= 0.04 * (-n.y - 0.3)
        # Grain and pitting.
        rad += 0.006 * noise.noise(n * 40.0 + off) + 0.004 * noise.noise(n * 95.0)
        return Vector((q.x * rad, q.y * rad, q.z * rad)) * 0.98
    return f

def rounded_box(q, half, rr):
    c = Vector((max(-half[0] + rr, min(half[0] - rr, q.x)), max(-half[1] + rr, min(half[1] - rr, q.y)), max(-half[2] + rr, min(half[2] - rr, q.z))))
    d = q - c
    return c + (d.normalized() * rr if d.length > 1e-9 else d)

def sculpt_block(g, r, strata):
    """Carved stone: a bevelled block with chipped edges and corners, edge wear, pitting; sandstone
    adds bedding grooves, ruin adds a worn incised border."""
    half = (0.86, 0.86, 0.86)
    rr = 0.07 + 0.05 * r['a']
    off = V(r['ox'], r['oy'], r['oz'])
    rng = random.Random(int(r['seed'] * 1000))
    chips = []
    for _ in range(9 + int(r['b'] * 6)):
        # On an edge or corner: two or three coordinates at the limit.
        c = [rng.choice((-1, 1)) * 0.86, rng.choice((-1, 1)) * 0.86, rng.uniform(-0.86, 0.86)]
        rng.shuffle(c)
        if rng.random() < 0.3: c = [rng.choice((-1, 1)) * 0.86 for _ in range(3)]
        chips.append((Vector(c), rng.uniform(0.12, 0.3)))
    def f(p):
        q = V(p.x * 0.86, p.y * 0.86, p.z * 0.86)
        s = rounded_box(q, half, rr)
        nrm = (q - Vector((max(-0.86 + rr, min(0.86 - rr, q.x)), max(-0.86 + rr, min(0.86 - rr, q.y)), max(-0.86 + rr, min(0.86 - rr, q.z))))).normalized()
        # Edge factor: 1 on the bevels and near edges.
        ax = sorted([abs(s.x) / 0.86, abs(s.y) / 0.86, abs(s.z) / 0.86])
        edge = max(0.0, (ax[1] - 0.82) / 0.18)
        dent = 0.0
        for c, cr in chips:
            dd = (s - c).length
            if dd < cr:
                w = 1.0 - dd / cr
                dent = max(dent, cr * 0.55 * math.sqrt(w) * (0.8 + 0.4 * noise.noise(s * 9.0 + c * 3.0)))
        dent += edge * 0.035 * max(0.0, fbm(s * 4.0 + off, 3) + 0.3)
        dent += 0.008 * max(0.0, noise.noise(s * 30.0 + off)) + 0.004 * noise.noise(s * 80.0)
        if strata:
            h = s.y + 0.05 * fbm(s * 2.0 + off, 2)
            t = (h * 4.5) % 1.0
            dent += 0.025 * math.exp(-((t if t < 0.5 else 1.0 - t) * 14.0) ** 2) * (1.0 - abs(nrm.y))
            dent += 0.012 * fbm(V(s.x * 0.5, s.y * 14.0, s.z * 0.5) + off, 2)
        else:
            # A worn incised border on the broad faces.
            for a in range(3):
                if abs(nrm[a]) > 0.9:
                    u = [abs(s[i]) for i in range(3) if i != a]
                    m = max(u)
                    dent += 0.018 * math.exp(-((m - 0.62) * 40.0) ** 2) * max(0.0, 0.6 + noise.noise(s * 3.0 + off))
        return s - nrm * dent
    return f

def sculpt_sand(g, r):
    """Packed, drifted sand: a soft heaped lump, slumped toward the base, faint wind ripples on
    the upper faces, soft tongues running down the flanks."""
    off = V(r['ox'], r['oy'], r['oz'])
    def f(p):
        n = p.normalized()
        rad = 1.0 + 0.12 * fbm(n * 1.0 + off, 3)
        if n.y < 0: rad += 0.06 * (-n.y)                         # slumped, fuller below
        up = max(0.0, n.y)
        rip = math.sin((n.x * 0.8 + n.z * 0.6) * 38.0 + 3.0 * fbm(n * 2.0 + off, 2))
        rad += 0.004 * up * rip
        # Drip tongues down the flanks (soft, wide: these chunks are stretched 4:1 in the game).
        rad += 0.02 * (1.0 - up) * max(0.0, noise.noise(V(n.x * 5.0, n.y * 0.6, n.z * 5.0) + off))
        rad += 0.003 * noise.noise(n * 70.0)
        return n * rad * 0.97
    return f

def sculpt_thorn(g, r):
    """A sandstone thorn: tapers toward -z, twisted ridges and grooves, a cracked worn tip."""
    off = V(r['ox'], r['oy'], r['oz'])
    tw = 1.5 + 2.0 * r['a']
    def f(p):
        n = p.normalized()
        t = 1.0 - 0.85 * max(-n.z, 0.0)
        ang = math.atan2(n.y, n.x) + n.z * tw
        rad = 1.0 + 0.05 * math.sin(ang * 7.0) + 0.06 * fbm(n * 1.5 + off, 3) + 0.004 * noise.noise(n * 60.0)
        d0, d1 = vor(n * 4.0 + off)
        rad -= 0.03 * math.exp(-((d1 - d0) * 12.0) ** 2)
        return Vector((n.x * t * rad, n.y * t * rad, n.z * rad)) * 0.98
    return f

# --- the pipeline ------------------------------------------------------------------------------

def to_blender(g): return Vector((g.x, -g.z, g.y))          # game (y up, z fwd) -> Blender (z up)

def build_high(fam, idx):
    rnd = random.Random(zlib.crc32(f'{fam}:{idx}'.encode()))
    r = {'a': rnd.random(), 'b': rnd.random(), 'ox': rnd.uniform(-50, 50), 'oy': rnd.uniform(-50, 50), 'oz': rnd.uniform(-50, 50), 'seed': rnd.random()}
    if fam in ('ruin', 'sandstone'):
        bm = cube_grid(HI); f = sculpt_block(None, r, fam == 'sandstone')
    else:
        bm = icosphere(HI + 1)   # bmesh levels: 7 → 82k faces, 8 → 328k
        f = {'hide': sculpt_hide, 'sand': sculpt_sand, 'thorn': sculpt_thorn}[fam](None, r)
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
    for size, name in ((ATLAS, 'walker-pieces'), (ATLAS // 2, 'walker-pieces-2k')):
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
    for fam, i, hi, lo, size in pairs: bpy.data.objects.remove(hi)
    for o in lows: o.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in lows: o.select_set(True); o.data.materials.clear()
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'walker-pieces.glb'), use_selection=True,
        export_format='GLB', export_materials='NONE', export_normals=True,
        export_apply=True, export_yup=True)
    for o in lows: print('piece', o.name, len(o.data.polygons))
    print('DONE', flush=True)

main()
