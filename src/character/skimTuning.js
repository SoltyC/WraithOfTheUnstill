// Water-skim (Phase 10 F3; plan "its own feel"): the surf model on a cushion of water. The least friction in the game but the widest
// turns: the water gives no grip to carve against, so a turn at speed is a long arc and every carve bleeds little. Speed bleeds in the
// shallows (shoal: the owner sets it from the depth under the body), and deep water carries it — reading depth is the skill. Lent with
// Tide (the Listener's waking), with ?tide=1 to try it before then.
export const skimTuning = {
  cruise: 12,           // m/s the cushion carries toward on open water
  boost: 16,            // m/s pushing forward
  push: 6,              // m/s² from rest, falling off toward cruise
  gravity: 0,           // flat water
  drag: 0.009,          // 1/m air drag
  friction: 0.22,       // m/s²: the least in the game
  shoalDrag: 7,         // m/s² more at the shallowest (shoal 1)
  maxSpeed: 22,
  brake: 6.5,           // m/s² holding back, and letting go
  latMax: 6.5,          // m/s²: little grip — the widest turns
  carveDrag: 0.04,
  turnResponse: 3.6,    // 1/s: the carve answers slowly
  minTurnSpeed: 5,
  leanResponse: 5,
  maxLean: 0.5,
  exitSpeed: 4.2,
  /** Below this the cushion fails and the body goes into the water (m/s). */
  sink: 3.2,
  /** Depth (m) under which the shallows start to bleed speed, and at which a skim beaches (runs aground). */
  shoalDepth: 1.2, beach: 0.12,
};
