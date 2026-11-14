# The pine row of the leaf atlas (docs/realism-plan.md A2): run headless in Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/needle_atlas.py -- <out_dir> [cell_px]
#
# No scan fits (ambientCG's needle set is a cypress spray), so the needles are modelled: a Scots pine
# shoot is a woody stem clothed all round in paired needles (fascicles of two, 4–7 cm, pointing forward
# at 35–55°), thickest toward the tip, which ends in a tuft round the bud; a spray is a stem with a few
# such side shoots. Each needle is a thin blade folded along its length (so its normal turns across
# it), dark blue-green, paler toward the tip; the shoots are orange-brown.
#
# Orthographic renders, emission only (as tools/models/leaf_atlas.py):
#   leaf-pine.webp           colour (sRGB) + alpha       4 cells × 1 row: render/leafAtlas.js row 0
#   leaf-pine-surface.webp   rg card-space normal, b thickness
# Card frame (world/trees/generator.js cluster()): u right, v up, hung from v = 0.15; the card runs
# along the branch, so the spray grows up the cell.

import bpy, bmesh, sys, os, math, random
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
OUT = a[0]; CELL = int(a[1]) if len(a) > 1 else 1024
os.makedirs(OUT, exist_ok=True)

def bezier(p0, p1, p2, n):
    return [p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t * t for t in (k / (n - 1) for k in range(n))]

def needle(bm, col, thk, base, d, side, L, W, c):
    """A folded blade from base along d (unit), its width along side; colour c (base) to a paler tip."""
    up = d.cross(side).normalized()
    ring = []
    for t in (0.0, 0.45, 1.0):
        w = W * (1.0 - 0.75 * t) if t > 0 else W * 0.7
        p = base + d * L * t
        ring.append((bm.verts.new(p - side * w), bm.verts.new(p + up * w * 0.6), bm.verts.new(p + side * w)))
    tip_c = (min(1, c[0] * 1.35 + 0.02), min(1, c[1] * 1.3 + 0.02), c[2] * 1.05, 1)
    for j in range(2):
        for (a0, a1), (b0, b1) in (((ring[j][0], ring[j][1]), (ring[j + 1][0], ring[j + 1][1])), ((ring[j][1], ring[j][2]), (ring[j + 1][1], ring[j + 1][2]))):
            f = bm.faces.new((a0, a1, b1, b0))
            for lp in f.loops:
                t = (lp.vert.co - base).dot(d) / L
                cc = [c[k] + (tip_c[k] - c[k]) * max(0.0, t) for k in range(3)]
                lp[col] = (cc[0], cc[1], cc[2], 1.0)
                lp[thk] = (0.42, 0.42, 0.42, 1.0)

