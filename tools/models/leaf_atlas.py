# The broadleaf rows of the leaf atlas from scanned leaves (docs/realism-plan.md A2): run headless in
# Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/leaf_atlas.py -- <out_dir> <oak_set_dir> <birch_set_dir> [cell_px]
#
# The set dirs are ambientCG leaf atlases (CC0): LeafSet016 (oak) and LeafSet014 (birch), 2K-JPG,
# each six photographed leaves on black with Color / Opacity / NormalGL / Displacement maps.
#
# Each atlas cell is one spray, as a production foliage card is: a short woody stem with a few side
# shoots, real-size leaves along and at the ends of the shoots (oak: crowded rosettes at the shoot
# tips, lobed; birch: small toothed leaves alternate along drooping shoots), each leaf a curled,
# folded blade turned a little off the card. Gaps between the leaves let the crown behind show, so a
# crown of these cards reads as foliage rather than as a stack of filled sprites.
#
# Orthographic renders of each cell, emission only (no lighting baked in):
#   leaf-broadleaf.webp          colour (sRGB) + alpha cut-out
#   leaf-broadleaf-surface.webp  rg = normal xy in card space (0.5 flat), b = thickness (veins and
#                                twigs block light, the blade passes it), a = 1
# Both 4 cells × 2 rows (row 0 oak, row 1 birch): rows 1–2 of render/leafAtlas.js's 4×4 atlas.
# Card frame (world/trees/generator.js cluster()): u right, v up, the card hangs from v = 0.15.

import bpy, sys, os, math, random
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
OUT, OAK, BIRCH = a[0], a[1], a[2]
CELL = int(a[3]) if len(a) > 3 else 1024
os.makedirs(OUT, exist_ok=True)

def find(dirp, suffix):
    for f in os.listdir(dirp):
        if f.endswith(suffix): return os.path.join(dirp, f)
    raise FileNotFoundError(dirp + ' ' + suffix)

def leaf_rects(opacity_path):
    """The photographed leaves' rectangles in the atlas (uv 0..1, v up): column runs, then row runs."""
    im = bpy.data.images.load(opacity_path); w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, im.channels)[..., 0] > 0.5
    def runs(mask, gap=6):
        idx = np.where(mask)[0]
        if not len(idx): return []
        out, s, p = [], idx[0], idx[0]
        for i in idx[1:]:
            if i - p > gap: out.append((s, p)); s = i
            p = i
        out.append((s, p)); return out
    rects = []
    for c0, c1 in runs(px.any(axis=0)):
        for r0, r1 in runs(px[:, c0:c1 + 1].any(axis=1)):
            if (c1 - c0) > 40 and (r1 - r0) > 40:
                rects.append((c0 / w, r0 / h, (c1 + 1) / w, (r1 + 1) / h))   # rows run bottom-up in Blender
    return rects

def leaf_material(name, d):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    col = nt.nodes.new('ShaderNodeTexImage'); col.image = bpy.data.images.load(find(d, '_Color.jpg'))
    op = nt.nodes.new('ShaderNodeTexImage'); op.image = bpy.data.images.load(find(d, '_Opacity.jpg')); op.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeTexImage'); nm.image = bpy.data.images.load(find(d, '_NormalGL.jpg')); nm.image.colorspace_settings.name = 'Non-Color'
    dp = nt.nodes.new('ShaderNodeTexImage'); dp.image = bpy.data.images.load(find(d, '_Displacement.jpg')); dp.image.colorspace_settings.name = 'Non-Color'
    for t in (col, op, nm, dp): nt.links.new(tc.outputs['UV'], t.inputs['Vector'])
    # Per-leaf variation: value and a little hue (age, light), from the object's random.
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.75; mr.inputs['To Max'].default_value = 1.12
    nt.links.new(oi.outputs['Random'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], hsv.inputs['Value'])
    hr = nt.nodes.new('ShaderNodeMapRange'); hr.inputs['To Min'].default_value = 0.48; hr.inputs['To Max'].default_value = 0.53
    nt.links.new(oi.outputs['Random'], hr.inputs['Value']); nt.links.new(hr.outputs['Result'], hsv.inputs['Hue'])
    nt.links.new(col.outputs['Color'], hsv.inputs['Color'])
    # The pass is picked by a value node: 0 colour, 1 normal, 2 thickness.
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs['Color'], nmap.inputs['Color'])
    enc = nt.nodes.new('ShaderNodeVectorMath'); enc.operation = 'MULTIPLY_ADD'
    enc.inputs[1].default_value = (0.5, 0.5, 0.5); enc.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(nmap.outputs['Normal'], enc.inputs[0])
    th = nt.nodes.new('ShaderNodeMapRange'); th.inputs['From Min'].default_value = 0.45; th.inputs['From Max'].default_value = 0.85
    th.inputs['To Min'].default_value = 0.18; th.inputs['To Max'].default_value = 0.75
    nt.links.new(dp.outputs['Color'], th.inputs['Value'])
    return m, nt, out, hsv, enc, th, op

