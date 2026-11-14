# Limestone outcrops for the meadow (docs/meadow-overhaul.md M6, docs/realism-plan.md A1): run headless
# in Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/outcrop_pieces.py -- <out_dir> [atlas_px] [quick]
#
# Pale bedded limestone scarps, the rock that breaks through the forest on the meadow reference's hill
# (screenshots/reference/meadow-target.jpg), through the shared pipeline (tools/models/assetkit.py):
# outcrop-pieces.glb, .webp (normal + AO), -mask.webp (convexity, cavity, joints/seams), -stats.json.

import bpy, sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, noise
from assetkit import V, fbm, vor, rng_for, reset_scene, build_high, decimated, pack_uvs, bake, write_atlases, finish

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('outcrop-out')
ATLAS = int(argv[1]) if len(argv) > 1 else 4096
QUICK = len(argv) > 2 and argv[2] == 'quick'
HI = 5 if QUICK else 7
os.makedirs(OUT, exist_ok=True)

FAMILIES = { 'limestone': (10, 4000, 25.0) }

def sculpt_limestone(r):
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
        seam = side * math.exp(-((t if t < 0.5 else 1.0 - t) * 9.0) ** 2)
        recess += 0.025 * seam
        # Joints: deep vertical clefts from voronoi cell edges in xz.
        d0, d1 = vor(V(s.x * 1.6, 0.0, s.z * 1.6) + off)
        # (wide and rounded: narrow V-joints aliased on the ~20 cm sculpt grid into bright zigzag creases)
        joint = math.exp(-((d1 - d0) * 3.2) ** 2) * (0.4 + 0.6 * side)
        recess += 0.1 * joint
        # Karren: runnels down the upper faces and on the top.
        up = max(0.0, n.y)
        recess += 0.012 * up * (0.5 + 0.5 * math.sin((s.x * 0.7 + s.z * 0.7) * 26.0 + 4.0 * fbm(s * 3.0 + off, 2)))
        # Weathering: rounded, pitted, a little lumpy.
        recess += 0.02 * max(0.0, fbm(s * 4.0 + off, 3)) + 0.006 * noise.noise(s * 40.0 + off)
        # The foot splays into the ground.
        # The foot tucks in under the body (it is buried): a splay, or an uncut foot past the fracture cuts,
        # stood out of the slope as a thin shelf.
        if s.y < -0.25: s = Vector((s.x * (1.0 - 0.45 * (-s.y - 0.25)), s.y, s.z * (1.0 - 0.45 * (-s.y - 0.25))))
        # Feature mask for the shader (assetkit): the joints and bed seams, where water runs and dirt,
        # moss and staining gather.
        return s * (1.0 - recess), min(1.0, joint * 1.2 + seam * 0.8)
    return f

def main():
    sc = reset_scene()
    pairs = []
    for fam, (n, tris, size) in FAMILIES.items():
        for i in range(1 if QUICK else n):
            rnd = rng_for(fam, i)
            r = {'a': rnd.random(), 'b': rnd.random(), 'ox': rnd.uniform(-50, 50), 'oy': rnd.uniform(-50, 50), 'oz': rnd.uniform(-50, 50), 'seed': rnd.random()}
            hi = build_high(f'{fam}_{i}_high', HI, sculpt_limestone(r))
            lo = decimated(hi, f'{fam}_{i}_lod0', tris)
            pairs.append((lo.name, hi, lo, size))
            print('sculpted', fam, i, len(hi.data.polygons), '->', len(lo.data.polygons), flush=True)
    pack_uvs(pairs)
    maps = bake(sc, pairs, ATLAS)
    write_atlases(sc, OUT, 'outcrop-pieces', maps)
    finish(sc, OUT, 'outcrop-pieces', pairs, ATLAS)
    print('DONE', flush=True)

main()
