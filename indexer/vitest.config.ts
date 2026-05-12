// indexer/vitest.config.ts — Phase 4 Wave 1 (Plan 04-02) extends scaffold
// (`vitest run --passWithNoTests`) into a real test surface for the relay.
//
// Coverage gate per plan body must_haves: cursor/decodeI64/deployInfo/snapshot/
// wsServer hit >=85% lines. Phase 1 lib coverage lives in the dashboard
// workspace and is unaffected.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
