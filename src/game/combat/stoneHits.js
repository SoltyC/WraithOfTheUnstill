// Stone → Shaped (BRIEF §10, docs/phase-9/plan.md D4): the Shard knocks back and staggers what it strikes
// (a frozen body shatters: the combat `strike` triples it), a Bloom throws the foes in its crater up and
// pins them there, and a Ridge is a wall the swarmers cannot pass. Called per Shaped from combat.js.
// Allocation-free.

import { bloomTuning } from '../bending/stone.js';

/**
 * @param {{ shaped: any, stone: any, strike: (i: number, dmg: number, dx: number, dz: number, heavy: boolean) => void, flow: any, FLOW_EVENT: any,
 *   tuning: any, maxShaped: number }} ctx
 */
export function createStoneHits(ctx) {
  const { shaped, stone, strike, flow, FLOW_EVENT, tuning: T, maxShaped } = ctx;
  const shardDone = new Uint32Array(3);
  const popT = new Float64Array(maxShaped).fill(-1);   // seconds into the launch (−1: grounded)
  const bloomSeen = new Uint32Array(maxShaped);
  let bloomCaught = 0, bloomFrame = -1;
  const POP = 0.85;

  return {
    /** Foes caught by the Bloom that just went off (for the owner's Flow and sound). */
    get caught() { return bloomCaught; },
    /** Slot i, body centre (cx, cz). */
    hit(i, cx, cz, dt) {
      const s = shaped.slots[i], b = s.body;
      const R = bloomTuning.reach;
      // The Shard: the first body in its path takes it, and it shatters there.
      for (let k = 0; k < 3; k++) {
        if (!stone.shardOn[k] || stone.shardPhase[k] !== 1 || shardDone[k] === stone.shardId[k]) continue;
        const dx = cx - stone.shardX[k], dz = cz - stone.shardZ[k], dy = b.sy[1] - stone.shardY[k];
        if (dx * dx + dz * dz < 1.3 * 1.3 && dy > -1.7 && dy < 1.7) {
          shardDone[k] = stone.shardId[k];
          if (stone.shardWet[k]) s.wet = 2.5;                               // carried through a Ribbon: it soaks
          const soaked = s.wet > 0 && !shaped.isFrozen(i);
          shaped.erupt(i);
          if (s.arch === 'plateback' && s.st.seamK === 0) shaped.popPlate(i);
          // Fused glass turns a stone plate aside until thermal shock opens it.
          if(s.arch!=='glasssworn'||shaped.isFrozen(i)) strike(i, T.shardDamage * stone.shardDmg[k], stone.shardDX[k], stone.shardDZ[k], true);
          if (flow !== null && soaked) flow.hit(FLOW_EVENT.REACTION);       // a wet body struck by stone
          stone.shardHit(k);
          if (!shaped.isLive(i)) return;
          if(s.arch==='glasssworn'&&!shaped.isFrozen(i))continue;
          b.vx += stone.shardDX[k] * T.shardShove; b.vz += stone.shardDZ[k] * T.shardShove;
        }
      }
      // The Bloom: caught inside the crater (once per bloom), thrown up and pinned.
      if (stone.bloomEvent) {
        if (bloomFrame !== stone.bloomId) { bloomFrame = stone.bloomId; bloomCaught = 0; }
        const dx = cx - stone.bloomX, dz = cz - stone.bloomZ, d = Math.sqrt(dx * dx + dz * dz);
        if (d < stone.bloomR * R && bloomSeen[i] !== stone.bloomId) {
          bloomSeen[i] = stone.bloomId; bloomCaught++;
          const frozen = shaped.isFrozen(i);
          shaped.erupt(i);
          strike(i, T.bloomDamage, dx / (d || 1), dz / (d || 1), true);
          if (bloomCaught === 2 && flow !== null) flow.hit(FLOW_EVENT.REACTION);   // two at once
          if (!shaped.isLive(i)) return;
          if (!frozen) { shaped.pin(i, bloomTuning.trap); popT[i] = 0; }
        }
      }
      if (popT[i] >= 0) {
        popT[i] += dt;
        const u = popT[i] / POP;
        if (u >= 1 || !shaped.isLive(i)) { popT[i] = -1; b.pop = 0; } else b.pop = bloomTuning.launch * Math.sin(Math.PI * u);
      }
      // The Ridge: a wall the swarmers do not cross.
      if (stone.mass.count > 0 && stone.pushOut(b.x, b.z, 0.55)) {
        b.x += stone.pushX; b.z += stone.pushZ; b.vx *= 0.4; b.vz *= 0.4;
      }
    },
  };
}
