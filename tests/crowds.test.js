import { describe, it, expect } from 'vitest';
import { hallAlive, bakehouseBehind, hallFleeing } from '../src/game/crowds.js';
import { buildCity, createEbbholdSolids, EBB_ORIGIN as O } from '../src/world/ebbhold.js';
import { CROWD_MAX } from '../src/render/crowd.js';

const S = createEbbholdSolids(buildCity());
const onFloor = (f) => { S.qx = f.x; S.qz = f.z; S.ref = f.y + 0.5; S.floorQ(); return Math.abs(S.h - f.y) < 0.6; };

describe('the cutscene crowds', () => {
  it('fit the crowd mesh and come out the same every time', () => {
    expect(hallAlive().length).toBeLessThanOrEqual(CROWD_MAX);
    expect(JSON.stringify(hallAlive(7))).toBe(JSON.stringify(hallAlive(7)));
    expect(hallFleeing().length).toBeLessThanOrEqual(CROWD_MAX);
  });
  it('stand on the city\'s floors, walkers along their whole walk', () => {
    for (const f of [...hallAlive(), ...bakehouseBehind(), ...hallFleeing()]) {
      expect(onFloor(f), `${f.motion} at ${(f.x - O.x).toFixed(1)}, ${(f.z - O.z).toFixed(1)}`).toBe(true);
      if (f.motion === 'walk' || f.motion === 'run') for (const s of [-0.5, 0.5]) {
        const p = { x: f.x + Math.sin(f.yaw) * f.walk * s * 0.95, y: f.y, z: f.z + Math.cos(f.yaw) * f.walk * s * 0.95 };
        expect(onFloor(p), `walk end ${(p.x - O.x).toFixed(1)}, ${(p.z - O.z).toFixed(1)}`).toBe(true);
      }
    }
  });
  it('leave the causeway\'s middle clear for the camera through the frozen crowd', () => {
    for (const f of hallFleeing()) if (Math.abs(f.y - O.y) < 1 && Math.abs(f.z - O.z) < 6) expect(Math.abs(f.z - O.z)).toBeGreaterThan(1.3);
  });
});
