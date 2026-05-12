---
phase: 03-backtest-harness-two-protocol-ptb
plan: 01
subsystem: wave-0-spike
tags: [phase-03, wave-0, spike, ptb-shape, sdk-pin, margin-whitelist, runtime-budget, json-roundtrip, nightly-schedule]

requires:
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md (D-17, D-18, D-09, D-15)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-RESEARCH.md (Pattern 1, Open Q1-Q6)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-PATTERNS.md (Pattern 1 PTB shape)
  - scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move (vendored, SHA 1159d79a)
  - contracts/sources/supply.move (Phase 2 D-06 atomic-hedge)
  - .github/workflows/nightly-prover.yml (03:00 UTC)
  - .github/workflows/nightly-e2e-vault.yml (04:00 UTC)

provides:
  - .planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md
  - .planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md
  - .planning/phases/03-backtest-harness-two-protocol-ptb/deferred-items.md
  - 5-call PTB shape lock for Plans 03-02 .. 03-09
  - @mysten/deepbook-v3@1.3.6 SDK pin
  - plotly + jinja2 Python deps in backtest/
  - nightly-backtest.yml cron slot decision (05:00 UTC)
  - JSON round-trip convention (u64 as strings)

affects:
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md (D-17 amended inline)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-RESEARCH.md (Open Questions renamed to RESOLVED)
  - backtest/pyproject.toml + backtest/uv.lock
  - package.json + pnpm-lock.yaml (root)

tech-stack:
  added:
    - "@mysten/deepbook-v3@1.3.6 (exact, --save-exact)"
    - "plotly>=5.20 (resolved to 6.7.0)"
    - "jinja2>=3.1.6 (resolved to 3.1.6)"
  patterns:
    - "5-call PTB shape: deposit -> borrow_quote -> withdraw -> vault::supply::supply -> optional re-deposit"
    - "u64-as-string JSON convention for cross-runtime event payloads"
    - "Deferred-item tracking pattern (deferred-items.md per phase)"

key-files:
  created:
    - .planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md
    - .planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md
    - .planning/phases/03-backtest-harness-two-protocol-ptb/deferred-items.md
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-01-SUMMARY.md
  modified:
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md (D-17 inline amendment block)
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-RESEARCH.md (heading -> "Open Questions (RESOLVED)" + 6 inline RESOLVED annotations)
    - backtest/pyproject.toml (added jinja2 + plotly, alphabetized)
    - backtest/uv.lock (+ jinja2, markupsafe, narwhals, plotly = 4 packages)
    - package.json (+ @mysten/deepbook-v3@1.3.6)
    - pnpm-lock.yaml (+30 transitive deps for deepbook-v3 1.3.6)

decisions:
  - "5-call PTB shape locks for Plans 03-02 through 03-09: margin_manager::deposit -> borrow_quote -> withdraw -> vault::supply::supply -> optional VAULT_SHARE re-deposit. Verified against vendored DeepBookV3 SHA 1159d79a (margin_manager.move:602-643 borrow_quote returns void, 458-555 withdraw returns Coin, 417-431 deposit, supply.move:89-97 internal rebalance)."
  - "CONTEXT.md D-17 amended inline (NOT replaced); back-references WAVE0-DECISION.md. Original 3-call shape is non-compilable: (i) borrow_quote auto-deposits at margin_manager.move:625, (ii) rebalance::buy_hedge_for_deposit is public(package) at rebalance.move:219."
  - "MARGIN-WHITELIST-DECISION = UNDETERMINED-FALLBACK-TO-MOCK. deepbook_margin IS deployed on testnet (MARGIN_PACKAGE_ID 0xd6a42f..., MARGIN_REGISTRY_ID 0x48d7640d...) with SUI/DBUSDC/DEEP/DBTC pools, but no DUSDC-quoted MarginPool exists. Recheck 2026-06-08."
  - "@mysten/deepbook-v3 pinned to 1.3.6 (latest), NOT CLAUDE.md's 0.17.0. 0.17.0 has zero Margin builders; 1.3.6 exposes MarginPoolContract + MarginManagerContract + testnetMarginPools dictionary with live shared object IDs. Deviation from CLAUDE.md documented in WAVE0-DECISION.md."
  - "Q3 LOCKED: plp_yield_bps = 0 in v1 PnL accountant. We BUY hedges (predict::mint) not provide PLP (predict::supply). Column reserved for v2 STRAT-V2-01 expansion."
  - "Runtime budget Q4: PASS with massive headroom (1.33s extrapolated 365-day vs 600s budget; 598.67s headroom). Pitfall 6 escape-hatch not mandatory for v1."
  - "Event JSON convention Q5: u64 fields as strings (avoids JS Number 2^53 precision loss), IDs as 0x-lowercase-hex, u8 ints as numbers. Plan 03-05 emits, Plan 03-06 consumes."
  - "nightly-backtest.yml cron Q6: 05:00 UTC, timeout-minutes: 60. One hour past nightly-e2e-vault (04:00 UTC), two hours past nightly-prover (03:00 UTC). Plan 03-04 creates the workflow file."