def twig_material():
    m = bpy.data.materials.new('twig'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    enc = nt.nodes.new('ShaderNodeVectorMath'); enc.operation = 'MULTIPLY_ADD'
    enc.inputs[1].default_value = (0.5, 0.5, 0.5); enc.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Normal'], enc.inputs[0])
    return m, nt, out, enc

PASS = {'mode': 0}
def wire_pass(mats, mode):
    """Rewire every material's output for the pass: 0 colour (+ alpha), 1 normal, 2 thickness."""
    for kind, parts in mats:
        nt, out = parts[1], parts[2]
        for l in list(out.inputs['Surface'].links): nt.links.remove(l)
        for n in [n for n in nt.nodes if n.label == 'pass']: nt.nodes.remove(n)
        em = nt.nodes.new('ShaderNodeEmission'); em.label = 'pass'
        if kind == 'leaf':
            _, _, _, hsv, enc, th, op = parts
            src = hsv.outputs['Color'] if mode == 0 else enc.outputs[0] if mode == 1 else th.outputs['Result']
            nt.links.new(src, em.inputs['Color'])
            tr = nt.nodes.new('ShaderNodeBsdfTransparent'); tr.label = 'pass'
            mix = nt.nodes.new('ShaderNodeMixShader'); mix.label = 'pass'
            nt.links.new(op.outputs['Color'], mix.inputs['Fac'])
            nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs['Surface'])
        else:
            _, _, _, enc = parts
            if mode == 0: em.inputs['Color'].default_value = (0.055, 0.04, 0.026, 1)   # grey-brown twig (linear)
            elif mode == 1: nt.links.new(enc.outputs[0], em.inputs['Color'])
            else: em.inputs['Color'].default_value = (1, 1, 1, 1)
            nt.links.new(em.outputs[0], out.inputs['Surface'])

