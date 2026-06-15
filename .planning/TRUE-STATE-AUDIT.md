# True-State Audit — 2026-06-15

Ran (not re-read) the real outputs of each submission-critical area to find
"verified-on-fixtures-but-never-run-for-real" gaps before committing the
remaining days. Deliverable: this map. Half-day time-box.

| Area | Ran for real? | Output sane? | True state | Severity |
|------|---------------|--------------|-----------|----------|
| **Math parity — 3-way SVI golden vectors (Phase 1)** | YES, all 3 runtimes | YES | Python `parity_runner` 141 vectors ✓; TS `svi.test.ts` 141 vectors ✓ (vitest); Move `golden_vectors_*` ✓. The non-cuttable gate is **genuinely real**. | ✅ Solid |
| **Move contracts (Phase 2)** — vault/supply/redeem/svi unit tests | YES — `sui move test` | YES | 102/102 pass; package deployed on testnet | ✅ Solid (logic) |
| **Testnet deposit→hedge→redeem cycle** | YES — on-chain dry-run | n/a | Aborts `EMarketKeyExpiryMismatch`: vault wants a 14-day Predict market; testnet only lists intraday BTC oracles | ⚠️ Blocked (external/testnet) |
| **Two-protocol PTB demo (Phase 3)** | Not run live | — | Routes through `vault::supply` → same hedge block | ⚠️ Blocked (external/testnet) |
| **Backtest (Phase 3)** | YES — ran `walk_forward` | ~~NO~~ → **YES (FIXED 2026-06-15)** | Was hollow (no `decision_fn` → all-zero). Now `strategy_sim.py` drives a real two-sleeve model (PLP yield − LVR drag − rolling OTM binary-put insurance, priced off trailing realized vol, lookahead-gated). Independently validated: OOS cost-of-carry honest (−0.69%, neg Sharpe in calm regime), tail protection real (hedged DD ≪ unhedged BTC −28% OOS / −53% full), sensitivity table shows more-hedge=more-carry-cost (not suspiciously clean). 246 tests green. Merged to master. | ✅ Real (validated) — **frame submission OOS-first**, full-window crash = in-sample tail evidence |
| **Relay / indexer (Phase 4)** | YES — live on :8080 | YES | Streams real `OracleSVIUpdated` events; `/healthz` ok; dashboard WS connects | ✅ Solid |
| **Dashboard (Phase 4 / 4.1)** | YES — live Vite preview | YES | Reskinned; live SVI surface + arb-checker + event stream show real data; theme toggle works | ✅ Solid |
| **CI parity job — TS leg** | YES — ran the CI command | **NO** | `pnpm exec tsx src/lib/parity_runner.ts` errors `__dirname is not defined` (ESM). The CI parity gate's TS step would FAIL. (The *math* parity is still proven via `svi.test.ts`; only this standalone CI script is broken.) | ⚠️ Broken script (math fine) |
| **Dashboard tests** | YES — vitest | partial | 425/427. The 2 failures are a **regression I introduced** annotating the empty-state copy (`PositionViewer`/`ExposurePanel` tests assert old strings). | ⚠️ Trivial (my regression) |
| **Mainnet toolkit (Phase 5)** | Lint only (by design) | n/a | Write-but-don't-execute; lint-clean | ✅ As-designed |

## Headline

**The foundation is real and solid** — the 3-way SVI math parity gate (the load-bearing axis), the Move contracts, the live relay, and the reskinned live dashboard all produce real, sane outputs when actually run.

**Nothing surfaced worse than the already-known hollow backtest.** The remaining gaps are: the backtest strategy-sim (hollow, in our control, sim build planned), the live hedge/PTB (blocked by testnet oracle availability, external), and two trivial breakages (the CI TS-parity script `__dirname` bug, and 2 dashboard tests I broke annotating empty states).

## Fix list (small, do before/around the sim build)
1. My 2 broken dashboard tests (annotation regression) — update assertions to new copy.
2. `dashboard/src/lib/parity_runner.ts` `__dirname` ESM bug — so the CI parity gate's TS step runs.

## Then: the backtest strategy-simulation build (~1.5d, time-boxed; fall back to honest "harness + methodology" reframe if outputs can't be made defensible).
