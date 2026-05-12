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
      // Gated coverage targets the load-bearing pure-logic modules. The
      // RPC-tail pollers (pollOracleSVI.ts + pollVaultEvents.ts) and the
      // entry-point (relay.ts) are integration-coverage-shaped — they
      // need a live SuiClient or full mock; tested at the live-testnet
      // tier per Plan 04-02 must_haves block.
      include: [
        'src/cursor.ts',
        'src/decodeI64.ts',
        'src/deployInfo.ts',
        'src/snapshot.ts',
        'src/wsServer.ts',
      ],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
