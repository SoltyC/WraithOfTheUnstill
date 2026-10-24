// "The Fen Lamp": Ketil lights the Wraith's lantern after dark (flame.js carries it: it gutters, a
// blow or a hard wind puts it out and Ketil lights it again); the Fen Lamp on the north shore of
// the lake takes the flame. Lit, it stays lit (`lit:side-brazier-fen`, saved with the flags).

const ID = 'side-brazier-fen';

export function addLamp(ctx) {
  const { g, flags, site, seatY, glow } = ctx, { chapter, hud, music, sfx, SFX, capture } = g;
  const place = ctx.table['side-fen-lamp'];
  const i = site(ID);
  if (!place || i < 0) return { tick() {} };
  const t = { kind: 'lamp', id: ID, verb: 'Light', name: 'The Fen Lamp', x: place.pos[0], y: place.h, z: place.pos[1], r: 3.6, h: 2.0,
    onUse: () => {
      const f = g.flame;
      if (flags.has('lit:' + ID)) { hud.notice('The Fen Lamp', 'Burning', null, 3); return; }
      if (!f.carrying) { hud.notice('The Fen Lamp', 'Cold', 'It needs a carried flame. Ketil, in Hearn, lights lanterns after dark.', 5); return; }
      flags.add('lit:' + ID); flags.add('meadow:side-lamp-lit'); f.carrying = false;
      chapter.raise('use:' + ID); music.sting('echo');
      sfx.x = t.x; sfx.y = t.y + 2; sfx.z = t.z; sfx.gain = 1; sfx.play(SFX.WHOOSH);
      if (!capture) hud.notice('The Fen Lamp', 'Lit again', 'The path along the shore is safe. Tell Ketil.', 6);
    } };
  g.interactables.push(t);
  return {
    tick() {
      t.y = seatY(i, place.h);
      glow[i * 4 + 3] = flags.has('lit:' + ID) ? 1 : 0;   // the bowl's ember
    },
  };
}
