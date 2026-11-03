// Tide → Shaped (Phase 10 F4): a Surge shoves, soaks and strikes what its front passes (once a wave); the Draw pulls the light in
// toward its mass and dries a soaked body until mud Shaped crumble; an Undertow drags in what is near and wears at what it holds.
// Soaked then frozen is already a reaction (a Surge, then Frost). Called per Shaped from combat.js. Allocation-free.

import { drawTuning, undertowTuning } from '../bending/tide.js';

/**
 * @param {{ shaped: any, tide: any, strike: (i: number, dmg: number, dx: number, dz: number, heavy: boolean) => void, flow: any, FLOW_EVENT: any,
 *   tuning: any, maxShaped: number }} ctx
 */
export function createTideHits(ctx) {
  const { shaped, tide, strike, flow, FLOW_EVENT, tuning: T, maxShaped } = ctx;
  const seen = new Uint32Array(3 * maxShaped);
  const tick = new Float64Array(maxShaped);
  const DRY = 1.2;                      // s of the Draw on a soaked body to crumble it
  const dryT = new Float64Array(maxShaped);
  return {
    hit(i, cx, cz, dt) {
      const s = shaped.slots[i], b = s.body;
      for (let k = 0; k < 3; k++) {
        if (!tide.surgeActive[k] || tide.surgeHW[k] <= 0.05 || seen[k * maxShaped + i] === tide.surgeId[k]) continue;
        const ex = cx - tide.surgeFX[k], ez = cz - tide.surgeFZ[k];
        const along = ex * tide.surgeDX[k] + ez * tide.surgeDZ[k], across = Math.abs(-ex * tide.surgeDZ[k] + ez * tide.surgeDX[k]);
        if (along < 1.2 && along > -1.6 && across < tide.surgeHW[k] + 0.5) {
          seen[k * maxShaped + i] = tide.surgeId[k];
          s.wet = 2.5;                                                   // soaked: frost will lock it
          strike(i, T.surgeDamage * tide.surgeK[k], tide.surgeDX[k], tide.surgeDZ[k], true);
          if (!shaped.isLive(i)) return;
          b.vx += tide.surgeDX[k] * T.surgeShove * tide.surgeK[k]; b.vz += tide.surgeDZ[k] * T.surgeShove * tide.surgeK[k];
        }
      }
      // The Draw: drawn in to the mass; a soaked body there is dried out until it crumbles.
      const m = tide.drawMass;
      if (m > 0.2) {
        const ex = tide.drawX - cx, ez = tide.drawZ - cz, d = Math.sqrt(ex * ex + ez * ez) || 1;
        if (d < drawTuning.reach) {
          const pull = drawTuning.pull * m * Math.min(1, d / 1.5);
          b.vx += ex / d * pull * dt * 6; b.vz += ez / d * pull * dt * 6;
          if (s.wet > 0 && d < drawTuning.radius + 1) {
            dryT[i] += dt;
            if (dryT[i] >= DRY) { dryT[i] = 0; s.wet = 0; strike(i, T.drawCrumble, -ex / d, -ez / d, true); if (flow !== null) flow.hit(FLOW_EVENT.REACTION); if (!shaped.isLive(i)) return; }
          } else dryT[i] = 0;
        }
      } else dryT[i] = 0;
      // The Undertow: dragged round and down.
      tick[i] = Math.max(0, tick[i] - dt);
      const us = tide.undertowStrength;
      if (us > 0.15) {
        const ex = tide.undertowX - cx, ez = tide.undertowZ - cz, d = Math.sqrt(ex * ex + ez * ez) || 1;
        if (d < undertowTuning.reach) {
          const pull = undertowTuning.pull * us * Math.min(1, d / 1.5);
          b.vx += (ex / d * pull + -ez / d * pull * 0.6) * dt * 6; b.vz += (ez / d * pull + ex / d * pull * 0.6) * dt * 6;   // in, and round
          if (d < undertowTuning.radius && tick[i] <= 0) { tick[i] = 0.3; strike(i, undertowTuning.dps * 0.3 * us, -ez / d, ex / d, false); }
        }
      }
    },
  };
}
