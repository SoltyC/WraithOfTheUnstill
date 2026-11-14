# The asset pipeline's shared half (docs/realism-plan.md A1), imported by every piece script
# (outcrop_pieces.py, boulder_pieces.py, …) running headless in Blender 5.2:
#
#   sculpt (seeded Python, in the game frame, + a per-vertex "feature" mask the sculptor knows:
#   joints, bed seams, cracks) → decimate to LOD0 → one shared UV atlas at an even texel density →
#   Cycles (OptiX) bakes from the high sculpt onto LOD0 → LOD1/LOD2 (same UVs) → GLB + atlases +
#   stats + a turntable.
#
# Atlases (lossless WebP, Non-Color):
#   <set>.webp        RG octahedral object-space normal (game frame), B ambient occlusion (reach 0.35)
#   <set>-mask.webp   R convexity (edges: 0.5 flat, 1 sharp ridge, 0 crease), G cavity (short-reach
#                     occlusion: cracks, pores, seams), B the sculptor's feature mask
#   both also at half size (-2k).
# Stats: <set>-stats.json (triangles per LOD, size, texel density in px/m, atlas fill); the AAA
# checklist's numbers (docs/realism-plan.md). Turntable: tools/models/preview.py on LOD0.

import bpy, bmesh, math, os, json, random, zlib
import numpy as np
from mathutils import Vector, Matrix, noise

def V(x, y, z): return Vector((x, y, z))
def fbm(p, oct=5, lac=2.0, gain=0.5):
    a, f, s = 1.0, 1.0, 0.0
    for _ in range(oct):
        s += a * noise.noise(p * f, noise_basis='PERLIN_NEW'); a *= gain; f *= lac
    return s
def ridged(p, oct=4):
    a, f, s = 1.0, 1.0, 0.0
    for _ in range(oct):
        s += a * (1.0 - abs(noise.noise(p * f, noise_basis='PERLIN_NEW'))); a *= 0.5; f *= 2.1
    return s
def vor(p, exp=2.5):
    d, _ = noise.voronoi(p, distance_metric='DISTANCE', exponent=exp)
    return d[0], d[1]
def cube_grid(level):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for _ in range(level):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm
def to_blender(g): return Vector((g.x, -g.z, g.y))           # game (y up, z fwd) -> Blender (z up)
def to_game(b): return Vector((b.x, b.z, -b.y))
def rng_for(fam, idx):
    return random.Random(zlib.crc32(f'{fam}:{idx}'.encode()))

def reset_scene():
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
    return sc

def build_high(name, level, f):
    """A sculpt: a subdivided cube pushed through f(game point) -> (game point, feature 0..1)."""
    bm = cube_grid(level)
    feats = []
    for v in bm.verts:
        p, k = f(to_game(v.co))
        v.co = to_blender(p); feats.append(k)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ca = me.color_attributes.new('feature', 'FLOAT_COLOR', 'POINT')
    for i, k in enumerate(feats): ca.data[i].color = (k, k, k, 1.0)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
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
    for a in list(ob.data.color_attributes): ob.data.color_attributes.remove(a)
    return ob

def pack_uvs(pairs):
    """pairs: [(name, hi, lo, size_m)]: unwrap every LOD0, pack into one atlas at an even density in metres."""
    bpy.ops.object.select_all(action='DESELECT')
    for _, hi, lo, size in pairs:
        lo.select_set(True); lo.scale = (size, size, size)
    bpy.context.view_layer.objects.active = pairs[0][2]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    # (55° and margins of 0.004/0.008 cut ten 4k-triangle sculpts into ~650 islands whose gaps took 90 %
    # of the atlas: 9 px/m on the outcrops. 66° and 0.003 fill ~70 %; the gap still covers the bake's
    # 6 px margin and two mips.)
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.001, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    for _, hi, lo, size in pairs:
        lo.data.transform(Matrix.Scale(1.0 / size, 4))

def _emit_material(name, build):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs[0])
    nt.links.new(build(nt), em.inputs[0])
    return m

