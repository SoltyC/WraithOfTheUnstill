// Parity check: a JS mirror of shaders/clothSolve.wgsl.js against the CPU cloth (node tools/cloth/gpu-mirror.mjs).
// A JS mirror of shaders/clothSolve.wgsl.js (same job layout), run against the CPU cloth.
import { Wraith } from '../../src/character/wraith/wraith.js';
import { buildClothTopology, writeGpuJob, newGpuFigure, JOB_FLOATS, PART_FLOATS } from '../../src/character/wraith/clothGpu.js';
const mk = () => ({ qx: 0, qz: 0, h: 0, sample() { this.h = 0.15 * Math.sin(this.qx * 0.7) + 0.1 * Math.cos(this.qz * 0.5); } });
const cpu = new Wraith(mk());
const gw = new Wraith(mk()); gw.gpu = true;
const topo = buildClothTopology(cpu);
const N = topo.N, part = topo.part, pu = new Uint32Array(part.buffer), pi32 = new Int32Array(part.buffer);
const cons = topo.cons, cu = new Uint32Array(cons.buffer);
const jobs = new Float32Array(JOB_FLOATS), pins = new Float32Array(topo.nPins * 4), reset = new Float32Array(N * 8);
const state = new Float32Array(N * 8), outv = new Float32Array(N * 8);
const fig = newGpuFigure();
const f = Math.fround;
function V(i) { return [jobs[i*4], jobs[i*4+1], jobs[i*4+2], jobs[i*4+3]]; }
function solve() {
  const [slot, stepsF, itersF, dt] = V(0); const steps = Math.round(stepsF), iters = Math.round(itersF);
  const j1 = V(1), j2 = V(2), j3 = V(3), j4 = V(4), j5 = V(5);
  const colN = Math.round(j5[0]), flatMask = Math.round(j5[1]);
  const G = 36, onG = V(G)[3] > 0.5;
  const keep = Math.exp(-j2[3]*dt), air = Math.exp(-j3[3]*dt), vmax = j4[3]*dt;
  for (let i = 0; i < N; i++) for (let e = 0; e < 3; e++) { state[i*8+e] += j1[e]; state[i*8+4+e] += j1[e]; }
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < N; i++) {
      const o = i*8, P = i*PART_FLOATS;
      const x = [state[o], state[o+1], state[o+2]];
      if (part[P] === 0) { const pn = pi32[P+13]*4; for (let e=0;e<3;e++){ state[o+4+e]=x[e]; state[o+e]=pins[pn+e]; } continue; }
      const q = [state[o+4], state[o+5], state[o+6]]; let rr = 1;
      if (s === 0) { for (let e=0;e<3;e++) q[e] -= j3[e]*dt; rr = j1[3]; }
      let v = [0,1,2].map(e => (j2[e]*dt + ((x[e]-q[e])*rr - j2[e]*dt)*keep)*air);
      const v2 = v[0]**2+v[1]**2+v[2]**2; if (v2 > vmax*vmax) { const k = vmax/Math.sqrt(v2); v = v.map(a=>a*k); }
      for (let e=0;e<3;e++){ state[o+e] = x[e]+v[e]+j4[e]*dt*dt; state[o+4+e]=x[e]; }
    }
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < topo.colors; c++) for (let k = topo.ranges[c]; k < topo.ranges[c+1]; k++) {
        const a = cu[k*4], b = cu[k*4+1], r = cons[k*4+2], kk = cons[k*4+3];
        const wa = part[a*PART_FLOATS], wb = part[b*PART_FLOATS], ws = wa+wb; if (ws===0) continue;
        const oa=a*8, ob=b*8; const d3=[0,1,2].map(e=>state[ob+e]-state[oa+e]); const d=Math.hypot(...d3); if (d<1e-9) continue;
        const sc = ((d-r)/(d*ws))*kk; for (let e=0;e<3;e++){ state[oa+e]+=d3[e]*sc*wa; state[ob+e]-=d3[e]*sc*wb; }
      }
      for (let i = 0; i < N; i++) { const P=i*PART_FLOATS, ta=pi32[P+7]; if (ta<0) continue; const o=i*8, oa=ta*8;
        const d3=[0,1,2].map(e=>state[o+e]-state[oa+e]); const d2=d3[0]**2+d3[1]**2+d3[2]**2, L=part[P+8];
        if (d2>L*L){ const s2=L/Math.sqrt(d2); for(let e=0;e<3;e++) state[o+e]=state[oa+e]+d3[e]*s2; } }
      if (it === (iters>>1) || it === iters-1) for (let i = 0; i < N; i++) { const P=i*PART_FLOATS; if (part[P]===0) continue; collide(i*8, pu[P+2], colN, flatMask); }
    }
    if (onG) for (let i = 0; i < N; i++) { const P=i*PART_FLOATS; if (pu[P+1]===0||part[P]===0) continue; const o=i*8;
      const fl = groundAt(state[o], state[o+2]) + 0.015;
      if (state[o+1] < fl) { state[o+1]=fl; state[o+4]+=(state[o]-state[o+4])*0.15; state[o+6]+=(state[o+2]-state[o+6])*0.15; state[o+5]=fl; } }
  }
  const ob = V(46);
  for (let i = 0; i < N; i++) { for (let e=0;e<3;e++) outv[i*8+e] = ob[e] + state[i*8+e]*ob[3]; }
}
function groundAt(x, z) { const gh = V(36); const fx = Math.min(4, Math.max(0, (x-gh[0])/gh[2])), fz = Math.min(4, Math.max(0, (z-gh[1])/gh[2]));
  const i0 = Math.min(Math.floor(fx), 3), j0 = Math.min(Math.floor(fz), 3), tx = fx-i0, tz = fz-j0; const H = (f) => jobs[37*4+f];
  const h00=H(j0*5+i0), h10=H(j0*5+i0+1), h01=H((j0+1)*5+i0), h11=H((j0+1)*5+i0+1);
  return (h00+(h10-h00)*tx)*(1-tz) + (h01+(h11-h01)*tx)*tz; }