def leaf_mesh(name, rect, L, R, fold, curl, mat):
    """A leaf blade: base at the origin, along +y, L long; folded along the midrib and curled."""
    u0, v0, u1, v1 = rect
    W = L * (u1 - u0) / (v1 - v0)
    nx, ny = 6, 10
    verts, uvs, faces = [], [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            s, t = i / nx, j / ny
            x = (s - 0.5) * W
            y = t * L
            z = -abs(s - 0.5) * 2 * fold * W * 0.5 + curl * L * t * t        # V along the midrib; droop/curl to the tip
            verts.append((x, y, z)); uvs.append((u0 + s * (u1 - u0), v0 + t * (v1 - v0)))
    for j in range(ny):
        for i in range(nx):
            k = j * (nx + 1) + i
            faces.append((k, k + 1, k + nx + 2, k + nx + 1))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new()
    for poly in me.polygons:
        for li in poly.loop_indices: uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def twig(points, r0, r1, mat, name):
    """A tapered tube through points (Vector list)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.32; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (p.x, p.y, p.z, 1); sp.points[i].radius = r0 + (r1 - r0) * i / (len(points) - 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    cu.materials.append(mat)
    return ob

def bezier(p0, p1, p2, n):
    return [p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t * t for t in (k / (n - 1) for k in range(n))]

def place_leaf(R, rects, mat, at, direction, L, name, fold, curl):
    ob = leaf_mesh(name, R.choice(rects), L, R, fold, curl, mat)
    d = direction.normalized()
    ang = math.atan2(-d.x, d.y)                                  # rotate +y onto the direction (in the card plane)
    tilt = R.uniform(-0.9, 0.9)                                  # turned about its own axis (foreshortened)
    lean = R.uniform(-0.5, 0.35)                                 # toward / away from the viewer
    ob.matrix_world = Matrix.Translation(at) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(lean, 4, 'X') @ Matrix.Rotation(tilt, 4, 'Y')
    return ob

def spray(kind, seed, rects, leaf_mat, twig_mat, x0):
    """One cell's spray, in card space translated to x0 (cells side by side along x, 1 unit each)."""
    R = random.Random(seed)
    base = Vector((x0 + 0.5, 0.12, 0))
    oak = kind == 'oak'
    top = Vector((x0 + 0.5 + R.uniform(-0.12, 0.12), R.uniform(0.78, 0.9), 0))
    mid = (base + top) * 0.5 + Vector((R.uniform(-0.1, 0.1), 0, 0))
    stem = bezier(base, mid, top, 8)
    twig(stem, 0.0065, 0.002, twig_mat, f'stem{seed}')
    shoots = [stem]
    ns = R.randint(4, 6) if oak else R.randint(5, 7)
    for k in range(ns):
        t = 0.25 + 0.6 * (k + R.random()) / ns
        i = min(len(stem) - 2, int(t * (len(stem) - 1)))
        p = stem[i]; side = 1 if k % 2 else -1
        if oak:
            d = Vector((side * R.uniform(0.6, 1.0), R.uniform(0.35, 0.8), 0)).normalized()
            Ls = R.uniform(0.22, 0.34)
            e = p + d * Ls; m = p + d * Ls * 0.5 + Vector((0, R.uniform(0.0, 0.06), 0))
        else:
            # Birch: shoots arch out and droop.
            d = Vector((side * R.uniform(0.7, 1.0), R.uniform(0.0, 0.35), 0)).normalized()
            Ls = R.uniform(0.25, 0.38)
            m = p + d * Ls * 0.55 + Vector((0, 0.05, 0)); e = p + d * Ls + Vector((0, -R.uniform(0.08, 0.2), 0))
        e.x = min(max(e.x, x0 + 0.08), x0 + 0.92); e.y = min(max(e.y, 0.1), 0.95)
        pts = bezier(p, m, e, 6 if oak else 9)
        twig(pts, 0.0035, 0.0012, twig_mat, f'shoot{seed}_{k}')
        shoots.append(pts)
    n = 0
    for s, pts in enumerate(shoots):
        if oak:
            # Oak: leaves crowd at the shoot's tip (a rosette), a few along it.
            tip = pts[-1]; dirn = (pts[-1] - pts[-2]).normalized()
            for k in range(R.randint(7, 10)):
                a = (k / 8.0 - 0.5) * 4.2 + R.uniform(-0.3, 0.3)
                d = Matrix.Rotation(a, 3, 'Z') @ dirn
                place_leaf(R, rects, leaf_mat, tip + Vector((R.uniform(-0.02, 0.02), R.uniform(-0.02, 0.02), R.uniform(-0.04, 0.04))), d, R.uniform(0.085, 0.12), f'l{seed}_{n}', R.uniform(0.15, 0.4), R.uniform(-0.25, 0.15)); n += 1
            for k in range(R.randint(2, 4)):
                i = R.randint(1, len(pts) - 2); d = Matrix.Rotation(R.choice((-1, 1)) * R.uniform(0.6, 1.1), 3, 'Z') @ (pts[i + 1] - pts[i]).normalized()
                place_leaf(R, rects, leaf_mat, pts[i], d, R.uniform(0.07, 0.1), f'l{seed}_{n}', R.uniform(0.15, 0.4), R.uniform(-0.25, 0.15)); n += 1
        else:
            # Birch: small leaves alternate along the shoot, hanging.
            for i in range(1, len(pts)):
                for side in ((-1, 1) if R.random() < 0.45 else (-1,) if i % 2 else (1,)):
                    d = (pts[i] - pts[i - 1]).normalized()
                    d = (Matrix.Rotation(side * R.uniform(0.5, 1.0), 3, 'Z') @ d + Vector((0, -0.6, 0))).normalized()
                    place_leaf(R, rects, leaf_mat, pts[i], d, R.uniform(0.05, 0.068), f'l{seed}_{n}', R.uniform(0.1, 0.3), R.uniform(-0.2, 0.2)); n += 1
            tip = pts[-1]; d = (pts[-1] - pts[-2]).normalized()
            place_leaf(R, rects, leaf_mat, tip, d, 0.06, f'l{seed}_{n}', 0.2, 0.0); n += 1
    print('spray', kind, seed, 'leaves', n, flush=True)

def main():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.max_bounces = 0; sc.cycles.transparent_max_bounces = 32
    sc.cycles.use_denoising = False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception as e: print('cpu', e)
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = CELL * 4, CELL * 2
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 4.0
    cam.location = (2.0, 1.0, 5.0); cam.rotation_euler = (0, 0, 0)
    mats = []
    for row, (kind, d) in enumerate((('oak', OAK), ('birch', BIRCH))):
        rects = leaf_rects(find(d, '_Opacity.jpg'))
        print(kind, 'leaves in the scan', len(rects), flush=True)
        lm = leaf_material(kind, d); tm = twig_material()
        mats += [('leaf', lm), ('twig', tm)]
        for v in range(4):
            # Row 0 (oak) on top of the image = atlas row 1; birch below.
            spray(kind, 1000 * row + v * 17 + 3, rects, lm[0], tm[0], v)
            for o in [o for o in bpy.data.objects if o.get('placed') is None and o.type in ('MESH', 'CURVE')]:
                o['placed'] = 1
                o.location.y += 1.0 if row == 0 else 0.0
    results = {}
    for mode, name in ((0, 'colour'), (1, 'normal'), (2, 'thick')):
        wire_pass(mats, mode)
        sc.view_settings.view_transform = 'Standard' if mode == 0 else 'Raw'
        sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
        sc.render.filepath = os.path.join(OUT, f'_pass_{name}.png')
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(sc.render.filepath); im.colorspace_settings.name = 'Non-Color'   # the stored values, unconverted
        results[name] = np.array(im.pixels[:], dtype=np.float32).reshape(CELL * 2, CELL * 4, 4)
    col, nrm, thk = results['colour'], results['normal'], results['thick']
    alpha = col[..., 3]
    # Bleed colour into the transparent texels (mipmaps average across the cut-out edge: no dark fringe).
    rgb = col[..., :3].copy(); w = (alpha > 0.5).astype(np.float32)
    acc, wacc = rgb * w[..., None], w.copy()
    for _ in range(24):
        acc = (acc + np.roll(acc, 1, 0) + np.roll(acc, -1, 0) + np.roll(acc, 1, 1) + np.roll(acc, -1, 1)) / 5
        wacc = (wacc + np.roll(wacc, 1, 0) + np.roll(wacc, -1, 0) + np.roll(wacc, 1, 1) + np.roll(wacc, -1, 1)) / 5
    fill = acc / np.maximum(wacc[..., None], 1e-4)
    rgb = np.where(alpha[..., None] > 0.5, rgb, np.where(wacc[..., None] > 1e-3, fill, rgb))
    # Colour is display-referred sRGB from the Standard transform, straight alpha (dividing again by alpha
    # made white halos at the cut-out edges).
    out = np.concatenate([rgb, alpha[..., None]], -1)
    out = np.clip(out, 0, 1)
    surf = np.ones_like(out)
    n_ = nrm[..., :3]
    surf[..., 0] = np.where(alpha > 0.05, n_[..., 0], 0.5); surf[..., 1] = np.where(alpha > 0.05, n_[..., 1], 0.5)
    surf[..., 2] = np.where(alpha > 0.05, thk[..., 0], 0.25)
    for arr, name, cs in ((out, 'leaf-broadleaf', 'Non-Color'), (surf, 'leaf-broadleaf-surface', 'Non-Color')):
        img = bpy.data.images.new(name, CELL * 4, CELL * 2, alpha=True)
        img.colorspace_settings.name = cs
        img.pixels[:] = arr.ravel()
        sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 100; sc.render.image_settings.color_mode = 'RGBA'
        sc.view_settings.view_transform = 'Standard'
        img.filepath_raw = os.path.join(OUT, name + '.png'); img.file_format = 'PNG'; img.save()
    print('DONE', flush=True)

main()
