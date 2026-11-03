// The snow you write in (the site's interactive moment): a field of snow at dusk, seen low, that the visitor's cursor or finger
// carves — a groove with its powder thrown up either side, as the Wraith's feet and verbs score the game's snow — and that heals
// slowly. WebGL2, one full-screen pass over a ping-ponged height field; no libraries. Falls back to nothing (the poster stays) if
// WebGL2 isn't there.

const N = 512;               // height field texels (a 24 m square of snow)
const SPAN = 24;

const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Height field step: heal toward flat, then stamp the stroke (a capsule from a to b): a groove, powder banked at its edges.
const FS_STEP = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D prev; uniform vec4 seg; uniform float on; uniform float heal; uniform float w;
float capsule(vec2 q, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return length(q - a - ab * t); }
void main() {
  vec2 h = texture(prev, uv).rg;           // r: depth carved (0..1), g: powder banked (0..1)
  h *= heal;
  if (on > 0.5) {
    float d = capsule(uv, seg.xy, seg.zw) / w;
    float groove = 1.0 - smoothstep(0.0, 1.0, d);
    float berm = smoothstep(0.7, 1.15, d) * (1.0 - smoothstep(1.15, 2.1, d));
    h.r = max(h.r, groove);
    h.g = max(h.g * (1.0 - groove), berm * 0.9);
  }
  o = vec4(h, 0.0, 1.0);
}`;

// The view: a low camera over the snow at dusk; ray to the plane, the height field's slope lights it; sparkle, sky, haze.
const FS_VIEW = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D field; uniform vec2 res; uniform float t; uniform float snow;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float height(vec2 q) {          // q in field uv
  vec2 h = texture(field, q).rg;
  // Drifts, then wind-ripples (sastrugi) a hand across, then the crust's grain: the snow the Wraith walks.
  vec2 r = vec2(q.x * 1.0 + q.y * 0.35, q.y * 1.0 - q.x * 0.35);
  float dunes = 0.03 * vnoise(q * 6.0) + 0.008 * vnoise(q * 23.0)
              + 0.0035 * (0.5 + 0.5 * sin(r.y * 210.0 + 4.0 * vnoise(q * 30.0))) * vnoise(q * 12.0)
              + 0.0012 * vnoise(q * 380.0);
  return dunes - 0.05 * h.r + 0.022 * h.g;
}
void main() {
  vec2 sp = (uv * 2.0 - 1.0) * vec2(res.x / res.y, 1.0);
  // Camera: 1.6 m up, looking down 22 degrees over the field's middle.
  vec3 ro = vec3(0.0, 1.6, -9.5);
  float pitch = 0.38;
  vec3 fw = normalize(vec3(0.0, -sin(pitch), cos(pitch))), rt = vec3(1.0, 0.0, 0.0), up = cross(fw, rt);
  vec3 rd = normalize(fw + sp.x * 0.62 * rt + sp.y * 0.62 * up);
  vec3 sun = normalize(vec3(-0.55, 0.16, 0.82));
  // The sky at dusk: deep blue overhead, the warm band low where the sun went.
  float hz = clamp(rd.y, -0.2, 1.0);
  vec3 sky = mix(vec3(0.78, 0.46, 0.3), vec3(0.06, 0.08, 0.16), pow(clamp(hz * 2.2 + 0.05, 0.0, 1.0), 0.55));
  sky += vec3(1.0, 0.7, 0.45) * pow(max(dot(rd, sun), 0.0), 64.0) * 1.5;
  vec3 col = sky;
  if (rd.y < -0.001) {
    float tt = -ro.y / rd.y;
    vec3 wp = ro + rd * tt;
    vec2 q = vec2(wp.x / ${SPAN.toFixed(1)} + 0.5, (wp.z + 9.5 - 2.0) / ${SPAN.toFixed(1)});
    float fade = 1.0 - smoothstep(0.75, 1.0, max(abs(q.x - 0.5) * 2.0, q.y));
    float e = 1.0 / ${N.toFixed(1)};
    float hc = height(q), hx = height(q + vec2(e, 0.0)) - hc, hy = height(q + vec2(0.0, e)) - hc;
    vec3 n = normalize(vec3(-hx * ${(1.6 * N / SPAN).toFixed(4)}, 1.0, -hy * ${(1.6 * N / SPAN).toFixed(4)}));
    float carved = texture(field, q).r;
    // A low sun rakes across the drift: what faces it glows, what turns from it falls into blue shade (so a groove reads).
    float diff = clamp(dot(n, sun) * 3.2, 0.0, 1.0);
    float toward = pow(max(dot(normalize(vec3(rd.x, 0.0, rd.z)), normalize(vec3(sun.x, 0.0, sun.z))), 0.0), 3.0);   // the snow toward the sun is brighter
    vec3 snowc = vec3(0.86, 0.89, 0.95);
    vec3 lit = snowc * (vec3(1.0, 0.66, 0.44) * diff * (0.75 + 0.6 * toward) + vec3(0.1, 0.14, 0.27) * (0.5 + 0.5 * n.y));
    lit *= mix(vec3(1.0), vec3(0.62, 0.7, 0.92), carved);       // the groove's floor, in its own blue shade
    // Glints: crystals catching the low sun.
    vec2 cell = floor(wp.xz * 60.0);
    float g = step(0.975, hash(cell)) * pow(max(dot(reflect(rd, n), sun), 0.0), 40.0) * (0.6 + 0.4 * sin(t * 3.0 + hash(cell + 3.0) * 30.0));
    lit += vec3(1.0, 0.9, 0.75) * g * 2.5;
    float fog = 1.0 - exp(-tt * 0.035);
    col = mix(lit, vec3(0.36, 0.3, 0.36), fog * 0.8);
    col = mix(sky, col, fade);
  }
  // Falling snow: three layers of drifting flakes.
  if (snow > 0.5) for (int k = 0; k < 3; k++) {
    float s = 6.0 + float(k) * 5.0;
    vec2 fp = uv * vec2(res.x / res.y, 1.0) * s + vec2(t * (0.08 + 0.05 * float(k)), t * (0.35 + 0.15 * float(k)));
    vec2 id = floor(fp), f = fract(fp) - 0.5;
    vec2 off = vec2(hash(id) - 0.5, hash(id + 7.0) - 0.5) * 0.6;
    float d = length(f - off);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.06 - 0.015 * float(k), 0.0, d) * step(0.55, hash(id + 13.0)) * (0.5 - 0.12 * float(k));
  }
  col = col / (1.0 + col * 0.35);                               // a soft shoulder
  o = vec4(pow(col, vec3(1.0 / 1.1)), 1.0);
}`;

