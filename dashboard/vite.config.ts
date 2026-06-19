// dashboard/vite.config.ts — Phase 4 Wave 0 scaffold.
//
// Vendor-chunking strategy (Pitfall 9 mitigation): isolate the plotly.js
// WebGL bundle into its own async chunk so the initial app shell does not
// pay the ~3MB plotly cost up front; React core lives in `vendor`.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: {
    // Emit to the repo-root `dist/` (NOT dashboard/dist). Vercel resolves the
    // output directory as "dist" relative to the build entrypoint (the repo
    // root, since Root Directory is "."), and it ignores vercel.json's
    // `outputDirectory` for this monorepo import — so writing here is what
    // makes the hosted build's output discoverable without a dashboard-side
    // Root Directory setting. `emptyOutDir` is required because outDir is
    // outside the Vite root. Repo-root `dist/` is already covered by
    // .gitignore's `dist/` rule, so no build artifact is ever committed.
    outDir: resolve(__dirname, '..', 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['plotly.js', 'react-plotly.js'],
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
