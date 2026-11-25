# The Ember Warden's body (docs/phase-11/ember-warden.md, docs/hifi-models.md): run headless in Blender 5.2.
#
#   blender -b --factory-startup --python tools/models/ember_warden.py -- <out_dir> [atlas_px] [quick]
#
# A titan of basalt crust in rigid segments, each hung on one bone of game/emberWarden/titan.js and posed by its IK:
# the torso (pelvis to the shoulder yoke), the head (neck to crown), the upper arm (shoulder cap to elbow), the forearm
# (elbow to wrist) and the two hands (palm and four curled fingers and a thumb). Each is modelled in unit space along its
# bone (game frame: +z along the bone, +y its front — the chest's, the face's; the back of the hand), with its true
# proportions inside ±1: the game scales it uniformly by the segment's size in metres (SEGMENTS below — keep in step
# with the titan's TITAN and TITAN_SCALE).
#
# The masses are metaballs (capsules and ellipsoids blending into one), voxel-remeshed to an even dense surface, then
# cracked into a crust: Voronoi plates, the cracks between them sunk and, in the feature mask, marked — the game lights
# them with the titan's heat (shaders/emberWardenPiece.wgsl.js). Plates bulge a little, the crust is pitted, the eyes
# and the mouth are deep glowing slots. Then the shared pipeline (assetkit.py): decimate, one atlas, the bake, LODs.
# Outputs ember-warden.glb, .webp (normal + AO), -mask.webp (convexity, cavity, cracks), -stats.json.

import bpy, bmesh, sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, noise
from assetkit import V, fbm, vor, reset_scene, decimated, pack_uvs, bake, write_atlases, finish, to_blender, to_game

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('ember-warden-out')
ATLAS = int(argv[1]) if len(argv) > 1 else 4096
QUICK = len(argv) > 2 and argv[2] == 'quick'
VOXEL = 0.03 if QUICK else 0.0105
os.makedirs(OUT, exist_ok=True)

# segment: (LOD0 triangles — quads: the decimated mesh has about twice as many triangles —, size in m: the game's uniform scale of the unit model)
SEGMENTS = {
    'ewtorso': (9000, 52.0),
    'ewhead':  (5000, 22.0),
    'ewupper': (5000, 46.0),
    'ewfore':  (5000, 42.0),
    'ewhandl': (7000, 28.0),
    'ewhandr': (7000, 28.0),
}

# --- the masses: metaball elements in the game frame (x across, y front, z along the bone) --------------------------