def shoot(bm, col, thk, R, pts, needles_per_unit, Lr):
    """Needles along a shoot (a polyline), denser and longer toward its tip; a tuft at the tip."""
    total = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
    n = int(total * needles_per_unit)
    acc = [0.0]
    for i in range(len(pts) - 1): acc.append(acc[-1] + (pts[i + 1] - pts[i]).length)
    for k in range(n):
        s = (k + R.random()) / n
        s = 0.38 + 0.62 * s ** 0.7                       # older wood bare; the needles brush the outer shoot
        dist = s * total
        i = max(0, min(len(pts) - 2, next(j for j in range(len(acc) - 1) if acc[j + 1] >= dist)))
        f = (dist - acc[i]) / max(acc[i + 1] - acc[i], 1e-6)
        p = pts[i].lerp(pts[i + 1], f); d = (pts[i + 1] - pts[i]).normalized()
        for pair in range(2):
            az = R.uniform(0, math.tau)
            side0 = d.cross(Vector((0, 0, 1)))
            if side0.length < 1e-3: side0 = Vector((1, 0, 0))
            side0.normalize()
            perp = (Matrix.Rotation(az, 3, d) @ side0).normalized()
            ang = math.radians(R.uniform(40, 72) * (1.0 - 0.35 * s))
            nd = (d * math.cos(ang) + perp * math.sin(ang)).normalized()
            nd = (nd + Vector((R.uniform(-0.1, 0.1), R.uniform(-0.1, 0.1), R.uniform(-0.1, 0.1)))).normalized()
            L = Lr * R.uniform(0.85, 1.15) * (0.8 + 0.3 * s)
            side = nd.cross(Vector((0, 0, 1)))
            if side.length < 1e-3: side = Vector((1, 0, 0))
            side.normalize()
            v = R.uniform(0.7, 1.25); y = R.uniform(0.0, 0.25)
            c = (0.028 * v * (1 + y), 0.058 * v, 0.03 * v * (1 - y))          # linear: deep blue-green
            needle(bm, col, thk, p + perp * 0.002, nd, side, L, 0.0019, c)
    tip = pts[-1]; d = (pts[-1] - pts[-2]).normalized()
    for k in range(int(needles_per_unit * 0.05)):       # the tuft round the bud
        az = R.uniform(0, math.tau); side0 = d.cross(Vector((0, 0, 1))).normalized()
        perp = (Matrix.Rotation(az, 3, d) @ side0).normalized()
        ang = math.radians(R.uniform(15, 40))
        nd = (d * math.cos(ang) + perp * math.sin(ang)).normalized()
        side = nd.cross(Vector((0, 0, 1)))
        if side.length < 1e-3: side = Vector((1, 0, 0))
        side.normalize()
        v = R.uniform(0.9, 1.2)
        needle(bm, col, thk, tip, nd, side, Lr * R.uniform(0.75, 1.0), 0.0017, (0.03 * v, 0.06 * v, 0.032 * v))

