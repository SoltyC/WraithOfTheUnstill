// Photo spots for the Bell-mace's air moves (data/photo-spots.json, `weapon: { id: 'mace', height, … }`).
// The capture clock is frozen and the controller is not stepped by the scripted swing (systems/weapons.js),
// so this raises the Wraith `height` m, holds it there (the bell glows with the height: the telegraph shot)
// and, for `attack: 'plunge'`, presses LMB at `at` s and flies the fall and the rebound by hand: a 30 m/s drop,
// then the rebound's ballistic arc, landing on the ground query. The Shaped are stepped at 60 Hz alongside
// (a dunk's Shaped is thrown up first with `launch`), and `ice` lays a Crystallize sheet for the star.
//   weapon: { id: 'mace', attack: 'carry' | 'plunge', height: m, at?: s, launch?: [slot…], ice?: [right m, ahead m], seconds }

/** At the start of the roll: raise the Wraith, throw the chosen Shaped up, lay the ice. */
export function macePhotoInit(g, spec) {
  const c = g.controller, ground = g.ground;
  ground.qx = c.pos.x; ground.qz = c.pos.z; ground.sample();
  c.pos.y = ground.h + spec.height; c.grounded = false; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.plungeV = 0;
  g.weapons.plunge.reset();
  if (spec.launch) for (const k of spec.launch) g.shaped.air.launch(k);
  if (spec.ice) {
    const f = c.yaw, fx = Math.sin(f), fz = Math.cos(f), rx = fz, rz = -fx, fr = g.frost;
    fr.tx = c.pos.x + rx * spec.ice[0] + fx * spec.ice[1]; fr.tz = c.pos.z + rz * spec.ice[0] + fz * spec.ice[1];
    ground.qx = fr.tx; ground.qz = fr.tz; ground.sample(); fr.ty = ground.h;
    fr.castCrystal = true;
    for (let k = 0; k < 45; k++) { fr.dt = 1 / 60; fr.time += 1 / 60; fr.update(); }
    g.crystals.dirty = true; fr.crystalsDirty = false;
  }
}

/** One 60 Hz step of the roll: the Shaped, the Wraith in the air. Returns true on the step the plunge button goes down. */
export function macePhotoStep(g, spec, t, dt) {
  const c = g.controller, ground = g.ground, sh = g.shaped, pl = g.weapons.plunge;
  sh.px = c.pos.x; sh.pz = c.pos.z; sh.pvx = 0; sh.pvz = 0; sh.dt = dt; sh.time += dt; sh.update();
  if (!c.grounded) {
    if (c.plungeV > 0) c.pos.y -= c.plungeV * dt;
    else if (pl.stats.plunges > 0) { c.vel.y -= 24 * dt; c.pos.y += c.vel.y * dt; c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt; }
    ground.qx = c.pos.x; ground.qz = c.pos.z; ground.sample();
    if (c.pos.y <= ground.h) { c.pos.y = ground.h; c.grounded = true; c.vel.y = 0; }
  }
  const at = spec.at ?? 0.1;
  return spec.attack === 'plunge' && t >= at && !spec.pressed && (spec.pressed = true);
}
