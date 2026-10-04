// World-state flags read by many systems (BRIEF §11). Plain data; saved verbatim.

export const BIOMES = ['frost', 'meadow', 'mire', 'dunes', 'ember', 'coast'];
export const WEATHER_STATES = {
  frost: ['clear', 'overcast', 'snowfall', 'blizzard'],
  meadow: ['clear', 'cloudy', 'rain', 'thunderstorm'],
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
  /** @type {Record<string, 'stilled'|'restored'>} */
  restoration: { frost: 'stilled', meadow: 'stilled', mire: 'stilled', dunes: 'stilled', ember: 'stilled', coast: 'stilled' },
};
