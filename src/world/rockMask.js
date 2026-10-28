// Build once from the same baked surface IDs gameplay uses. Other surface channels never classify rock.
export function createRockMask(surface,rockId){
  if(surface.length%4)throw new Error('Surface map must contain complete RGBA texels');
  const out=new Uint8Array(surface.length/4);
  for(let i=0;i<out.length;i++)out[i]=surface[i*4]===rockId?255:0;
  return out;
}
