// CPU-selected actual dune crests, verified against the rendered depth target.
import fs from 'node:fs';
const base='http://127.0.0.1:4176',label=process.argv[2]||'baseline',transverse=process.argv.includes('--transverse');
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const candidates=JSON.parse(fs.readFileSync('docs/phase-9/relaxation/crest-cpu-candidates'+(transverse?'-transverse':'')+'.json')).candidates,reports=[];
for(let i=0;i<candidates.length;i++){
 const source=candidates[i],spot={...source,id:`p9d2-${transverse?'transverse':'field'}-${i}`,biome:'dunes',restoration:'restored',hidePlayer:true,time:17.8,weather:'clear',wet:0,puddle:0,rain:0};
 const state=await cmd({do:'eval',js:`g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.game.killShaped();g.terrainState.relaxation.enabled=false;g.ws.restoration.frost='restored';g.ws.restoration.meadow='restored';g.ws.restoration.dunes='restored';g.clock.frozen=true;g.game.applySpot(${JSON.stringify(spot)});g.clock.pinHour=17.8;g.restoration.snap=true;const frame=()=>new Promise(r=>requestAnimationFrame(r));w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<240;i++)await frame();
 await frame();const p=g.post.post,tex=p.depthTex.getInternalTexture()._hardwareTexture.underlyingResource,W=tex.width,H=tex.height,row=Math.ceil(W*4/256)*256,device=w.gpuStats.device;
 const inv=Array.from(p.params.slice(0,16)),cam=g.camera.position.asArray(),target=${JSON.stringify(source.target)};
 const buffer=device.createBuffer({label:'crest-depth-readback',size:row*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:tex,aspect:'depth-only'},{buffer,bytesPerRow:row,rowsPerImage:H},[W,H,1]);device.queue.submit([enc.finish()]);await buffer.mapAsync(GPUMapMode.READ);const data=new Float32Array(buffer.getMappedRange());
 let nearest=null,miss=Infinity;
 for(let y=(H>>1)-32;y<=(H>>1)+32;y+=2)for(let x=(W>>1)-32;x<=(W>>1)+32;x+=2){
  const d=data[y*row/4+x];if(d<=0)continue;const nx=(x+.5)/W*2-1,ny=(y+.5)/H*2-1,q=inv[3]*nx+inv[7]*ny+inv[11]*d+inv[15];
  const pos=[(inv[0]*nx+inv[4]*ny+inv[8]*d+inv[12])/q,(inv[1]*nx+inv[5]*ny+inv[9]*d+inv[13])/q,(inv[2]*nx+inv[6]*ny+inv[10]*d+inv[14])/q];
  const error=Math.hypot(pos[0]-target[0],pos[1]-target[1],pos[2]-target[2]);if(error<miss){miss=error;nearest={pos,pixel:[x,y],range:Math.hypot(pos[0]-cam[0],pos[1]-cam[1],pos[2]-cam[2])};}
 }
 const centreDepth=data[(H>>1)*row/4+(W>>1)];buffer.unmap();buffer.destroy();
 return {size:[canvas.width,canvas.height],camera:cam,target,expectedSlant:Math.hypot(target[0]-cam[0],target[1]-cam[1],target[2]-cam[2]),nearestTargetMiss:miss===Infinity?null:miss,nearest,centreDepth,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
 await cmd({do:'eval',js:'w.botShotWidth=1280;'});const shot=await cmd({do:'shot',name:spot.id,dir:'d2-field-'+label,hud:false});reports.push({id:spot.id,nominalPlanarRange:source.distance,...state,file:shot.file});console.log(reports.at(-1));
 fs.writeFileSync('docs/phase-9/relaxation/crest-field-'+label+'.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Camera targets are actual CPU phase crests with local maxima along the view; read-only ray scout selected candidate horizons. GPU-depth search is 65x65px around aim at stride2, not a collision parity oracle. Miss measures the closest sampled rendered surface to the exact CPU point; jitter and pixel sampling remain approximate. Review images1280px from actual2560x1440 render. No crest/motion acceptance inferred from capture success.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
