# Limestone boulders for the meadow (docs/realism-plan.md A1/A4): run headless in Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/boulder_pieces.py -- <out_dir> [atlas_px] [quick]
#
# The scree and the erratics of the outcrops' own rock (tools/models/outcrop_pieces.py), 0.4–3 m: they
# replace the procedural icosphere boulders on the meadow (render/rocks.js keeps the frost's). Three
# kinds, four seeds each:
#   rounded   long-weathered blocks: soft edges, faint beds, solution pits and runnels on the top
#   angular   fresh fallen blocks: planar fracture faces, crisp (chipped) edges, cracks
#   slab      a single bed: tabular, its seams along the long sides
# A fallen block's beds lie at any angle (it rolled), so each has its own bed frame.
# Through the shared pipeline (tools/models/assetkit.py): boulder-pieces.glb, .webp, -mask.webp, -stats.json.

import bpy, sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, noise
from assetkit import V, fbm, vor, rng_for, reset_scene, build_high, decimated, pack_uvs, bake, write_atlases, finish

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('boulder-out')
ATLAS = int(argv[1]) if len(argv) > 1 else 4096
QUICK = len(argv) > 2 and argv[2] == 'quick'
HI = 5 if QUICK else 7
os.makedirs(OUT, exist_ok=True)

KINDS = ('rounded', 'angular', 'slab')
PER_KIND = 4
TRIS = 2400
SIZE_M = 2.0            # the typical size, for an even texel density while packing

def sculpt_boulder(kind, r):
    rng = random.Random(int(r['seed'] * 1e6))
    off = V(r['ox'], r['oy'], r['oz'])
    rounded, angular, slab = kind == 'rounded', kind == 'angular', kind == 'slab'
    k = 3.2 if rounded else 5.0 if angular else 5.0
    sy = 0.42 if slab else rng.uniform(0.62, 0.8)
    sz = rng.uniform(0.7, 0.95)
    nplanes = 6 if rounded else 11 if angular else 7
    planes = []
    for _ in range(nplanes):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-0.6, 0.9), rng.uniform(-1, 1))).normalized()
        planes.append((n, rng.uniform(0.5, 0.78) if angular else rng.uniform(0.62, 0.86)))
    # The block's own bed frame: a rolled block's beds dip at any angle (a slab's stay flat).
    bn = Vector((0, 1, 0)) if slab else Vector((rng.uniform(-1, 1), rng.uniform(0.2, 1.0), rng.uniform(-1, 1))).normalized()
    beds = rng.randint(2, 4) if not slab else 2
    soft = 0.1 if rounded else 0.02 if angular else 0.05
    def f(p):
        q = Vector((p.x, p.y / sy, p.z / sz))
        rad = (abs(q.x) ** k + abs(q.y) ** k + abs(q.z) ** k) ** (1.0 / k)
        s = p / max(rad, 1e-6)
        s = Vector((s.x, s.y * 1.0, s.z))
        # Fracture faces: planar cuts, softened by the kind's weathering (a rounded block's are worn away).
        for n, d in planes:
            t = s.dot(n) - d
            if t > -soft:
                c = t if soft <= 0.0 else (t + soft) ** 2 / (4 * soft) if t < soft else t
                s -= n * min(c, 0.45 if angular else 0.35) * 0.97
        n = s.normalized()
        recess = 0.0
        # Beds: seams at the bed frame's height, recessed where they reach the surface.
        h = s.dot(bn) * 0.5 + 0.5 + 0.04 * fbm(s * 1.5 + off, 2)
        b = h * beds; t = b - math.floor(b)
        side = max(0.0, 1.0 - abs(n.dot(bn)) * 1.3)
        seam = side * math.exp(-((t if t < 0.5 else 1.0 - t) * 10.0) ** 2)
        recess += (0.02 if not rounded else 0.012) * seam
        # Cracks: narrow fissures from voronoi edges (an angular block is crazed, a rounded one barely).
        d0, d1 = vor(s * (2.2 if angular else 1.6) + off)
        crack = math.exp(-((d1 - d0) * (9.0 if angular else 6.0)) ** 2) * (0.9 if angular else 0.35)
        recess += 0.025 * crack
        # Solution: pits and runnels on the upward faces of the weathered blocks.
        up = max(0.0, n.y)
        if not angular:
            p0, p1 = vor(s * 5.0 + off * 1.7)
            pit = max(0.0, 1.0 - p0 * 3.2) ** 2
            recess += (0.03 if rounded else 0.015) * pit * up
            recess += 0.008 * up * (0.5 + 0.5 * math.sin((s.x + s.z) * 18.0 + 3.0 * fbm(s * 3.0 + off, 2)))
        # Weathering: lumpy, granular.
        recess += (0.03 if rounded else 0.015) * max(0.0, fbm(s * 3.0 + off, 3)) + 0.005 * noise.noise(s * 30.0 + off)
        # Chipped edges on the angular block (small conchoidal bites near its convex edges).
        if angular:
            c0, c1 = vor(s * 4.0 + off * 0.7)
            recess += 0.03 * max(0.0, 1.0 - c0 * 4.0) * max(0.0, 1.0 - abs(n.y) * 0.6) * (1.0 if rad < 1.02 else 0.4)
        # A buried, flatter underside.
        if s.y < -0.55 * sy: s = Vector((s.x, -0.55 * sy + (s.y + 0.55 * sy) * 0.4, s.z))
        return s * (1.0 - recess), min(1.0, seam * 0.9 + crack * 0.9)
    return f

def main():
    sc = reset_scene()
    pairs = []
    for ki, kind in enumerate(KINDS):
        for j in range(1 if QUICK else PER_KIND):
            rnd = rng_for('boulder-' + kind, j)
            r = {'ox': rnd.uniform(-50, 50), 'oy': rnd.uniform(-50, 50), 'oz': rnd.uniform(-50, 50), 'seed': rnd.random()}
            idx = ki * PER_KIND + j
            hi = build_high(f'boulder_{idx}_high', HI, sculpt_boulder(kind, r))
            lo = decimated(hi, f'boulder_{idx}_lod0', TRIS)
            pairs.append((lo.name, hi, lo, SIZE_M))
            print('sculpted', kind, idx, len(hi.data.polygons), '->', len(lo.data.polygons), flush=True)
    pack_uvs(pairs)
    maps = bake(sc, pairs, ATLAS, cavity_reach=0.05)
    write_atlases(sc, OUT, 'boulder-pieces', maps)
    finish(sc, OUT, 'boulder-pieces', pairs, ATLAS)
    print('DONE', flush=True)

main()
