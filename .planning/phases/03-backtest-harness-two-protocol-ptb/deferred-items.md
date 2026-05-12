# Phase 3 Deferred Items

Tracking for out-of-scope discoveries during Phase 3 execution. Per GSD execution rules,
auto-fix only issues directly caused by current task's changes; everything else lands here.

## Deferred from Plan 03-01 (Wave 0 spike, 2026-05-12)

### D-PUB-01: `sui client publish` blocked on `deepbook_predict` dep resolution

**Discovered during:** Plan 03-01 Task 1 publish-blocker investigation.

**Symptom:** `cd contracts && sui client publish --gas-budget 500000000 --dry-run`
emits `Unpublished dependencies: deepbook_predict` even though the package is deployed
on testnet at `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`.

**Root cause:** Vendored `scripts/deepbookv3/packages/predict/Move.toml` has
`[addresses] deepbook_predict = "0x0"` and no `[package].published-at` field. Sui CLI
1.71.1 requires `published-at` in the dep's own Move.toml to recognize it as
pre-deployed. We can't edit a remote git-fetched dep's Move.toml; the `[addresses]`
override mechanism conflicts with the dep's own address declaration.

**Workaround for Phase 3:** Phase 3 does NOT require `sui client publish` — the
testnet `deepvault` package is already deployed (Plan 02-09 TESTNET-DEPLOY.json), and
Phase 3's PTB demo (Plan 03-05) uses `tx.moveCall` against that deploy. The publish
blocker only matters for redeploys (Phase 5 mainnet).

**Resolution path (Plan 03-09 closeout or Phase 5 prep):**

- Switch `contracts/Move.toml` `deepbook_predict` dep from `git = ...` to `local = "../scripts/deepbookv3/packages/predict"`.
- Add `published-at = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"` to the vendored package's `[package]` block.
- Update `scripts/predict-diff.sh` to be aware of the local-dep mode.

**Filed in:** WAVE0-DECISION.md "Publish-blocker investigation" section.

---

### D-VAULT-01: Five `vault::*` accessor functions missing (Phase 2 leftover stubs)

**Discovered during:** Plan 03-01 Task 1 attempt (c) `--with-unpublished-dependencies` build.

**Symptom:** With `--with-unpublished-dependencies`, the build re-resolves addresses
and exposes missing functions referenced by `contracts/sources/rebalance.move`:

- `vault::hedge_cost_basis`
- `vault::hedge_notional`
- `vault::new_hedge_position`
- `vault::hedges_mut`
- `vault::hedge_keys_mut`

**Why plain `sui move build` doesn't catch it:** Normal mode resolves
`deepbook_predict` as pre-deployed and skips re-linkage of `rebalance.move`'s vault
function references. The `--with-unpublished-dependencies` mode re-checks linkage and
trips these missing accessors.

**Impact:** Zero runtime impact (production deploy uses normal mode). Affects only the
unpublished-dep dry-run path.

**Phase 2 verification gap:** These accessors were likely intended for Phase 2's
rebalance integration but never landed. Phase 2 tests pass because they use test-only
helpers that bypass these accessors.

**Resolution path:** Add the five accessor functions to `contracts/sources/vault.move`.
Defer to Plan 03-09 closeout (or as a tail-end Plan 02 verification followup).

**Severity:** LOW — not on Phase 3 critical path.

---

## Resolved Items

(None yet for Phase 3.)
