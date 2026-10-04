// The music director (BRIEF §13): decides which bed plays, by priority — the release, the Warden
// fight, the title, the waking, a shrine, the camp's lyre — and fires the stingers (the Warden
// waking, death, an Echo). Silence otherwise: exploring the steppe has only the wind.

/** @param {any} g  shared boot context */
export function addAudioSystem(g) {
  const { loop, music, warden, wardenMod, combat, controller, camera, arm, pois } = g;
  const W = wardenMod.W;
  const shrines = pois.filter((p) => p.kind === 'shrine');
  const SHRINE_R = 30, FIGHT_R = 190;
  /** Set by the game: the waking cue on a new game, the title screen, the camp's fire (x, y, z). */
  const state = g.musicState = { waking: false, title: false, camp: null };
  let lastWarden = -1, lastDying = false;

  loop.add({ name: 'music', update: () => {
    const p = controller.pos;
    let want = null;
    const ws = warden.active ? warden.state : -1;
    if (ws === W.DORMANT && lastWarden !== W.DORMANT) music.rearm('release');
    if (ws === W.AWAKE && lastWarden === W.DORMANT) music.sting('wake');
    lastWarden = ws;
    const dying = combat.dying > 0;
    if (dying && !lastDying) music.sting('death');
    lastDying = dying;
    if (ws === W.RELEASE || ws === W.RESTED) want = 'release';
    else if (ws >= 0 && ws !== W.DORMANT && !dying) {
      const dx = warden.body.x - p.x, dz = warden.body.z - p.z;
      if (dx * dx + dz * dz < FIGHT_R * FIGHT_R) want = 'fight';
    }
    if (want === null && state.title) want = 'title';
    if (want === null && state.waking) want = 'waking';
    if (want === null) {
      for (let k = 0; k < shrines.length; k++) {
        const s = shrines[k], dx = s.pos[0] - p.x, dz = s.pos[1] - p.z;
        if (dx * dx + dz * dz < SHRINE_R * SHRINE_R) { want = 'shrine'; break; }
      }
    }
    if (want === null && state.camp) {
      const c = state.camp, dx = c[0] - p.x, dz = c[2] - p.z;
      if (dx * dx + dz * dz < 90 * 90) { want = 'camp'; music.sx = c[0]; music.sy = c[1]; music.sz = c[2]; }
    }
    if (music.finished === 'waking') { state.waking = false; music.finished = null; }
    music.want = want;
    const cp = camera.position;
    music.lx = cp.x; music.ly = cp.y; music.lz = cp.z; music.fx = Math.sin(arm.yaw); music.fz = Math.cos(arm.yaw);
    music.update();
  } });
}
