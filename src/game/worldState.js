// World-state flags read by many systems (BRIEF §11). Plain data; saved verbatim.

export const BIOMES = ['frost', 'meadow', 'mire', 'dunes', 'ember', 'coast'];
export const WEATHER_STATES = {
  frost: ['clear', 'overcast', 'snowfall', 'blizzard'],
  meadow: ['clear', 'overcast', 'rain', 'storm'],
  mire: ['fog', 'drizzle', 'heavy-rain'],
  dunes: ['clear', 'heat-haze', 'sandstorm'],
  ember: ['ashfall', 'ember-storm'],
  coast: ['clear', 'sea-mist', 'storm'],
};

export const worldState = {
  /** Biome the player stands in. Phase 0 has only the test field, treated as frost. */
  biome: 'frost',
  /** The weather now (written by world/weather.js). */
  weather: 'clear',
  /** A forced weather state (dev overlay, photo spots), or null for the natural cycle. */
  weatherOverride: null,
  wetForce: -1, puddleForce: -1, rainForce: -1,
  /** A lightning strike to fire now (dev overlay, photo spots, the bot): { bearing (deg from the camera's view), dist (m), age (s into the strike), hold (keep it at that age) }, or null. */
  strike: null,
  /** Sandfall cascades forced frozen (photo spots), or null: the game's own (quest flags). */
  sandfallsFrozen: null,
  /** A forced sandstorm's start (photo spots): null inside it, 'arriving' its front 700 m upwind. */
  stormStart: null,
  /** @type {Record<string, 'stilled'|'restored'>} */
  restoration: { frost: 'stilled', meadow: 'stilled', mire: 'stilled', dunes: 'stilled', ember: 'stilled', coast: 'stilled' },
};
