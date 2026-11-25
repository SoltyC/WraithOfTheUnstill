// The dunes' choice, seen (docs/phase-9/dunes-choice.md; docs/people-and-cutscenes.md §3.3 "Where it lies down"): one cut
// in three variants, played after the Long Walker has lain down (or been let go). Live subjects, the scene layer
// (systems/scenes.js). Pure: returns the variant.
//   well — the camp round the filled well; the glass-readers walking out of their canyon at dusk; Iven looking back.
//   gate — the readers round the brimming cistern on the rim; the Wellhouse camp walking out of its gate; Pell looking back.
//   none — the Walker walking away into the erg; Sarai at her wall; Iven at the Gate.

/**
 * @param {'well'|'gate'|'none'} outcome
 * @param {{ stay: string[], go: string[], back: string, at: { stay: number[], go: number[] }, walker?: boolean }} o
 *   stay/go: who stays and who leaves (npc ids); back: who looks back; at: where each group is (x, z)
 */
export function walkerLiesDown(outcome, o) {
  const stayS = { npcs: o.stay, fallback: { point: o.at.stay } }, goS = { npcs: o.go, fallback: { point: o.at.go } };
  const title = outcome === 'well' ? 'The Wellhouse' : outcome === 'gate' ? 'The Sun Gate' : 'The erg';
  const beats = outcome === 'none' ? [
    // It walks away, small against the dunes, the dust going up behind it.
    { dur: 7, subject: { custom: 'walker' }, rig: 'static', yaw: 0.6, dist: 260, height: 60, fov: 0.6, drift: 0.04, subs: [{ t: 0.6, d: 3, text: title }] },
    { dur: 6, subject: stayS, target: { custom: 'walker' }, rig: 'pov', dist: 2.4, height: 1.9, shoulder: 0.7, fov: 0.55, drift: 0.03 },
    { dur: 6, subject: goS, target: { custom: 'walker' }, rig: 'pov', dist: 2.4, height: 1.9, shoulder: -0.7, fov: 0.55, drift: 0.03 },
  ] : [
    // Water: the ones it came to, round the brim.
    { dur: 7, subject: stayS, rig: 'crane', yaw: 0.9, dist: 14, dist2: 26, height: 4, height2: 12, fov: 0.7, drift: 0.05, subs: [{ t: 0.6, d: 3, text: title }] },
    // The others, going: small, walking out, the light low.
    { dur: 8, subject: goS, rig: 'static', yaw: 2.2, dist: 60, height: 14, fov: 0.55, drift: 0.04 },
    // One looks back.
    { dur: 5, subject: { npc: o.back, fallback: { point: o.at.go } }, rig: 'static', yaw: 0.4, dist: 4.2, height: 1.6, lookUp: 1, fov: 0.5, drift: 0.02, dof: 1.5 },
  ];
  return { people: [...o.stay, ...o.go], id: 'dunes-home-' + outcome, beats };
}