def twig(points, r0, r1, name):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.32; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (p.x, p.y, p.z, 1); sp.points[i].radius = r0 + (r1 - r0) * i / (len(points) - 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    return ob

def spray(seed, x0, bm, col, thk, twigs):
    R = random.Random(seed)
    base = Vector((x0 + 0.5, 0.1, 0))
    top = Vector((x0 + 0.5 + R.uniform(-0.1, 0.1), R.uniform(0.86, 0.94), 0))
    mid = (base + top) * 0.5 + Vector((R.uniform(-0.08, 0.08), 0, 0))
    stem = bezier(base, mid, top, 10)
    twigs.append((stem, 0.008, 0.003))
    shoots = [stem]
    ns = R.randint(4, 6)
    for k in range(ns):
        t = 0.2 + 0.65 * (k + R.random()) / ns
        i = min(len(stem) - 2, int(t * (len(stem) - 1)))
        p = stem[i]; sgn = 1 if k % 2 else -1
        d = Vector((sgn * R.uniform(0.55, 0.9), R.uniform(0.45, 0.85), R.uniform(-0.2, 0.2))).normalized()
        Ls = R.uniform(0.2, 0.34) * (1.0 - 0.4 * t)
        e = p + d * Ls; e.x = min(max(e.x, x0 + 0.08), x0 + 0.92); e.y = min(e.y, 0.95)
        m = (p + e) * 0.5 + Vector((0, 0.02, 0))
        pts = bezier(p, m, e, 6); twigs.append((pts, 0.0045, 0.002)); shoots.append(pts)
    for s, pts in enumerate(shoots):
        shoot(bm, col, thk, R, pts, 760 if s == 0 else 640, 0.072)

def main():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.max_bounces = 0; sc.cycles.transparent_max_bounces = 16
    sc.cycles.use_denoising = False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception as e: print('cpu', e)
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = CELL * 4, CELL
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 4.0; cam.location = (2.0, 0.5, 5.0)
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('col'); thk = bm.loops.layers.float_color.new('thk')
    twigs = []
    for v in range(4): spray(7001 + v * 13, v, bm, col, thk, twigs)
    me = bpy.data.meshes.new('needles'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    ob = bpy.data.objects.new('needles', me); sc.collection.objects.link(ob)
    print('needle faces', len(me.polygons), flush=True)
    tw = [twig(p, r0, r1, f't{i}') for i, (p, r0, r1) in enumerate(twigs)]
    # Materials: needles from the vertex colours, twigs flat orange-brown; the pass picked by rewiring.
    mn = bpy.data.materials.new('needle'); mn.use_nodes = True; me.materials.append(mn)
    mt = bpy.data.materials.new('twig'); mt.use_nodes = True
    for o in tw: o.data.materials.append(mt)
    def wire(m, mode, needle_mat):
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        if mode == 1:
            geo = nt.nodes.new('ShaderNodeNewGeometry'); enc = nt.nodes.new('ShaderNodeVectorMath'); enc.operation = 'MULTIPLY_ADD'
            enc.inputs[1].default_value = (0.5, 0.5, 0.5); enc.inputs[2].default_value = (0.5, 0.5, 0.5)
            nt.links.new(geo.outputs['Normal'], enc.inputs[0]); nt.links.new(enc.outputs[0], em.inputs['Color'])
        elif needle_mat:
            at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'col' if mode == 0 else 'thk'
            nt.links.new(at.outputs['Color'], em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = (0.09, 0.045, 0.022, 1) if mode == 0 else (1, 1, 1, 1)
    res = {}
    for mode, name in ((0, 'colour'), (1, 'normal'), (2, 'thick')):
        wire(mn, mode, True); wire(mt, mode, False)
        sc.view_settings.view_transform = 'Standard' if mode == 0 else 'Raw'
        sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
        sc.render.filepath = os.path.join(OUT, f'_pine_{name}.png')
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(sc.render.filepath); im.colorspace_settings.name = 'Non-Color'
        res[name] = np.array(im.pixels[:], dtype=np.float32).reshape(CELL, CELL * 4, 4)
    colr, nrm, th = res['colour'], res['normal'], res['thick']
    alpha = colr[..., 3]
    rgb = colr[..., :3].copy(); w = (alpha > 0.5).astype(np.float32)
    acc, wacc = rgb * w[..., None], w.copy()
    for _ in range(16):
        acc = (acc + np.roll(acc, 1, 0) + np.roll(acc, -1, 0) + np.roll(acc, 1, 1) + np.roll(acc, -1, 1)) / 5
        wacc = (wacc + np.roll(wacc, 1, 0) + np.roll(wacc, -1, 0) + np.roll(wacc, 1, 1) + np.roll(wacc, -1, 1)) / 5
    fill = acc / np.maximum(wacc[..., None], 1e-4)
    rgb = np.where(alpha[..., None] > 0.5, rgb, np.where(wacc[..., None] > 1e-3, fill, rgb))
    out = np.clip(np.concatenate([rgb, alpha[..., None]], -1), 0, 1)
    surf = np.ones_like(out)
    surf[..., 0] = np.where(alpha > 0.05, nrm[..., 0], 0.5); surf[..., 1] = np.where(alpha > 0.05, nrm[..., 1], 0.5)
    surf[..., 2] = np.where(alpha > 0.05, th[..., 0], 0.25)
    for arr, name in ((out, 'leaf-pine'), (surf, 'leaf-pine-surface')):
        img = bpy.data.images.new(name, CELL * 4, CELL, alpha=True); img.colorspace_settings.name = 'Non-Color'
        img.pixels[:] = arr.ravel()
        sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 100; sc.render.image_settings.color_mode = 'RGBA'
        sc.view_settings.view_transform = 'Standard'
        img.save_render(os.path.join(OUT, name + '.webp'), scene=sc)
        img.filepath_raw = os.path.join(OUT, name + '.png'); img.file_format = 'PNG'; img.save()
    print('DONE', flush=True)

main()