export function createSnow(canvas, { reducedMotion = false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) { console.error('snow: no webgl2'); return null; }
  if (!gl.getExtension('EXT_color_buffer_float')) { console.error('snow: no float colour buffers'); return null; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p; };
  let step, view;
  try { step = prog(FS_STEP); view = prog(FS_VIEW); } catch (e) { console.error('snow: shader', e && e.message); return null; }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = [], fbo = [];
  for (let i = 0; i < 2; i++) {
    tex[i] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, N, N, 0, gl.RG, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo[i] = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[i], 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  const U = (p, n) => gl.getUniformLocation(p, n);
  const uStep = { prev: U(step, 'prev'), seg: U(step, 'seg'), on: U(step, 'on'), heal: U(step, 'heal'), w: U(step, 'w') };
  const uView = { field: U(view, 'field'), res: U(view, 'res'), t: U(view, 't'), snow: U(view, 'snow') };
  let cur = 0, run = false, raf = 0, last = performance.now(), t0 = last;
  // The stroke: the pointer's last two points, in field uv (from the screen, through the same camera as the view).
  const seg = new Float32Array(4); let stroke = false, has = false;
  function toField(cx, cy) {
    const r = canvas.getBoundingClientRect(), u = (cx - r.left) / r.width, v = 1 - (cy - r.top) / r.height;
    const asp = r.width / r.height, sx = (u * 2 - 1) * asp, sy = v * 2 - 1;
    const pitch = 0.38, fw = [0, -Math.sin(pitch), Math.cos(pitch)], up = [0, Math.cos(pitch), Math.sin(pitch)];
    const rd = [sx * 0.62, fw[1] + sy * 0.62 * up[1], fw[2] + sy * 0.62 * up[2]];
    if (rd[1] >= -0.002) return null;
    const tt = -1.6 / rd[1], x = rd[0] * tt, z = -9.5 + rd[2] * tt;
    return [x / SPAN + 0.5, (z + 9.5 - 2.0) / SPAN];
  }
  function point(cx, cy, down) {
    const q = toField(cx, cy); if (!q) { has = false; return; }
    // One capsule a frame from where the last stamp ended to where the pointer is now (many moves can land in one frame).
    if (!has || down) { seg[0] = q[0]; seg[1] = q[1]; } else if (!stroke) { seg[0] = seg[2]; seg[1] = seg[3]; }
    seg[2] = q[0]; seg[3] = q[1]; has = true; stroke = true;
  }
  // The demo stroke: one point a frame (so it draws its curve at any frame rate).
  let demoPts = null, demoI = 0;
  let dragging = false;
  const onDown = (e) => { dragging = true; point(e.clientX, e.clientY, true); };
  const onMove = (e) => { if (dragging || e.pointerType === 'mouse') point(e.clientX, e.clientY, false); };
  const onUp = () => { dragging = false; };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', () => { has = false; });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = Math.floor(canvas.clientWidth * dpr * 0.75), h = Math.floor(canvas.clientHeight * dpr * 0.75);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function frame(now) {
    if (!run) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    resize();
    if (demoPts && demoI < demoPts.length) { const r = canvas.getBoundingClientRect(), [x, y] = demoPts[demoI]; point(r.left + x * r.width, r.top + y * r.height, demoI === 0); demoI++; }
    // The field: heal (a mark is gone in about twenty seconds), then the stroke.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]); gl.viewport(0, 0, N, N); gl.useProgram(step);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[cur]); gl.uniform1i(uStep.prev, 0);
    gl.uniform4fv(uStep.seg, seg); gl.uniform1f(uStep.on, stroke ? 1 : 0); gl.uniform1f(uStep.heal, Math.pow(0.5, dt / 6)); gl.uniform1f(uStep.w, 0.0075);
    gl.drawArrays(gl.TRIANGLES, 0, 3); cur = 1 - cur; stroke = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(view);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[cur]); gl.uniform1i(uView.field, 0);
    gl.uniform2f(uView.res, canvas.width, canvas.height); gl.uniform1f(uView.t, (now - t0) / 1000); gl.uniform1f(uView.snow, reducedMotion ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return {
    /** Draw while on screen only. */
    start() { if (run) return; run = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { run = false; cancelAnimationFrame(raf); },
    /** A stroke written from script (the "the world remembers" demo before the visitor tries). */
    demo(points) { demoPts = points; demoI = 0; },
  };
}
