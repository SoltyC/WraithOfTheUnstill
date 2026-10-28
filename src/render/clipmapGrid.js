// Static grid topology, shared by the visible terrain and a cheaper shadow-only caster.
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
export function createClipmapGrid(scene,n,levels,name,first=0,ring=false){
  const {positions,indices}=createClipmapTopology(n,ring);
  const mesh=new Mesh(name,scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh,false);
  const mats=new Float32Array(16*levels);
  for(let l=0;l<levels;l++){const o=l*16;mats[o]=mats[o+5]=mats[o+10]=mats[o+15]=1;mats[o+12]=first+l;}
  mesh.thinInstanceSetBuffer('matrix',mats,16,true);mesh.alwaysSelectAsActiveMesh=true;mesh.doNotSyncBoundingInfo=true;
  return mesh;
}

/** Static triangle topology; omitted cells must be hidden for every legal finer-origin shift. */
export function createClipmapTopology(n,ring=false){
  if(n<16||n%4)throw new Error('Clipmap grid must be divisible by four and at least 16 cells');
  // The origin may differ from the finer level by one cell. Keep a two-cell buried guard
  // around the hole, so the existing geomorph/skirt joins remain unchanged.
  const lo=n/4+2,hi=3*n/4-2,hole=ring?(hi-lo)*(hi-lo):0;
  const v=n+1,positions=new Float32Array(v*v*3),indices=new Uint32Array((n*n-hole)*6);
  for(let j=0;j<v;j++)for(let i=0;i<v;i++){const k=(j*v+i)*3;positions[k]=i-n/2;positions[k+2]=j-n/2;}
  let p=0;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    if(ring&&i>=lo&&i<hi&&j>=lo&&j<hi)continue;
    const a=j*v+i,b=a+1,c=a+v,d=c+1;
    indices[p++]=a;indices[p++]=d;indices[p++]=c;indices[p++]=a;indices[p++]=b;indices[p++]=d;
  }
  return {positions,indices};
}
