// The canyon's solids against the drawn rock (user report 2026-11-01): the pillars closed all the way
// round, the body and the camera kept off the face at their own height, and the cap walked on.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildCanyonKit, cliffOffset, COL_STRIDE, FACE_ROWS } from '../src/world/canyonKit.js';
import { createSolids } from '../src/world/solids.js';
import { SpringArmCamera } from '../src/camera/springArm.js';

const data = JSON.parse(fs.readFileSync('data/world/ravines.json', 'utf8'));
const kit = buildCanyonKit(data);
const wallSolids = () => createSolids([], { blockers: [], platforms: [] });

/** One straight wall along +x with its out-normal +z, as fillSolids would write it. */
function straightWall(s, { lip = -3, back = -7, face = () => 0, y0 = 90, y1 = 102 } = {}) {
  const w = s.walls; w.n = 1;
  w.ax[0] = -20; w.az[0] = 0; w.bx[0] = 20; w.bz[0] = 0; w.nx[0] = 0; w.nz[0] = 1; w.y0[0] = y0; w.y1[0] = y1; w.lip[0] = lip; w.back[0] = back;
  for (let r = 0; r < FACE_ROWS; r++) w.face[r] = face(r);
}

describe('canyon pillars', () => {
  it('close: the last column of a hoodoo is its first', () => {
    for (const h of data.hoodoos.slice(0, 12)) {
      const c = buildCanyonKit({ walls: [], spines: [], hoodoos: [h], arches: [] })[0], g = c.build(0), P = g.positions, segs = 16, rows = P.length / 3 / (segs + 1);
      expect(Number.isInteger(rows)).toBe(true);
      for (let i = 0; i < rows * 3; i++) expect(P[segs * rows * 3 + i]).toBeCloseTo(P[i], 3);
    }
  });
  it('every hoodoo and arch leg has a solid', () => {
    let n = 0;
    for (const c of kit) n += c.posts.length / 7;
    expect(n).toBe(data.hoodoos.length + data.arches.length * 2);
  });
});

describe('canyon walls', () => {
  it('collision points carry the face in every row', () => {
    for (const c of kit) expect(c.collision.length % COL_STRIDE).toBe(0);
  });
  it('no place has more wall segments near it than the solids hold', () => {
    const mids = [];
    for (const c of kit) { const L = c.collision; for (let o = COL_STRIDE; o < L.length; o += COL_STRIDE) if (L[o + 6] < 0.5) mids.push(L[o], L[o + 1]); }
    let worst = 0;
    for (let i = 0; i < mids.length; i += 40) {
      let n = 0;
      for (let j = 0; j < mids.length; j += 2) { const dx = mids[j] - mids[i], dz = mids[j + 1] - mids[i + 1]; if (dx * dx + dz * dz < 1600) n++; }
      worst = Math.max(worst, n);
    }
    expect(worst).toBeLessThan(wallSolids().walls.ax.length);
  });
  it('every column has a cap to stand on, behind its lip', () => {
    let empty = 0, n = 0;
    for (const c of kit) { const L = c.collision; for (let o = 0; o < L.length; o += COL_STRIDE) { n++; if (L[o + 8] >= L[o + 7]) empty++; } }
    expect(empty / n).toBeLessThan(0.02);
  });
  it('a slot face reaches further above the body than at it', () => {
    const iso = 90, top = 150;
    let most = 0;
    for (let s = 0; s < 400; s += 7) {
      let body = -1e9, up = -1e9;
      for (let y = iso - 1.5; y <= iso + 1; y += 0.5) body = Math.max(body, cliffOffset(s, y, iso, top, 5, 0.4, 2));
      for (let y = iso + 2; y <= iso + 9; y += 0.5) up = Math.max(up, cliffOffset(s, y, iso, top, 5, 0.4, 2));
      most = Math.max(most, up - body);
    }
    expect(most).toBeGreaterThan(0.5);    // why the camera reads `face`, not the body's line
  });
  it('the camera is inside the rock where the face leans out at its height', () => {
    const s = wallSolids();
    straightWall(s, { face: (r) => (r > 3 ? 2 : 0) });
    s.px = 0; s.pz = 1.5;
    s.py = 91; expect(s.insideQ()).toBe(false);
    s.py = 98; expect(s.insideQ()).toBe(true);
  });
});

