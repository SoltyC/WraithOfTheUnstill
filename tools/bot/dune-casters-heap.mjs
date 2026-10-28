import fs from 'node:fs/promises';
import {SourceMapConsumer} from 'source-map-js';
import {openSession} from '../winchrome/session.mjs';
const maps=new Map();
const label=process.argv[2]||'latest-grade';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Use a simple report label');
async function source(cf){
 const m=/\/assets\/([^/?#]+\.js)/.exec(cf.url);
 if(!m)return cf.url+':'+(cf.lineNumber+1);
 if(!maps.has(m[1])){
  try{maps.set(m[1],new SourceMapConsumer(JSON.parse(await fs.readFile('dist/assets/'+m[1]+'.map','utf8'))));}
  catch{maps.set(m[1],null);}
 }
 const p=maps.get(m[1])?.originalPositionFor({line:cf.lineNumber+1,column:cf.columnNumber});
 return p?.source?p.source.replace(/^.*node_modules\//,'').replace(/^(\.\.\/)+/,'')+':'+p.line:cf.url+':'+(cf.lineNumber+1);
}
async function attribute(profile,frames){
 const nodes=new Map(),parents=new Map(),sites=new Map(),stacks=new Map(),featurestacks=new Map();
 function walk(n,p){nodes.set(n.id,n);if(p)parents.set(n.id,p);for(const c of n.children)walk(c,n);}
 walk(profile.head,null);
 const names=new Map();for(const n of nodes.values())names.set(n.id,await source(n.callFrame));
 let total=0,own=0,engine=0,feature=0;
 for(const sample of profile.samples){
  let n=nodes.get(sample.nodeId),owner='',isD9b=false,stack=[];
  while(n){
   const src=names.get(n.id);
   if(!owner&&/^(src\/|@babylonjs)/.test(src))owner=src;
   if(/^src\/(game\/shaped\/(duneCaster|rigGlass)|render\/duneCasterDust)/.test(src))isD9b=true;
   if(stack.length<12)stack.push((n.callFrame.functionName||'(anonymous)')+' '+src);
   n=parents.get(n.id);
  }
  total+=sample.size;
  if(owner.startsWith('src/')&&!owner.startsWith('src/render/babylonTweaks.js'))own+=sample.size;
  else if(owner)engine+=sample.size;
  const key=stack.join(' <- ');
  stacks.set(key,(stacks.get(key)||0)+sample.size);
  const leaf=stack[0];sites.set(leaf,(sites.get(leaf)||0)+sample.size);
  if(isD9b){feature+=sample.size;featurestacks.set(key,(featurestacks.get(key)||0)+sample.size);}
 }
 const top=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([site,bytes])=>({site,bytes,bytesPerFrame:bytes/frames}));
 return {totalBytes:total,ownBytes:own,engineBytes:engine,featureStackBytes:feature,totalPerFrame:total/frames,ownPerFrame:own/frames,featurePerFrame:feature/frames,topSites:top(sites),topStacks:top(stacks),featureStacks:top(featurestacks)};
}
const session=await openSession({url:'http://localhost:4175/',query:'title=0',width:2560,height:1440});
const {page}=session,reports=[];
try{
 await session.teleport(1900,900);
 await page.evaluate(()=>{
  const w=window.__wraith,g=w.g;
  g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.clock.pinHour=17.8;
  g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.ws.weatherOverride='clear';g.restoration.snap=true;
  w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.v.refillRate=0;w.params.version++;
  g.combat.health=10000;g.combat.dying=0;g.arm.setFree(false);g.arm.yaw=0;
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.enable');
 for(const enabled of [false,true]){
  await session.teleport(1900,900);
  await page.evaluate(enabled=>{
   const w=window.__wraith,g=w.g;if(g.terrainState.relaxation)g.terrainState.relaxation.enabled=false;g.terrainState.restore([]);g.stone.mass.clear();
   g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.game.spawnShaped(enabled?'whirler':'skitter',4);g.game.spawnShaped(enabled?'glasssworn':'plateback',4);

   g.combat.health=10000;w.inject('MoveForward',true);
  },enabled);
  await session.frames(240);await cdp.send('HeapProfiler.collectGarbage');
  const before=await page.evaluate(()=>{const w=window.__wraith,g=w.g;return {frame:g.clock.frame,time:g.clock.simTime,jobs:g.terrainState.relaxation?.jobs||0,reads:g.terrainState.collision?.reads||0,pos:[g.controller.pos.x,g.controller.pos.z],active:g.shaped.slots.filter(s=>s.state!==0).length};});
  await cdp.send('HeapProfiler.startSampling',{samplingInterval:16,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  await page.waitForTimeout(10000);
  const {profile}=await cdp.send('HeapProfiler.stopSampling');
  const after=await page.evaluate(()=>{const w=window.__wraith,g=w.g;w.inject('MoveForward',false);return {frame:g.clock.frame,time:g.clock.simTime,jobs:g.terrainState.relaxation?.jobs||0,reads:g.terrainState.collision?.reads||0,pos:[g.controller.pos.x,g.controller.pos.z],active:g.shaped.slots.filter(s=>s.state!==0).length,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,output:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],internal:[g.post.post.width,g.post.post.height],renderScale:g.post.post.renderScale};});
  const frames=after.frame-before.frame;
  reports.push({enabled,before,after,frames,samplingInterval:16,...await attribute(profile,frames)});
  await fs.writeFile('docs/phase-9/dune-casters/'+label+'-browser-heap.json',JSON.stringify({date:new Date().toISOString(),reports,errors:session.logs,note:'Real Windows GPU browser V8 allocation sampling including collected objects. Eight Shaped and live walking; disabled means4Skitters+4Platebacks, enabled means4Whirlers+4Glass-sworn. These are separate workloads, not identical frame replays or an isolated net delta. Profiler affects frame timing. Attribution uses first resolved own/engine stack source; Feature-inclusive stacks include duneCaster,rigGlass,duneCasterDust plus any engine/native overhead beneath those callsites. No zero-allocation inference from GC count.'},null,2)+'\n');
  console.log({enabled,frames,ownPerFrame:reports.at(-1).ownPerFrame,featurePerFrame:reports.at(-1).featurePerFrame});
 }
}finally{await session.close();}
