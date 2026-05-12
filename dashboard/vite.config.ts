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
