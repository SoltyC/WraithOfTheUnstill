// Costumes by people (docs/people-and-cutscenes.md §1.2, the per-people sheet). Each is read by systems/npcs.js
// makeNpc(opt.costume) and render/wraith.js: tint multiplies the robe's charcoal wool (the tunic), shawl and cowl are
// absolute wool colours, sash and band the existing robe dyes; hat and basket are rigid parts (render/costume.js).
// The gate (§1.3): one Sow farmer first, judged by the user in six shots (tools/bot/costume-gate.mjs), before any other.

export const COSTUMES = {
  /** The Sow farmers: a madder-and-ochre wool tunic with a cream hem band, a woad shawl striped at its edge,
   *  an ochre sash, a brown wool hood under a broad straw hat, a willow basket of figs. */
  sow: {
    tint: [0.72, 0.4, 0.26],
    shawl: [0.018, 0.035, 0.09],
    cowl: [0.05, 0.04, 0.032],
    sash: [0.26, 0.16, 0.04],
    band: [0.4, 0.35, 0.25],
    fur: false,
    hat: true,
    basket: true,
  },
  /** Cinderhold's miners (docs/phase-11/ember-design.md §4.1): soot-grey wool, a leather sash, a black hood, no hat (the
   *  galleries are low); the guild's masters over it an oxblood shawl (data: { base: 'cinder', shawl: [...] }). */
  cinder: {
    tint: [0.3, 0.27, 0.24],
    cowl: [0.03, 0.028, 0.026],
    sash: [0.1, 0.06, 0.035],
    band: [0.06, 0.055, 0.05],
    fur: false,
    hat: false,
    basket: false,
  },
  /** The Ash Chapel's pilgrims (§4.2): undyed wool gone ash-pale, a white hood, a bronze-yellow cord; the Seer a grey shawl. */
  ash: {
    tint: [0.78, 0.76, 0.72],
    cowl: [0.5, 0.49, 0.47],
    sash: [0.32, 0.22, 0.07],
    band: [0.55, 0.53, 0.5],
    fur: false,
    hat: false,
    basket: false,
  },
};
