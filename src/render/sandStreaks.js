// One storm-only draw over the composed HDR target. Shares the existing precipitation
// geometry and scene depth; no new full-screen texture or CPU particle pool.
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {Vector4} from '@babylonjs/core/Maths/math.vector.js';
import {Constants} from '@babylonjs/core/Engines/constants.js';
import {ENV_UNIFORMS} from '../shaders/common.wgsl.js';
import {ATMO_MATERIAL_TEXTURES,ATMO_MATERIAL_BUFFERS} from '../shaders/atmoMaterial.wgsl.js';
import {SHADOW_TEXTURES} from '../shaders/shadows.wgsl.js';
import {sandStreakVertexWGSL,sandStreakFragmentWGSL} from '../shaders/sandStreaks.wgsl.js';
import {bindEnvironment} from './environment.js';
import {bindAtmosphere} from './atmosphereBindings.js';
import {fastFrozenIsReady} from './babylonTweaks.js';

export function createSandStreaks(scene,clipmap,atmo,wind,front,snowfall,chain){
  const engine=scene.getEngine(),post=chain.post;
  ShaderStore.ShadersStoreWGSL.sandStreaksVertexShader=sandStreakVertexWGSL;
  ShaderStore.ShadersStoreWGSL.sandStreaksFragmentShader=sandStreakFragmentWGSL;
  const mesh=snowfall.mesh.clone('sandStreaks',null,true);
  mesh.layerMask=0;mesh.alwaysSelectAsActiveMesh=false;mesh.freezeWorldMatrix();
  const travel=new Vector4(0,0,0,0),view=new Vector4(Math.tan(scene.activeCamera.fov*.5)*8/1440,0,0,0);
  const mat=new ShaderMaterial('sandStreaks',scene,{vertex:'sandStreaks',fragment:'sandStreaks'},{
    attributes:['position'],uniforms:['viewProjection','levels','grainTravel','grainView','windField',...ENV_UNIFORMS],
    samplers:[...ATMO_MATERIAL_TEXTURES,...SHADOW_TEXTURES],
    storageBuffers:['levelData','biomeA','windMap',...ATMO_MATERIAL_BUFFERS,'shadowData'],
    shaderLanguage:ShaderLanguage.WGSL,needAlphaBlending:true,
  });
  bindEnvironment(mat);bindAtmosphere(mat,atmo);
  mat.setArray4('levels',clipmap.levels);mat.setArray4('windField',wind.block);mat.setVector4('grainTravel',travel);mat.setVector4('grainView',view);
  mat.setStorageBuffer('levelData',clipmap.levelData);mat.setStorageBuffer('biomeA',clipmap.buffers.biomeA);mat.setStorageBuffer('windMap',clipmap.buffers.wind);
  mat.alphaMode=Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;mat.disableDepthWrite=true;mat.backFaceCulling=false;
  mat.depthFunction=Constants.GREATER;mesh.material=mat;mat.freeze();fastFrozenIsReady(mat);
  const passId=engine.createRenderPassId('sandStreaks');
  let target=null,warmed=false,wasActive=false;
  const build=()=>{
    if(target)target.dispose();
    const color=chain.comp.out.getInternalTexture();
    // Both owners release exactly one reference on resize/dispose. shareDepth increments its
    // reference itself; external colorAttachment does not, so retain it explicitly.
    color.incrementReferences();
    target=engine.createRenderTargetTexture({width:post.width,height:post.height},{
      colorAttachment:color,generateDepthBuffer:false,generateStencilBuffer:false,generateMipMaps:false,label:'sandStreaks',
    });
    post.sceneRT.renderTarget.shareDepth(target);
    // Babylon snapshot bundle descriptors do not carry depthReadOnly. Use its normal
    // load/store attachment and disable material depth writes; the oracle checks bit identity.
    grains.targetBuilds++;
  };
  const grains={mesh,material:mat,on:true,dt:0.0,wet:0.0,drawnFrames:0,targetBuilds:0,
    get warmed(){return warmed;},get target(){return target;},get travel(){return travel;},
    update(){
      travel.w=this.on?1-Math.max(0,Math.min(1,this.wet/.65)):0;
      const active=this.on&&front.block[3]>1e-5&&wind.stormWeight>1e-5&&travel.w>1e-5;
      // Reset before scene rendering, never midway through the recorded post chain.
      if(active!==wasActive){engine.snapshotRenderingReset();wasActive=active;}
      if(!(front.block[3]>0)||!(wind.stormWeight>0))return;
      view.x=Math.tan(scene.activeCamera.fov*.5)*8/1440;
      wind.sx=scene.activeCamera.position.x;wind.sz=scene.activeCamera.position.z;wind.sample();
      // Recycle the whole column with open-air transport; local shelter sets grain
      // opacity/stretch in the shader, without slowing grains outside the lee region.
      travel.x+=wind.outX*wind.rawSpeed*8*this.dt;travel.y+=wind.outZ*wind.rawSpeed*8*this.dt;travel.z+=.22*this.dt;
      if(travel.x>5200)travel.x-=5200;else if(travel.x< -5200)travel.x+=5200;
      if(travel.y>5200)travel.y-=5200;else if(travel.y< -5200)travel.y+=5200;
      if(travel.z>9000)travel.z-=9000;
    },
    run(){
      const active=this.on&&front.block[3]>1e-5&&wind.stormWeight>1e-5&&travel.w>1e-5;
      if(warmed&&!active)return;
      const oldPass=engine.currentRenderPassId,alpha=engine.getAlphaMode(),depth=engine.getDepthBuffer(),write=engine.getDepthWrite(),func=engine.getDepthFunction();
      engine.currentRenderPassId=passId;let bound=false;
      try{
        if(!mat.isReady(mesh,false,mesh.subMeshes[0]))return;
        engine.bindFramebuffer(target,0,post.width,post.height,true);bound=true;
        // Start a load-only pass before material depth state is applied. Babylon's lazy
        // pass startup otherwise replaces the chosen compare with reverse-Z GEQUAL.
        if(!engine.snapshotRendering)engine.clear(null,false,false,false);
        engine.setDepthBuffer(true);
        for(let i=0;i<mesh.subMeshes.length;i++)mesh.render(mesh.subMeshes[i],true);
        warmed=true;this.drawnFrames++;
      }finally{
        if(bound)engine.unBindFramebuffer(target,true);
        engine.setAlphaMode(alpha);engine.setDepthBuffer(depth);engine.setDepthWrite(write);engine.setDepthFunction(func);
        engine.currentRenderPassId=oldPass;scene.resetCachedMaterial();
      }
    },
  };
  build();post.onResize(build);
  scene.onDisposeObservable.add(()=>{target.dispose();engine.releaseRenderPassId(passId);});
  return grains;
}
