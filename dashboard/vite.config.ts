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
    // outDir stays the Vite DEFAULT (dashboard/dist). The hosted Vercel build
    // runs `pnpm --filter @deepvault/dashboard build`, and Vercel resolves
    // vercel.json#outputDirectory ("dist") relative to the FILTERED package dir
    // (dashboard/) -> dashboard/dist, which is exactly where the default outDir
    // writes. Do NOT set outDir to ../dist (repo-root): Vercel does not look
    // there and fails with `No Output Directory named "dist"`. Verified against
    // build logs dpl_4mHYSEZt (root/dist) + dpl_uUkzmnjbf (../dist) — both
    // failed; default dashboard/dist is the only location Vercel matches.
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
