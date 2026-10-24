import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Benchmark result sink: POST /__wraith/perf (JSON from ?bench=1) → perf/runs/<date>.json.
 * Served only by the local dev/preview servers (bound to 127.0.0.1); never part of the build.
 */
function perfSink() {
  const handler = (req, res, next) => {
    if (req.url !== '/__wraith/perf' || req.method !== 'POST') return next();
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1 << 20) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const dir = path.resolve('perf/runs');
        fs.mkdirSync(dir, { recursive: true });
        const name = String(data.date || new Date().toISOString()).replace(/[:.]/g, '-') + '.json';
        fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, file: 'perf/runs/' + name }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: String(e.message) }));
      }
    });
  };
  return {
    name: 'wraith-perf-sink',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

/**
 * Gate-screenshot sink: POST /__wraith/shot?dir=phase-02&name=<id> (PNG body from ?shots=…) →
 * screenshots/<dir>/<name>.png. Lets gate captures be taken on the target GPU (BRIEF §3).
 */
function shotSink() {
  const handler = (req, res, next) => {
    if (req.url.startsWith('/__wraith/shot-log') && req.method === 'POST') {
      // Progress and failures from ?shots= runs: printed here and kept beside the shots.
      const q = new URL(req.url, 'http://x').searchParams;
      const dir = String(q.get('dir') || 'phase-xx').replace(/[^a-z0-9-]/gi, '');
      let body = '';
      req.on('data', (c) => { if (body.length < 8192) body += c; });
      req.on('end', () => {
        const line = new Date().toISOString() + ' ' + body.replace(/\s+/g, ' ').slice(0, 1000);
        console.log('[shots] ' + line);
        const out = path.resolve('screenshots', dir);
        fs.mkdirSync(out, { recursive: true });
        fs.appendFileSync(path.join(out, 'shots-log.txt'), line + '\n');
        res.end('ok');
      });
      return;
    }
    const clip = req.url.startsWith('/__wraith/clip');   // a recorded video clip (the bot's rec), .webm
    const frame = req.url.startsWith('/__wraith/frame'); // one frame of the bot's film mode: <dir>/frames/<name>/f000123.jpg
    if (!(clip || frame || req.url.startsWith('/__wraith/shot')) || req.method !== 'POST') return next();
    const q = new URL(req.url, 'http://x').searchParams;
    if (frame) {
      const dir = String(q.get('dir') || 'trailer').replace(/[^a-z0-9-]/gi, ''), name = String(q.get('name') || 'clip').replace(/[^a-z0-9-]/gi, '');
      const i = Math.max(0, Math.min(999999, parseInt(q.get('i'), 10) || 0));
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => {
        const out = path.resolve('screenshots', dir, 'frames', name);
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, 'f' + String(i).padStart(6, '0') + '.jpg'), Buffer.concat(parts));
        res.end('ok');
      });
      return;
    }
    const dir = String(q.get('dir') || 'phase-xx').replace(/[^a-z0-9-]/gi, '');
    const name = String(q.get('name') || 'shot').replace(/[^a-z0-9-]/gi, '');
    const chunks = [];
    let size = 0;
    const ext = clip ? '.webm' : '.png';
    req.on('data', (c) => { size += c.length; if (size > (clip ? 1024 : 64) << 20) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      const out = path.resolve('screenshots', dir);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, name + ext), Buffer.concat(chunks));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, file: `screenshots/${dir}/${name}${ext}` }));
    });
  };
  return {
    name: 'wraith-shot-sink',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

/**
 * Bot bridge (?bot=1, src/core/bot.js): lets a script play the live game. The page long-polls
 * GET /__wraith/bot/next for a command and POSTs /__wraith/bot/reply?id=; tools/bot/bot.mjs POSTs
 * /__wraith/bot/cmd and long-polls GET /__wraith/bot/reply?id=. In memory, local servers only.
 */
function botBridge() {
  const queue = [], replies = new Map(), pageWait = [], replyWait = new Map();
  let nextId = 1, lastSeen = 0, helloAt = 0;
  const json = (res, code, v) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
  const body = (req, cb) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 4 << 20) req.destroy(); }); req.on('end', () => cb(b)); };
  const handler = (req, res, next) => {
    if (!req.url.startsWith('/__wraith/bot/')) return next();
    const u = new URL(req.url, 'http://x'), route = u.pathname.slice('/__wraith/bot/'.length);
    if (route === 'cmd' && req.method === 'POST') return body(req, (b) => {
      const id = nextId++; const cmd = { ...JSON.parse(b || '{}'), _id: id };
      // A page that went away leaves its poll behind: hand the command only to a live one.
      let w; while ((w = pageWait.shift()) && w.closed) clearTimeout(w.t);
      if (w) { clearTimeout(w.t); json(w.res, 200, cmd); } else queue.push(cmd);
      json(res, 200, { id });
    });
    if (route === 'next' && req.method === 'GET') {
      lastSeen = Date.now();
      if (queue.length) return json(res, 200, queue.shift());
      const w = { res, closed: false, t: setTimeout(() => { const i = pageWait.indexOf(w); if (i >= 0) pageWait.splice(i, 1); res.statusCode = 204; res.end(); }, 20000) };
      res.on('close', () => { w.closed = true; const i = pageWait.indexOf(w); if (i >= 0) { pageWait.splice(i, 1); clearTimeout(w.t); } });
      return void pageWait.push(w);
    }
    if (route === 'reply' && req.method === 'POST') return body(req, (b) => {
      const id = Number(u.searchParams.get('id')); const w = replyWait.get(id);
      if (w) { clearTimeout(w.t); replyWait.delete(id); w.res.setHeader('content-type', 'application/json'); w.res.end(b); } else replies.set(id, b);
      res.end('ok');
    });
    if (route === 'reply' && req.method === 'GET') {
      const id = Number(u.searchParams.get('id'));
      if (replies.has(id)) { const b = replies.get(id); replies.delete(id); res.setHeader('content-type', 'application/json'); return void res.end(b); }
      const ms = Number(u.searchParams.get('wait') || 120000);
      const w = { res, t: setTimeout(() => { replyWait.delete(id); json(res, 504, { error: 'no reply in ' + ms + ' ms' }); }, ms) };
      return void replyWait.set(id, w);
    }
    if (route === 'status') return json(res, 200, { pageSeenMsAgo: lastSeen ? Date.now() - lastSeen : null, polling: pageWait.length, queued: queue.length, hello: helloAt });
    if (route === 'hello') { helloAt = Date.now(); queue.length = 0; return json(res, 200, { ok: true }); }
    return json(res, 404, { error: 'unknown bot route ' + route });
  };
  return {
    name: 'wraith-bot-bridge',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [perfSink(), shotSink(), botBridge()],
  // data/ is served at the site root (baked world at /world/…) and copied into builds.
  publicDir: 'data',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2023', sourcemap: true, chunkSizeWarningLimit: 4096 },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