def bake(sc, pairs, atlas, ao_reach=0.35, cavity_reach=0.035, samples=32):
    """All passes from the high sculpts onto the LOD0 atlas. Returns float arrays (H, W, 3/1)."""
    imgs = {k: bpy.data.images.new(k, atlas, atlas, float_buffer=True, alpha=False) for k in ('nrm', 'ao', 'cav', 'curv', 'feat')}
    low = bpy.data.materials.new('bake'); low.use_nodes = True
    node = low.node_tree.nodes.new('ShaderNodeTexImage'); low.node_tree.nodes.active = node
    # Convexity from Cycles' pointiness (per vertex of the dense sculpt), stretched around flat (0.5).
    def curv(nt):
        g = nt.nodes.new('ShaderNodeNewGeometry'); mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.44; mr.inputs['From Max'].default_value = 0.56
        nt.links.new(g.outputs['Pointiness'], mr.inputs['Value']); return mr.outputs['Result']
    def feat(nt):
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'feature'; return a.outputs['Color']
    m_curv, m_feat = _emit_material('curv', curv), _emit_material('feat', feat)
    for _, hi, lo, size in pairs:
        lo.data.materials.clear(); lo.data.materials.append(low)
        hi.data.materials.clear(); hi.data.materials.append(m_curv)
        # The low pieces must not occlude the high ones' rays (else the AO bakes black).
        lo.visible_diffuse = lo.visible_glossy = lo.visible_transmission = lo.visible_shadow = lo.visible_volume_scatter = False
    for k, (_, hi, lo, size) in enumerate(pairs):              # apart: one origin would self-occlude
        hi.location = lo.location = (k * 4.0, 0.0, 0.0)
    if sc.world is None: sc.world = bpy.data.worlds.new('w')
    bk = sc.render.bake
    bk.use_selected_to_active = True; bk.use_clear = False; bk.margin = 6; bk.margin_type = 'EXTEND'
    passes = (('nrm', 'NORMAL', 1, None, None), ('ao', 'AO', samples, ao_reach, None), ('cav', 'AO', max(8, samples // 2), cavity_reach, None),
              ('curv', 'EMIT', 1, None, m_curv), ('feat', 'EMIT', 1, None, m_feat))
    for key, kind, spp, reach, hm in passes:
        node.image = imgs[key]; sc.cycles.samples = spp
        if reach: sc.world.light_settings.distance = reach
        for name, hi, lo, size in pairs:
            if hm: hi.data.materials.clear(); hi.data.materials.append(hm)
            bpy.ops.object.select_all(action='DESELECT')
            hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
            bpy.ops.object.bake(type=kind, use_selected_to_active=True, use_clear=False, margin=6,
                                cage_extrusion=0.1, max_ray_distance=0.3, normal_space='OBJECT')
        print('baked', key, flush=True)
    arr = lambda k: np.array(imgs[k].pixels[:], dtype=np.float32).reshape(atlas, atlas, 4)
    return {'nrm': arr('nrm')[..., :3] * 2.0 - 1.0, 'ao': arr('ao')[..., 0], 'cav': arr('cav')[..., 0],
            'curv': arr('curv')[..., 0], 'feat': arr('feat')[..., 0]}

def oct_encode(n):
    """Object normal (Blender frame) -> game frame -> octahedral RG in 0..1."""
    g = np.stack([n[..., 0], n[..., 2], -n[..., 1]], -1)
    g /= np.maximum(np.abs(g).sum(-1, keepdims=True), 1e-6)
    ox, oy = g[..., 0].copy(), g[..., 1].copy()
    neg = g[..., 2] < 0
    sx = np.where(ox >= 0, 1.0, -1.0); sy = np.where(oy >= 0, 1.0, -1.0)
    ox2 = np.where(neg, (1.0 - np.abs(g[..., 1])) * sx, ox)
    oy2 = np.where(neg, (1.0 - np.abs(g[..., 0])) * sy, oy)
    return ox2 * 0.5 + 0.5, oy2 * 0.5 + 0.5

def save_atlas(sc, out_dir, name, r, g, b):
    a = r.shape[0]
    px = np.ones((a, a, 4), dtype=np.float32)
    px[..., 0], px[..., 1], px[..., 2] = np.clip(r, 0, 1), np.clip(g, 0, 1), np.clip(b, 0, 1)
    for size, suffix in ((a, ''), (a // 2, '-2k')):
        img = bpy.data.images.new(name + suffix, a, a, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        img.pixels[:] = px.ravel()
        if size != a: img.scale(size, size)
        sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 100
        sc.render.image_settings.color_mode = 'RGB'
        img.save_render(os.path.join(out_dir, name + suffix + '.webp'), scene=sc)

def write_atlases(sc, out_dir, set_name, maps):
    ox, oy = oct_encode(maps['nrm'])
    save_atlas(sc, out_dir, set_name, ox, oy, maps['ao'])
    save_atlas(sc, out_dir, set_name + '-mask', maps['curv'], maps['cav'], maps['feat'])

def _surface_and_uv(ob):
    me = ob.data; uv = me.uv_layers.active.data
    s = u = 0.0
    for p in me.polygons:
        s += p.area
        if len(p.loop_indices) == 3:
            a, b, c = (Vector(uv[i].uv) for i in p.loop_indices)
            u += abs((b - a).cross(c - a)) * 0.5
    return s, u

def finish(sc, out_dir, set_name, pairs, atlas, lod1=0.3, lod2=0.08):
    """LOD1/LOD2 from LOD0 (same UVs), export the game meshes, write stats, return them."""
    stats = {'set': set_name, 'atlas': atlas, 'pieces': []}
    fill = 0.0
    for name, hi, lo, size in pairs:
        s, u = _surface_and_uv(lo); fill += u
        m2 = s * (size * 0.5) ** 2                    # unit space spans ±1 = size metres
        stats['pieces'].append({'name': name, 'size_m': size, 'tris_high': len(hi.data.polygons), 'tris': [len(lo.data.polygons)],
                                'texel_px_per_m': round(atlas * math.sqrt(u / max(m2, 1e-9)), 1)})
    lows = []
    for (name, hi, lo, size), st in zip(pairs, stats['pieces']):
        l1 = decimated(lo, name.replace('_lod0', '') + '_lod1', max(60, int(len(lo.data.polygons) * lod1)))
        l2 = decimated(lo, name.replace('_lod0', '') + '_lod2', max(48, int(len(lo.data.polygons) * lod2)))
        st['tris'] += [len(l1.data.polygons), len(l2.data.polygons)]
        lows += [lo, l1, l2]
    stats['atlas_fill'] = round(fill, 3)
    stats['texel_px_per_m_min'] = min(p['texel_px_per_m'] for p in stats['pieces'])
    for name, hi, lo, size in pairs: bpy.data.objects.remove(hi)
    for o in lows: o.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in lows: o.select_set(True); o.data.materials.clear()
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, set_name + '.glb'), use_selection=True,
        export_format='GLB', export_materials='NONE', export_normals=True, export_apply=True, export_yup=True)
    with open(os.path.join(out_dir, set_name + '-stats.json'), 'w') as fh: json.dump(stats, fh, indent=1)
    print('STATS', json.dumps({k: stats[k] for k in ('set', 'atlas_fill', 'texel_px_per_m_min')}), flush=True)
    return stats