def masses(seg):
    """[(kind, centre, radius, (sx, sy, sz) for ellipsoids / (half-length along x) for capsules, rotation as a direction)]"""
    E = []
    def ell(c, r, s): E.append(('ELLIPSOID', V(*c), r, s, None))
    def cap(a, b, r):
        a, b = V(*a), V(*b)
        E.append(('CAPSULE', (a + b) * 0.5, r, (b - a).length * 0.5, (b - a).normalized()))
    def ball(c, r): E.append(('BALL', V(*c), r, None, None))
    if seg == 'ewtorso':
        # Rising out of the lava: the waist, the ribcage, the chest's great yoke and the shoulder masses where the arms hang
        # (the shoulders at x ±0.72, z 0.5 — titan.js: shoulder 18.7 m out, 3.4 m below the chest's top, 26 m = 1 unit).
        ell((0, 0, -0.62), 0.34, (1.0, 0.85, 1.25))
        ell((0, 0.02, -0.08), 0.42, (1.05, 0.88, 1.15))
        ell((0, -0.06, 0.42), 0.44, (1.55, 0.85, 0.72))
        for s in (-1, 1):
            ell((0.62 * s, -0.06, 0.5), 0.2, (1.1, 1.0, 0.9))
            ell((0.2 * s, 0.24, 0.36), 0.2, (1.15, 0.6, 1.0))        # the chest's plates
            ell((0.4 * s, -0.22, 0.3), 0.22, (1.0, 0.8, 1.3))        # the back, either side of the spine
        ell((0, -0.3, 0.36), 0.24, (1.3, 0.8, 1.2))                   # the hump between the shoulder blades
        cap((0, -0.02, 0.62), (0, 0.06, 0.78), 0.15)                  # the neck's root
    elif seg == 'ewhead':
        # Heavy and low: a broad skull, a jutting brow, a slab of a jaw; set forward on the neck.
        cap((0, -0.1, -0.85), (0, 0.0, -0.35), 0.34)                  # the neck, thick, sunk between the shoulders
        ell((0, 0.02, 0.05), 0.42, (0.95, 0.9, 1.0))                  # the skull
        cap((-0.34, 0.4, 0.22), (0.34, 0.4, 0.22), 0.13)              # the brow ridge, jutting
        ell((0, 0.3, -0.25), 0.3, (1.15, 0.7, 0.75))                  # the jaw, a slab
        ell((0, -0.2, 0.3), 0.34, (1.05, 1.0, 0.85))                  # the crown, back
    elif seg == 'ewupper':
        # Shoulder (z −1) to elbow (z 1, at 0.89: the bone 40.8 m of 46): a cap over the joint, a heavy arm.
        ell((0, 0.0, -0.8), 0.25, (1.0, 1.0, 0.9))
        cap((0, 0, -0.72), (0, 0, 0.86), 0.19)
        ell((0, 0.06, -0.25), 0.22, (1.0, 1.1, 1.5))                  # the biceps' mass
        cap((0, 0.2, -0.55), (0, 0.22, -0.05), 0.08)                  # a crest of crust over the shoulder, down the arm
        ell((0, -0.05, 0.1), 0.19, (1.05, 1.0, 1.6))
        ball((0, -0.02, 0.88), 0.2)                                   # the elbow
    elif seg == 'ewfore':
        # Elbow (z −0.89) to wrist (z 0.89): a forearm thickening toward the fist, as a titan's that carries it.
        ball((0, 0, -0.9), 0.18)
        cap((0, 0, -0.85), (0, 0, 0.86), 0.16)
        ell((0, 0.03, 0.25), 0.2, (1.15, 1.0, 1.9))
        ell((0, -0.02, 0.62), 0.2, (1.2, 0.95, 1.0))
        # A crest of crust along its top (+y: the back of the arm), broken into three ridges.
        for z0, z1 in ((-0.7, -0.3), (-0.2, 0.25), (0.35, 0.75)): cap((0, 0.17, z0), (0, 0.2, z1), 0.07)
    else:
        # The hand: wrist (z −0.9), the palm, four fingers off its end curling down (−y), the thumb on its inner side.
        sd = -1 if seg == 'ewhandl' else 1
        cap((0, 0, -0.95), (0, 0, -0.55), 0.18)
        ell((0, 0, -0.25), 0.36, (1.0, 0.42, 0.95))
        # Knuckles: a row of blunt masses across the back of the hand, where the fingers start.
        for f in range(4): ball(((f - 1.5) * 0.17, 0.1, 0.02), 0.1)
        for f in range(4):
            x = (f - 1.5) * 0.17
            ln = 1.0 - 0.12 * abs(f - 1.5)
            a, b, c, d = (x, 0, 0.05), (x * 1.08, -0.05, 0.38 * ln), (x * 1.12, -0.22, 0.62 * ln), (x * 1.12, -0.42, 0.72 * ln)
            cap(a, b, 0.085); cap(b, c, 0.078); cap(c, d, 0.07)
        # (The thumb: on the inner side — toward the body: −x for the right hand, +x for the left.)
        tx = -sd * 0.33
        cap((tx * 0.8, -0.04, -0.4), (tx * 1.15, -0.12, -0.08), 0.09); cap((tx * 1.15, -0.12, -0.08), (tx * 1.0, -0.3, 0.12), 0.08)
    return E

def build_mass(name, seg):
    mb = bpy.data.metaballs.new(name + '_mb')
    mb.resolution = 0.02 if QUICK else 0.012
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name + '_mb', mb); bpy.context.scene.collection.objects.link(ob)
    for kind, c, r, s, d in masses(seg):
        el = mb.elements.new(type=kind)
        el.co = to_blender(c); el.radius = r * 1.6; el.stiffness = 2.0
        if kind == 'ELLIPSOID':
            el.size_x, el.size_y, el.size_z = s[0], s[2], s[1]      # (factors on the radius; Blender: y is the game's −z, z its y)
        elif kind == 'CAPSULE':
            el.size_x = s
            # Rotate the capsule's x axis onto d (game) → Blender.
            db = to_blender(d)
            el.rotation = Vector((1, 0, 0)).rotation_difference(db)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    me_ob = bpy.context.view_layer.objects.active
    me_ob.name = name
    # An even, dense surface to crack.
    me_ob.data.remesh_voxel_size = VOXEL
    bpy.ops.object.voxel_remesh()
    return me_ob

# --- the crust --------------------------------------------------------------------------------------------------------

