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
    if (!req.url.startsWith('/__wraith/shot') || req.method !== 'POST') return next();
    const q = new URL(req.url, 'http://x').searchParams;
    const dir = String(q.get('dir') || 'phase-xx').replace(/[^a-z0-9-]/gi, '');
    const name = String(q.get('name') || 'shot').replace(/[^a-z0-9-]/gi, '');
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 64 << 20) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      const out = path.resolve('screenshots', dir);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.concat(chunks));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, file: `screenshots/${dir}/${name}.png` }));
    });
  };
  return {
    name: 'wraith-shot-sink',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [perfSink(), shotSink()],
  // data/ is served at the site root (baked world at /world/…) and copied into builds.
  publicDir: 'data',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2023', sourcemap: true, chunkSizeWarningLimit: 4096 },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