metrics:
  duration: "24min"
  completed: "2026-05-12"
  tasks: 4
  commits: 4
  files_created: 4
  files_modified: 6
---

# Phase 3 Plan 01: Wave 0 Spike — PTB Shape + SDK Pin + Runtime Budget Lock — Summary

Wave 0 spike that empirically resolves six load-bearing unknowns BEFORE any production
Phase 3 code ships. Outputs are documentation artifacts (decision records + RESEARCH
annotations + dep-pin commits) that gate Plans 03-02 through 03-09.

## What Shipped

| Artifact | Purpose |
|----------|---------|
| `WAVE0-DECISION.md` | Canonical lock of 5-call PTB shape, SDK pin, runtime budget verdict, JSON convention, nightly schedule, publish-blocker investigation. |
| `MARGIN-WHITELIST-DECISION.md` | Dated empirical decision on DUSDC-collateral margin pool availability with verbatim RPC outputs. |
| `deferred-items.md` | New per-phase tracking file for out-of-scope discoveries (2 items filed: D-PUB-01 publish blocker, D-VAULT-01 missing accessor stubs). |
| CONTEXT.md D-17 amendment | Inline cross-reference block correcting the non-compilable 3-call shape. |
| RESEARCH.md inline RESOLVED block | Each of Open Questions Q1-Q6 carries a `**RESOLVED:**` annotation under its prompt; heading renamed to `## Open Questions (RESOLVED)`. |
| `backtest/pyproject.toml` + `uv.lock` | Plotly + Jinja2 added (alphabetized; full deps now jinja2, matplotlib, numpy, pandas, plotly, pyarrow, requests, scipy). |
| `package.json` + `pnpm-lock.yaml` | `@mysten/deepbook-v3@1.3.6` exact-pinned at root. |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `682b288` | `docs(03-01): Task 1 — lock 5-call PTB shape + amend D-17 + RESEARCH RESOLVED` |
| Task 2 | `b7aa541` | `docs(03-01): Task 2 — MARGIN-WHITELIST-DECISION = UNDETERMINED-FALLBACK-TO-MOCK` |
| Task 3 | `41056ce` | `chore(03-01): Task 3 — pin @mysten/deepbook-v3@1.3.6 + add plotly/jinja2 to backtest` |
| Task 4 | `7956e1f` | `docs(03-01): Task 4 — runtime budget PASS + JSON convention + 05:00 UTC slot` |

## Six Open Questions Resolved

| # | Question | Verdict | Evidence location |
|---|----------|---------|-------------------|
| Q1 | DUSDC margin pool exists on testnet? | UNDETERMINED-FALLBACK-TO-MOCK (deepbook_margin deployed but DUSDC pool absent; DBUSDC exists with different token type) | MARGIN-WHITELIST-DECISION.md, WAVE0-DECISION.md Q1 |
| Q2 | @mysten/deepbook-v3@0.17.0 exposes Margin builders? | NO at 0.17.0; YES at 1.3.6 — pinned 1.3.6 | WAVE0-DECISION.md "SDK introspection evidence" |
| Q3 | v1 PLP yield rate? | `plp_yield_bps = 0` (we BUY hedges, not provide PLP) | WAVE0-DECISION.md Q3 |
| Q4 | 365-day backtest fits 10-min nightly budget? | PASS (1.33s extrapolated, 598.67s headroom) | WAVE0-DECISION.md "Runtime budget micro-benchmark" |
| Q5 | MarketKey JSON round-trips? | PASS with u64-as-strings convention | WAVE0-DECISION.md "Event JSON round-trip check" |
| Q6 | nightly-backtest.yml schedule slot? | 05:00 UTC (`cron: '0 5 * * *'`), timeout-minutes: 60 | WAVE0-DECISION.md "Nightly schedule slot" |

## Deviations from Plan

Plan executed end-to-end. Notable deviations from the plan body's instructions
(all driven by empirical findings, all documented in WAVE0-DECISION.md):

### Auto-applied (Rules 1-3)

**1. [Rule 3 - Blocking issue] CLAUDE.md SDK pin (0.17.0) is empirically empty of Margin builders.**

- Found during: Task 3 introspection.
- Issue: Plan + CLAUDE.md both pin `@mysten/deepbook-v3@0.17.0` as the Margin Manager SDK source. Empirical `node -e "require('@mysten/deepbook-v3'); Object.keys(...)"` shows 0.17.0 exports 12 names — none of which are Margin-related.
- Fix: Upgraded to 1.3.6 (latest npm), which exposes `MarginPoolContract`, `MarginManagerContract`, and `testnetMarginPools` with live testnet pool addresses. Deviation flagged inline in WAVE0-DECISION.md "Deviation from CLAUDE.md" subsection.
- Files modified: `package.json`, `pnpm-lock.yaml`.
- Commit: `41056ce`.

**2. [Rule 1 - Bug surfaced] MARGIN-WHITELIST decision sharper than plan anticipated.**

