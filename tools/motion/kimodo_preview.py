#!/usr/bin/env python
# A Kimodo motion (root_positions.f32, local_rotations_xyzw.f32; SOMA 30 joints, 30 fps), judged without the game:
# forward kinematics, a contact sheet from the side and the front, and numbers for jitter, foot slide and hand motion.
#   python tools/motion/kimodo_preview.py <motion dir> <out.png> [export_bvh.py]
import sys, re, ast
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

src = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(r'C:\wraith-tools\kimodo\scripts\export_bvh.py')
text = src.read_text()
PARENTS = ast.literal_eval(re.search(r'SOMA30_PARENTS = (\[.*?\])', text, re.S).group(1))
OFFSETS = np.array(ast.literal_eval(re.search(r'SOMA30_OFFSETS = (\[.*?\]\n\])', text, re.S).group(1)))
NAMES = ast.literal_eval(re.search(r'SOMA30_NAMES = (\[.*?\])', text, re.S).group(1))
J = {n: i for i, n in enumerate(NAMES)}
SKIP = {'Jaw', 'LeftEye', 'RightEye', 'LeftHandThumbEnd', 'RightHandThumbEnd'}

def qmul(a, b):
    x1, y1, z1, w1 = np.moveaxis(a, -1, 0); x2, y2, z2, w2 = np.moveaxis(b, -1, 0)
    return np.stack([w1*x2+x1*w2+y1*z2-z1*y2, w1*y2-x1*z2+y1*w2+z1*x2, w1*z2+x1*y2-y1*x2+z1*w2, w1*w2-x1*x2-y1*y2-z1*z2], -1)
def qrot(q, v):
    u, w = q[..., :3], q[..., 3:]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)

def fk(root, rot):
    T, n = rot.shape[:2]
    pos, glob = np.zeros((T, n, 3)), np.zeros((T, n, 4))
    for j in range(n):
        p = PARENTS[j]
        if p < 0: glob[:, j] = rot[:, j]; pos[:, j] = root
        else:
            glob[:, j] = qmul(glob[:, p], rot[:, j])
            pos[:, j] = pos[:, p] + qrot(glob[:, p], np.broadcast_to(OFFSETS[j], (T, 3)))
    return pos

def load(d):
    d = Path(d)
    root = np.fromfile(d / 'root_positions.f32', np.float32).reshape(-1, 3).astype(float)
    rot = np.fromfile(d / 'local_rotations_xyzw.f32', np.float32).astype(float)
    T = root.shape[0]; return root, rot.reshape(T, -1, 4)

def main():
    root, rot = load(sys.argv[1]); fps = 30.0
    P = fk(root, rot); T = P.shape[0]
    P = P - np.array([P[:, :, 0].mean(), P[:, :, 1].min(), P[:, :, 2].mean()])
    # Numbers. Jitter: the median frame-to-frame change of acceleration at the hands (m/s³), a roughness measure.
    h = J['LeftHand'], J['RightHand']; print('frames', T, 'seconds', round(T / fps, 2), 'joints', P.shape[1])
    v = np.diff(P, axis=0) * fps
    for name, i in (('L hand', h[0]), ('R hand', h[1]), ('hips', 0), ('head', J['Head'])):
        jerk = np.linalg.norm(np.diff(P[:, i], n=3, axis=0), axis=-1) * fps ** 3
        print(f'{name:7s} range xyz {np.ptp(P[:, i], axis=0).round(2)}  max speed {np.linalg.norm(v[:, i], axis=-1).max():.2f} m/s  jerk median {np.median(jerk):.0f} m/s3')
    lo = P[:, :, 1].min()
    for name in ('LeftToeBase', 'RightToeBase'):
        f = P[:, J[name]]; low = f[:, 1] < lo + 0.06; sp = np.linalg.norm(np.diff(f[:, [0, 2]], axis=0), axis=-1) * fps
        print(f'{name} planted {low.mean():.0%} of frames, slide while planted median {np.median(sp[low[:-1]]) if low[:-1].any() else 0:.3f} m/s')
    # Contact sheet: 10 frames, side (top) and front (bottom).
    W, H, N = 170, 290, 10; S = Image.new('RGB', (W * N, H * 2), (22, 24, 28)); D = ImageDraw.Draw(S); k = 130
    def bone(a, b, c, w): D.line([a, b], fill=c, width=w)
    for c in range(N):
        t = int(c * (T - 1) / (N - 1))
        for row, ax in ((0, 2), (1, 0)):
            x0, y0 = W * c + W / 2, H * row + H - 18
            cen = P[t, 0, ax]
            sc = lambda q: (x0 + (q[ax] - cen) * k, y0 - q[1] * k)
            D.line([(W * c + 6, y0), (W * c + W - 6, y0)], fill=(60, 64, 70))
            for j, p in enumerate(PARENTS):
                if p < 0 or NAMES[j] in SKIP: continue
                left = NAMES[j].startswith('Left'); right = NAMES[j].startswith('Right')
                bone(sc(P[t, p]), sc(P[t, j]), (120, 200, 255) if left else (255, 170, 90) if right else (230, 230, 230), 3)
            H0 = P[t, J['Head']]; x, y = sc(H0); D.ellipse([x - 8, y - 8, x + 8, y + 8], outline=(230, 230, 230), width=2)
        D.text((W * c + 6, 4), f'{t / fps:.1f} s', fill=(200, 200, 200))
    S.save(sys.argv[2]); print('wrote', sys.argv[2])
main()
