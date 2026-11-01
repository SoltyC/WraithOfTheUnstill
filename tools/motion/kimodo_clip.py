#!/usr/bin/env python
# A Kimodo motion → a clip for src/character/performance.js: per frame the pelvis, the torso and head frames and the
# arm and foot joints, in the game's axes (+x right, +y up, +z forward; Kimodo's left is +x, so x is mirrored).
#   python tools/motion/kimodo_clip.py <motion dir> <out.bin> [export_bvh.py]
# Layout (float32): count, then frames × FIELDS, 30 fps: pelvis 3, r 3, u 3, f 3, hr 3, hu 3, hf 3, sh 6, el 6, ha 6, feet 6.
import sys
import numpy as np
from pathlib import Path
sys.argv, args = sys.argv[:1] + [sys.argv[1], 'x.png'] + sys.argv[3:], sys.argv
src = (Path(__file__).parent / 'kimodo_preview.py').read_text().replace('\nmain()\n', '\n')
exec(src)


def main2():
    root, rot = load(args[1])
    P = fk(root, rot); T = P.shape[0]
    P = P * np.array([-1.0, 1.0, 1.0])
    ground = P[:, [J['LeftToeBase'], J['RightToeBase']], 1].min()
    P[:, :, 1] -= ground
    start = P[0, 0].copy(); start[1] = 0
    P -= start
    n = lambda v: v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-6)
    sL, sR, eL, eR, hL, hR = (P[:, J[k]] for k in ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'))
    u = n(P[:, J['Chest']] - P[:, 0])
    r = sR - sL; r = n(r - u * (r * u).sum(-1, keepdims=True))
    f = n(np.cross(r, u))
    head = P[:, J['Head']]
    hu = n(head - P[:, J['Neck1']])
    hr = r - hu * (r * hu).sum(-1, keepdims=True); hr = n(hr)
    hf = n(np.cross(hr, hu))
    out = np.concatenate([P[:, 0], r, u, f, hr, hu, hf, sL, sR, eL, eR, hL, hR, P[:, J['LeftFoot']], P[:, J['RightFoot']]], axis=1).astype(np.float32)
    Path(args[2]).parent.mkdir(parents=True, exist_ok=True)
    with open(args[2], 'wb') as o:
        np.array([T], dtype=np.float32).tofile(o); out.tofile(o)
    print('clip', args[2], 'frames', T, 'fields', out.shape[1], 'forward at start', f[0].round(2), 'pelvis', P[0, 0].round(2))
main2()
