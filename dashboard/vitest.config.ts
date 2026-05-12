// dashboard/vitest.config.ts — Phase 4 Wave 0 extends Phase 1 lib-only config.
//
// The Phase 1 lib glob (src/lib/__tests__/**/*.test.ts) is UNCHANGED and
// continues to run the 311+ SVI/Phi/Isqrt/Ln + arb-checker tests with
// bigint-only semantics. Phase 4 adds:
//   - jsdom environment (for component + hook tests)
//   - @testing-library/jest-dom matchers via setupFiles
//   - component + hooks globs
//
// Plain `vitest run` from the dashboard package executes the union; the
// Phase 1 forbidden-token grep CI gate (ci.yml:355-366) still asserts no
// Number/Math.X regressions in math/isqrt/phi/ln/svi.ts.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    include: [
      'src/lib/__tests__/**/*.test.ts',
      'src/components/**/__tests__/**/*.test.{ts,tsx}',
      'src/hooks/**/__tests__/**/*.test.{ts,tsx}',
    ],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