- Found during: Task 3 SDK introspection (occurred AFTER Task 2's commit).
- Issue: Task 2 originally wrote `UNDETERMINED-FALLBACK-TO-MOCK` based on "deepbook_margin not locatable." Task 3's SDK introspection revealed `testnetMarginPools` IS populated — `deepbook_margin` IS deployed, just without a DUSDC-quoted pool. Same verdict, different precision.
- Fix: Augmented MARGIN-WHITELIST-DECISION.md with a "Step 4" block documenting the discovery + a "Crucial caveat" explaining DBUSDC ≠ DUSDC. Result line preserved.
- Files modified: `MARGIN-WHITELIST-DECISION.md` (Task 3 commit).
- Commit: `41056ce`.

**3. [Rule 2 - Critical functionality] WAVE0-DECISION.md sentinel lines.**

- Found during: Task 1 + Task 4 verify-gate checks.
- Issue: Acceptance criteria require `grep -E '^Selected: .+$'` and `grep -q 'Q3.*plp_yield_bps.*0'` and `grep -E 'Q4.*PASS|Q4.*FAIL'` — single-line patterns. The natural Markdown layout (heading on one line, body underneath) doesn't match these regexes.
- Fix: Added single-line sentinel statements (`Selected: 5-call PTB shape...`, `Q3 resolution sentinel: plp_yield_bps = 0 in v1...`, `Q4 sentinel: PASS — 7-day elapsed...`) immediately under each section heading. Sentinels are flagged as such (no semantic content lost; just satisfies grep predicates).
- Files modified: `WAVE0-DECISION.md` (rolling fix during each task).
- Commits: `682b288`, `41056ce`, `7956e1f`.

### Out-of-scope discoveries (filed to deferred-items.md)

**D-PUB-01:** `sui client publish` blocked on `deepbook_predict` dep resolution.
Investigated 4 approaches; root cause is missing `[package].published-at` in
vendored Move.toml; canonical fix deferred to Plan 03-09 closeout. Phase 3 does
NOT require a fresh publish (testnet deepvault already deployed in Plan 02-09).

**D-VAULT-01:** Five `vault::*` accessor functions referenced by `rebalance.move`
are missing — exposed only when `--with-unpublished-dependencies` is passed.
Phase 2 leftover stubs; Plain `sui move build` doesn't catch them. Filed for
Plan 03-09 or Phase 2 followup. Severity LOW (no runtime impact).

## Authentication Gates

None hit. Sui CLI was available (v1.71.1) and Sui testnet RPC reachable. Predict
server reachable but empty-bodied at probed paths.

## Validation Performed

```
$ grep -E '^Selected: .+$' .planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md
Selected: 5-call PTB shape with Margin::withdraw bridge

$ grep -E '^\*\*Result:\*\* (WHITELISTED-LIVE|NOT-WHITELISTED-FALLBACK-TO-MOCK|UNDETERMINED-FALLBACK-TO-MOCK)$' \
    .planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md
**Result:** UNDETERMINED-FALLBACK-TO-MOCK

$ grep -q 'D-17 AMENDMENT' .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md && echo OK
OK

$ cd backtest && uv sync --locked && uv run python -c "import plotly, jinja2; print(plotly.__version__, jinja2.__version__)"
6.7.0 3.1.6

$ grep -c "RESOLVED:" .planning/phases/03-backtest-harness-two-protocol-ptb/03-RESEARCH.md
7   # header note + Q1..Q6
```

## Threat Flags

None. The spike adds no executable code paths; all changes are documentation
and dependency-version bumps. The `@mysten/deepbook-v3@1.3.6` upgrade adds 30
transitive packages to `pnpm-lock.yaml` — supply-chain surface enlarged, but
this is mitigated by pnpm's integrity-hash lockfile (T-03-03 from the plan's
threat register).

## Known Stubs

None introduced by this plan. (Pre-existing stubs in Phase 2's vault.move
filed as D-VAULT-01 in deferred-items.md.)

## What Plan 03-02+ Inherits

- 5-call PTB shape spec ready for `scripts/two-protocol-ptb-demo.ts` (Plan 03-05).
- `@mysten/deepbook-v3@1.3.6` with `testnetMarginPools` + `MARGIN_REGISTRY_ID` exports usable directly.
- `backtest/` has plotly + jinja2 for `report.py` (Plan 03-08).
- `cycle-full.json` schema convention: u64 fields as strings, IDs hex, direction u8 int.
- `nightly-backtest.yml` slot reserved at 05:00 UTC.
- mock_margin_pool fallback path activated (no live DUSDC margin pool); Plans 03-03 + 03-05 ship the mock integration test per CONTEXT.md D-18.

## Self-Check: PASSED

Files exist:
- `.planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md` — FOUND
- `.planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md` — FOUND
- `.planning/phases/03-backtest-harness-two-protocol-ptb/deferred-items.md` — FOUND

Commits exist:
- `682b288` (Task 1) — FOUND
- `b7aa541` (Task 2) — FOUND
- `41056ce` (Task 3) — FOUND
- `7956e1f` (Task 4) — FOUND
