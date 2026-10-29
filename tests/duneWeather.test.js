import {describe,it,expect} from 'vitest';
import {createWeather,FROST_STATES,MEADOW_STATES,DUNES_STATES} from '../src/world/weather.js';
const fields=['cover','snow','rain','storm','wind','fog','gust'];

describe('dry Dunes weather and three-biome blending',()=>{
  it('preserves the frost/meadow targets exactly at dunes0',()=>{
    for(const [meadow,table,state]of [[0,FROST_STATES,'blizzard'],[1,MEADOW_STATES,'storm']]){
      const w=createWeather();w.restored=w.meadowRestored=1;w.meadow=meadow;w.dunes=0;w.override=state;w.update();
      for(const field of fields)expect(w[field]).toBe(table[state][field]);
      expect(w.sand).toBe(0);
    }
  });
  it('never substitutes frost precipitation for restored or stilled desert air',()=>{
    for(const restored of [0,1])for(const state of ['clear','heat-haze','rain','snowfall','blizzard','storm','sandstorm']){
      const w=createWeather();w.restored=w.meadowRestored=1;w.dunes=1;w.dunesRestored=restored;w.override=state;w.update();
      expect(w.snow).toBe(0);expect(w.rain).toBe(0);expect(w.storm).toBe(0);expect(w.sand).toBe(0);
      expect(w.state).toBe(state==='clear'?'clear':'heat-haze');
      if(!restored)expect(w.gust).toBe(0);
    }
  });
  it('blends dry desert weather continuously at a snow/rain border',()=>{
    const base=createWeather();base.restored=base.meadowRestored=1;base.meadow=.4;base.override='snowfall';base.update();
    for(const d of [0,.001,.25,.5,.999,1]){
      const w=createWeather();w.restored=w.meadowRestored=w.dunesRestored=1;w.meadow=.4;w.dunes=d;w.override='snowfall';w.update();
      for(const field of fields)expect(w[field]).toBeCloseTo(base[field]+(DUNES_STATES['heat-haze'][field]-base[field])*d,12);
    }
  });
  it('cycles deterministically while keeping the unfinished storm capability off by default',()=>{
    const run=()=>{const w=createWeather();w.dunes=1;w.dunesRestored=1;const states=[];
      expect(w.duneStorms).toBe(false);
      for(let i=0;i<7200;i++){w.dt=1;w.update();expect(w.snow+w.rain+w.storm+w.sand).toBe(0);if(i%60===0)states.push(w.state);}
      expect(new Set(states)).toEqual(new Set(['clear','heat-haze']));
      w.duneStorms=true;w.override='sandstorm';w.snap=true;w.update();expect(w.sand).toBe(1);expect(w.state).toBe('sandstorm');
      return states;
    };
    expect(run()).toEqual(run());
  });
});
