// The weather state tables and cycles (world/weather.js owns the machine): one table per biome
// (frost, meadow, dunes) and per restoration (restored, stilled). A state is a set of targets the live
// parameters ease toward. cover: cloud cover 0..1; snow, rain, storm: precipitation and
// thunderstorm intensity 0..1; wind: wind multiplier; fog: weather fog density 0..1 (visibility);
// gust: gustiness 0..1.

export const FROST_STATES = {
  clear: { cover: 0.3, snow: 0, rain: 0, storm: 0, wind: 1, fog: 0.04, gust: 0.3 },
  overcast: { cover: 0.82, snow: 0, rain: 0, storm: 0, wind: 1.15, fog: 0.22, gust: 0.4 },
  snowfall: { cover: 0.94, snow: 0.55, rain: 0, storm: 0, wind: 0.85, fog: 0.42, gust: 0.3 },
  blizzard: { cover: 1, snow: 1, rain: 0, storm: 0, wind: 2.4, fog: 1, gust: 1 },
};
/** The meadow: warm rain is lighter on the air than snow (less fog), the storm wind is strong and
 *  gusty (fronts the grass, trees and cloth all read) under a low, dark, closed deck. */
export const MEADOW_STATES = {
  clear: FROST_STATES.clear,
  overcast: FROST_STATES.overcast,
  rain: { cover: 0.95, snow: 0, rain: 0.6, storm: 0, wind: 1.1, fog: 0.26, gust: 0.4 },
  storm: { cover: 1, snow: 0, rain: 1, storm: 1, wind: 2.1, fog: 0.4, gust: 1 },
};
/** The erg has dry clear/haze air. Sandstorm targets remain gated until the actual front,
 * visibility, streaks and state-erasure consumers are ready; never substitute a snowstorm. */
export const DUNES_STATES = {
  clear: {cover:.08,snow:0,rain:0,storm:0,wind:1,fog:.02,gust:.25,sand:0},
  'heat-haze': {cover:.04,snow:0,rain:0,storm:0,wind:.8,fog:.14,gust:.35,sand:0},
  sandstorm: {cover:.1,snow:0,rain:0,storm:0,wind:2.6,fog:.14,gust:1,sand:1},
};
export const STILLED_DUNES_STATES = {
  clear:{...DUNES_STATES.clear,gust:0},
  'heat-haze':{...DUNES_STATES['heat-haze'],wind:1,gust:0},
};
export const DUNES_CYCLE=[['clear',420,720],['heat-haze',240,420],['sandstorm',140,240],['heat-haze',120,240],['clear',360,600]];
export const STILLED_DUNES_CYCLE=[['clear',600,900],['heat-haze',300,600]];

/** Stilled frost/meadow variants: no precipitation, still air. */
export const STILLED_STATES = {
  clear: { cover: 0.2, snow: 0, rain: 0, storm: 0, wind: 1, fog: 0.06, gust: 0 },
  overcast: { cover: 0.7, snow: 0, rain: 0, storm: 0, wind: 1, fog: 0.3, gust: 0 },
};

/** Restored cycles: [state, min s, max s]. The meadow's storm comes once a round, behind rain. */
export const FROST_CYCLE = [['clear', 420, 720], ['overcast', 240, 420], ['snowfall', 200, 360], ['blizzard', 120, 220], ['snowfall', 120, 200], ['overcast', 160, 300]];
export const MEADOW_CYCLE = [['clear', 420, 720], ['overcast', 200, 360], ['rain', 220, 400], ['storm', 140, 240], ['rain', 120, 220], ['overcast', 160, 280], ['clear', 360, 600], ['overcast', 160, 260], ['rain', 180, 320], ['overcast', 140, 240]];
export const STILLED_CYCLE = [['clear', 600, 900], ['overcast', 300, 600]];

const FROST_MAP = { rain: 'snowfall', storm: 'blizzard', cloudy: 'overcast', thunderstorm: 'blizzard' };
const MEADOW_MAP = { snowfall: 'rain', blizzard: 'storm', cloudy: 'overcast', thunderstorm: 'storm' };

/**
 * A (possibly forced) state name on a biome's table. A name the biome has not (rain in the frost,
 * snowfall in the meadow) maps to its counterpart (rain <-> snowfall, storm <-> blizzard); one the
 * stilled air cannot hold (precipitation) falls back to overcast, anything else to clear.
 * @param {string} name  @param {'frost'|'meadow'|'dunes'} biome  @param {boolean} restored
 */
export function resolveState(name, biome, restored) {
  if(biome==='dunes'){
    if(name==='overcast'||name==='cloudy'||name==='haze'||name==='heat')return 'heat-haze';
    if(name==='sandstorm'&&restored)return name;
    if(name==='snowfall'||name==='blizzard'||name==='rain'||name==='storm'||name==='thunderstorm'||name==='sandstorm')return 'heat-haze';
    return name==='heat-haze'?name:'clear';
  }
  name = (biome === 'frost' ? FROST_MAP[name] : MEADOW_MAP[name]) || name;
  const table = restored ? (biome === 'frost' ? FROST_STATES : MEADOW_STATES) : STILLED_STATES;
  if (table[name]) return name;
  return name === 'snowfall' || name === 'blizzard' || name === 'rain' || name === 'storm' ? 'overcast' : 'clear';
}