describe('the cap of a cliff', () => {
  const stand = (s, z, feet, terrain) => s.floor(0, z, terrain, false, feet);
  it('is ground from the lip back, not before the lip or past the back', () => {
    const s = wallSolids(); straightWall(s);
    expect(stand(s, -2, 102, 100)).toBe(100);    // past the lip: over the drop
    expect(stand(s, -4, 102, 97)).toBe(102);     // on the cap, the ramp hidden under it
    expect(stand(s, -9, 102, 96)).toBe(96);      // behind it
  });
  it('is not a floor from below', () => {
    const s = wallSolids(); straightWall(s);
    expect(stand(s, -4, 95, 94)).toBe(94);
  });
  it('holds the body up: no push back out through the wall', () => {
    const s = wallSolids(); straightWall(s);
    const p = { x: 0, y: 102, z: -4 }, v = { x: 0, y: 0, z: 0 };
    s.push(p, v);
    expect(p.z).toBe(-4);
  });
  it('a body in the rock below it is put out by the face at its height', () => {
    const s = wallSolids(); straightWall(s, { face: (r) => -r * 0.25 });
    const p = { x: 0, y: 98, z: -2.2 }, v = { x: 0, y: 0, z: 0 };
    s.push(p, v);
    expect(p.z).toBeGreaterThan(-2.2);
    expect(p.z).toBeLessThan(0);                 // the leaning face, not the foot's line
  });
});

describe('camera probes by site', () => {
  const built = { blockers: [{ site: 0, kind: 'circle', x: 0, z: 0, r: 2, y0: 0, y1: 5 }], platforms: [] };
  const seated = () => { const s = createSolids([{ at: [100, 100] }], built); s.sites[0].seat = 0; return s; };
  it('finds a site within reach, and only after cullCam', () => {
    const s = seated(); s.px = 100; s.py = 2; s.pz = 100;
    expect(s.insideQ()).toBe(false);
    s.cullCam(100, 90, 8); expect(s.insideQ()).toBe(true);
  });
  it('skips a site out of reach', () => {
    const s = seated(); s.px = 100; s.py = 2; s.pz = 100;
    s.cullCam(0, 0, 8); expect(s.insideQ()).toBe(false);
  });
});

describe('the arm beside a wall', () => {
  /** A wall on the camera's right: the shoulder would reach through it. */
  function armByWall() {
    const camera = { position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { set() {} }, fov: 1 };
    const ground = { qx: 0, qz: 0, h: 0, sample() {} };
    const arm = new SpringArmCamera(camera, ground);
    arm.occluder = { qx: 0, qy: 0, qz: 0, probe() { return this.qx > 0.3; } };
    arm.dt = 1 / 60; arm.pitch = 0.2;
    arm.snap({ x: 0, y: 0, z: 0 });
    return { arm, camera };
  }
  it('draws the shoulder in instead of starting in the rock', () => {
    const { arm, camera } = armByWall(), feet = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 60; i++) arm.update(feet, vel, 0, 0, 0, false);
    expect(camera.position.x).toBeLessThan(0.3);
    expect(arm.armLen).toBeGreaterThan(4);       // the arm itself runs clear along the wall
  });
  it('stops short of a wall behind the body, closer than the terrain limit', () => {
    const { arm, camera } = armByWall(), feet = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 };
    arm.yaw = -Math.PI / 2;                      // looking toward −x: the wall is behind the camera's arm
    for (let i = 0; i < 60; i++) arm.update(feet, vel, 0, 0, 0, false);
    expect(camera.position.x).toBeLessThan(0.31);
  });
});
