#!/usr/bin/env tsx
// dashboard/src/lib/parity_runner.ts
// Parity runner: read shared/golden-vectors.json, evaluate via dashboard svi.ts,
// assert each (w, binary_price, params_valid) match within tolerance. Exit 1 on
// any mismatch.
//
// Invocations:
//   pnpm exec tsx src/lib/parity_runner.ts             // full check
//   pnpm exec tsx src/lib/parity_runner.ts --first 10  // debug subset
//   pnpm exec tsx src/lib/parity_runner.ts --tier A    // filter by tier
//   pnpm exec tsx src/lib/parity_runner.ts --tolerance 1
//
// CI integration: ci.yml `parity` job runs this after move/ts/python/codegen-drift
// pass. Mirrors backtest/src/deepvault/parity_runner.py exit semantics:
//   0 = all vectors match expected within tolerance (default 1 unit at 1e9)
//   1 = at least one vector mismatched / fixture missing / fixture empty
//
// Forbidden: float coercions, parse-float helpers, JS standard math lib. The
// runner is a thin CLI wrapper around dashboard/src/lib/svi.ts which is itself
// pure-bigint per shared/svi-spec.md §"Op-order canonical form" rounding rule.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaryPrice, totalVariance, type SVIParams } from './svi';

// ESM has no __dirname. Derive it from import.meta.url so the runner works under
// `tsx` (ESM) AND when CI invokes it via `pnpm exec tsx src/lib/parity_runner.ts`.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const JSON_PATH = resolve(REPO_ROOT, 'shared/golden-vectors.json');

type SignedHex = { mag: string; neg: boolean };
type Vector = {
  id: string;
  tier: 'A' | 'B' | 'C' | 'C2';
  source: string;
  inputs: {
    a: string;
    b: string;
    sigma: string;
    forward: string;
    strike: string;
    rho: SignedHex;
    m: SignedHex;
    k: SignedHex;
    T_seconds: number;
  };
  expected: {
    w: string;
    binary_price: string;
    params_valid: boolean;
    min_g_k: SignedHex | number;
    calendar_pass: boolean;
  };
};

function decodeSigned(s: SignedHex): bigint {
  const mag = BigInt(s.mag);
  return s.neg ? -mag : mag;
}

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

type ParsedArgs = {
  first: number | null;
  tier: string | null;
  tolerance: bigint;
};

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let first: number | null = null;
  let tier: string | null = null;
  let tolerance: bigint = 1n;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--first' && args[i + 1]) {
      first = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--tier' && args[i + 1]) {
      tier = args[i + 1];
      i++;
    } else if (args[i] === '--tolerance' && args[i + 1]) {
      tolerance = BigInt(args[i + 1]);
      i++;
    }
  }
  return { first, tier, tolerance };
}

function main(): number {
  const opts = parseArgs();

  let raw: string;
  try {
    raw = readFileSync(JSON_PATH, 'utf-8');
  } catch (exc) {
    console.error(
      `FAIL: golden-vectors.json not found at ${JSON_PATH}: ${
        exc instanceof Error ? exc.message : String(exc)
      }`,
    );
    return 1;
  }

  let vectors: Vector[] = JSON.parse(raw);
  if (opts.tier) {
    vectors = vectors.filter((v) => v.tier === opts.tier);
  }
  if (opts.first !== null) {
    vectors = vectors.slice(0, opts.first);
  }

  if (vectors.length === 0) {
    console.error('FAIL: no vectors loaded (empty JSON or filtered out)');
    return 1;
  }

  const failures: string[] = [];
  for (const v of vectors) {
    try {
      const svi: SVIParams = {
        a: BigInt(v.inputs.a),
        b: BigInt(v.inputs.b),
        sigma: BigInt(v.inputs.sigma),
        rho: decodeSigned(v.inputs.rho),
        m: decodeSigned(v.inputs.m),
      };
      const k = decodeSigned(v.inputs.k);
      const forward = BigInt(v.inputs.forward);
      const strike = BigInt(v.inputs.strike);

      if (v.expected.params_valid) {
        const actualW = totalVariance(svi, k);
        const expectedW = BigInt(v.expected.w);
        const diffW = absBig(actualW - expectedW);
        if (diffW > opts.tolerance) {
          failures.push(
            `${v.id} (${v.tier}): w mismatch — actual=${actualW}, expected=${expectedW}, diff=${diffW}`,
          );
        }
        const actualBp = binaryPrice(svi, forward, strike);
        const expectedBp = BigInt(v.expected.binary_price);
        const diffBp = absBig(actualBp - expectedBp);
        if (diffBp > opts.tolerance) {
          failures.push(
            `${v.id} (${v.tier}): binary_price mismatch — actual=${actualBp}, expected=${expectedBp}, diff=${diffBp}`,
          );
        }
      } else {
        // Arb-violating vector: totalVariance MUST throw (per Plan 01-04 design,
        // all arb-violating vectors trigger EZeroVariance via a=0,b=0 — the
        // reachable rejection path; ECannotBeNegative is defensive parity per
        // Plan 01-03 analysis).
        let threw = false;
        try {
          totalVariance(svi, k);
        } catch {
          threw = true;
        }
        if (!threw) {
          failures.push(`${v.id} (${v.tier}): expected throw but got result`);
        }
      }
    } catch (exc) {
      // Unexpected exception on a valid vector — genuine bug or schema drift.
      if (v.expected.params_valid) {
        failures.push(
          `${v.id} (${v.tier}): unexpected exception ${
            exc instanceof Error ? exc.message : String(exc)
          }`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(
      `PARITY FAIL: ${failures.length} mismatches across ${vectors.length} vectors`,
    );
    failures.slice(0, 20).forEach((f) => console.error(`  ${f}`));
    if (failures.length > 20) {
      console.error(`  ... and ${failures.length - 20} more.`);
    }
    return 1;
  }
  console.log(
    `PARITY OK: ${vectors.length} vectors pass within tolerance <= ${opts.tolerance}.`,
  );
  return 0;
}

process.exit(main());
