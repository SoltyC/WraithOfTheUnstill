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

export default defineConfig({
  plugins: [perfSink()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2023', sourcemap: true, chunkSizeWarningLimit: 4096 },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