function collide(o, mask, colN, flatMask) {
  let p = [state[o], state[o+1], state[o+2]];
  for (let k = 0; k < colN; k++) { const bit = 1<<k; if ((mask & bit) === 0) continue;
    const A = V(6+k*2), B = V(7+k*2); const a=A.slice(0,3), e=[B[0]-a[0],B[1]-a[1],B[2]-a[2]], r=A[3], kk=B[3];
    let ee = e[0]**2+e[1]**2+e[2]**2 || 1e-9; const m=[a[0]+e[0]*0.5,a[1]+e[1]*0.5,a[2]+e[2]*0.5], br=Math.sqrt(ee)*0.5+r;
    let d=[p[0]-m[0],p[1]-m[1],p[2]-m[2]]; if (d[0]**2+d[1]**2+d[2]**2 > br*br) continue;
    let t = ((p[0]-a[0])*e[0]+(p[1]-a[1])*e[1]+(p[2]-a[2])*e[2])/ee; t=Math.min(1,Math.max(0,t));
    d=[p[0]-(a[0]+e[0]*t),p[1]-(a[1]+e[1]*t),p[2]-(a[2]+e[2]*t)]; const d2=d[0]**2+d[1]**2+d[2]**2; if (d2>=r*r) continue;
    if (flatMask & bit) { const hh=d[0]**2+d[2]**2; if (hh<1e-10) continue; const lim=r*r-d[1]**2; if (lim<=0) continue; const sc=(Math.sqrt(lim/hh)-1)*kk; p[0]+=d[0]*sc; p[2]+=d[2]*sc; continue; }
    const dl = Math.sqrt(d2)||1e-6; const push=(r-dl)/dl*kk; p=p.map((v,i2)=>v+d[i2]*push); }
  state[o]=p[0]; state[o+1]=p[1]; state[o+2]=p[2];
}
// Walk both: start, walk, turn, stop, in wind.
let x = 1000, z = 2000, yaw = 0;
const stats = [];
for (let fr = 0; fr < 600; fr++) {
  const dt = 1/60; const sp = fr < 150 ? 0 : fr < 400 ? 1.4 : 0; if (fr > 250 && fr < 330) yaw += 0.02;
  const vx = Math.sin(yaw)*sp, vz = Math.cos(yaw)*sp; x += vx*dt; z += vz*dt;
  for (const w of [cpu, gw]) { w.bx = x; w.by = 0; w.bz = z; w.vx = vx; w.vz = vz; w.yaw = yaw; w.dt = dt; w.time = fr*dt; w.windStrength = 0.6; w.windX = 1; w.windZ = 0.3; w.update(); }
  if (writeGpuJob(gw, fig, topo, 0, jobs, 0, pins, reset, null)) state.set(reset);
  solve();
  if (fr % 100 === 99) {
    // compare: mean distance, hem height, robe max stretch
    let dsum = 0, dmax = 0; const p = cpu.cloth.p;
    for (let i = 0; i < N; i++) { const d = Math.hypot(p[i*3]-outv[i*8], p[i*3+1]-outv[i*8+1], p[i*3+2]-outv[i*8+2]); dsum += d; dmax = Math.max(dmax, d); }
    const str = (P) => { let m = 0; const c = cpu.cloth; for (let k = 0; k < c.c; k++) { const a=c.ci[2*k], b=c.ci[2*k+1]; const L = Math.hypot(P(b,0)-P(a,0),P(b,1)-P(a,1),P(b,2)-P(a,2)); m = Math.max(m, L/c.cr[k]); } return m; };
    console.log('frame', fr+1, 'mean diff', (dsum/N*100).toFixed(2), 'cm  max', (dmax*100).toFixed(1), 'cm  stretch cpu', str((i,e)=>p[i*3+e]).toFixed(3), 'gpu', str((i,e)=>outv[i*8+e]).toFixed(3));
  }
}
