import { defineConfig } from 'vite';

// The promotional site (docs/website/plan.md): its own small build, served at solcrisp.org; the game is its own build, at
// play.solcrisp.org. `npm run site:dev`, `npm run site:build` → dist-site/.
export default defineConfig({
  root: 'site',
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { outDir: '../dist-site', emptyOutDir: true, target: 'es2020' },
});
