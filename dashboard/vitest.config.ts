// dashboard/vitest.config.ts — Phase 1 minimal config (Vite scaffold lands in Phase 4).
//
// Lib-only testing for Phase 1: the SVI evaluator triple+ (math, isqrt, phi, ln, svi)
// has no React, no DOM, no Vite plugins. Just Vitest + tsx for TypeScript.
//
// testTimeout raised to 30s for the 141-vector golden parity loop in svi.test.ts.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/lib/__tests__/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
  },
});