def crust(ob, seg, seed):
    """Plates and cracks over the mass: each vertex pushed along its normal; the cracks marked in the feature mask."""
    rng = random.Random(seed)
    off = V(rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50))
    size = SEGMENTS[seg][1]
    # Plates a few metres across whatever the segment's size: Voronoi cells per unit.
    cells = size / 8.5
    me = ob.data
    me.calc_loop_triangles()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
    feats = []
    macro = size / 22.0      # fractured slabs: a few per segment, each pressed flat toward its own plane
    for v in bm.verts:
        g = to_game(v.co); n = to_game(v.normal)
        md, mp = noise.voronoi(g * macro + off * 0.7, distance_metric='DISTANCE', exponent=2.0)
        c = (mp[0] - off * 0.7) / macro                   # the slab's seed point (unit space)
        hseed = noise.noise(mp[0] * 3.1)
        pn = (n + V(noise.noise(mp[0] * 1.7), noise.noise(mp[0] * 2.3), noise.noise(mp[0] * 2.9)) * 0.35).normalized()
        # Toward the plane through the slab's centre at its own tilt: bulges cut flat, edges left where slabs meet.
        flat = -0.6 * max(0.0, (g - c).dot(pn) - (0.02 + 0.03 * hseed)) * 0.15
        slabEdge = math.exp(-((md[1] - md[0]) * 5.0) ** 2)
        # Plates: Voronoi in 3D; the crack where two cells meet (sharp), a lesser network inside the bigger plates.
        d0, d1 = vor(g * cells + off)
        e = d1 - d0
        crack = math.exp(-(e * 9.0) ** 2)
        s0, s1 = vor(g * cells * 2.7 + off * 1.3)
        fine = math.exp(-((s1 - s0) * 11.0) ** 2) * 0.45
        # Plate faces: flat-ish slabs, each tilted its own way (the crust broke and settled): a plane per cell from a hash
        # of its nearest feature point's distance pattern, a step down at the crack, pitted.
        cid = noise.noise(V(round(d0 * 37.0, 1), 0.0, 0.0) + g * 0.0 + off * 0.01)
        tilt = V(noise.noise(g * cells * 0.45 + off), noise.noise(g * cells * 0.45 + off * 1.7), noise.noise(g * cells * 0.45 + off * 2.3))
        bulge = 0.014 * min(1.0, e * 3.0) + 0.012 * tilt.dot(n) + 0.004 * cid
        pits = 0.0025 * max(0.0, noise.noise(g * cells * 9.0 + off)) + 0.0015 * noise.noise(g * cells * 22.0)
        dz = bulge - 0.026 * crack - 0.007 * fine - pits + flat - 0.02 * slabEdge
        k = max(crack, fine, slabEdge * 0.9)
        # The head: the eyes and the mouth are deep slots, lit from inside.
        if seg == 'ewhead':
            for sx in (-1, 1):
                q = (g - V(0.2 * sx, 0.44, 0.17)); q = V(q.x * 1.0, q.y * 2.4, q.z * 2.6)
                if q.length < 0.12: dz -= 0.05 * (1 - q.length / 0.12); k = max(k, 1.0 - q.length / 0.12)
            q = g - V(0, 0.5, -0.12); q = V(q.x * 0.9, q.y * 3.0, q.z * 6.0)
            if q.length < 0.22: dz -= 0.035 * (1 - q.length / 0.22); k = max(k, 0.8 * (1.0 - q.length / 0.22))
        # The torso: a split down the chest where the heart's light shows.
        if seg == 'ewtorso':
            w = abs(g.x + 0.03 * noise.noise(g * 6.0 + off))
            if g.y > 0.15 and -0.1 < g.z < 0.55 and w < 0.06:
                t = 1.0 - w / 0.06
                dz -= 0.03 * t; k = max(k, t)
        v.co += to_blender(n * dz)
        feats.append(min(1.0, k))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ca = me.color_attributes.new('feature', 'FLOAT_COLOR', 'POINT')
    for i, k in enumerate(feats): ca.data[i].color = (k, k, k, 1.0)

def main():
    sc = reset_scene()
    pairs = []
    for i, (seg, (tris, size)) in enumerate(SEGMENTS.items()):
        hi = build_mass(f'{seg}_0_high', seg)
        # The game mesh from the smooth mass, before the crust: it unwraps into broad islands (the cracked surface shatters
        # into one island a triangle), and the crust comes onto it in the bake.
        lo = decimated(hi, f'{seg}_0_lod0', tris)
        crust(hi, seg, 1000 + i)
        pairs.append((lo.name, hi, lo, size))
        print('sculpted', seg, len(hi.data.polygons), '->', len(lo.data.polygons), flush=True)
    pack_uvs(pairs)
    maps = bake(sc, pairs, ATLAS, ao_reach=0.12, cavity_reach=0.015)
    write_atlases(sc, OUT, 'ember-warden', maps)
    finish(sc, OUT, 'ember-warden', pairs, ATLAS)
    print('DONE', flush=True)

main()
