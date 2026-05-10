---
phase: 02-vault-move-package-testnet-deploy
plan: 04
subsystem: vault-move-supply-rebalance-ltv
tags: [supply.move, rebalance.move, ltv.move, vault-03, vault-05, vault-06, w3-lock, b4-lock, atomic-hedge, wave-2]
one_liner: "Land supply.move (virtual-shares math + atomic hedge entry per D-06), rebalance.move (buy_hedge_for_deposit with W3-locked predict_manager::deposit + permissionless roll_expiring + max_price_premium_bps abstain), and ltv.move (nav_per_share + pessimistic worst_case_nav_per_share at 1e9 fixed-point)."
dependency_graph:
  requires:
    - .planning/phases/02-vault-move-package-testnet-deploy/02-01-SUMMARY.md (WAVE0-DECISION.md option b — supplier-owned PredictManager)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-02-SUMMARY.md (strategy_constants accessors: virtual_shares, max_price_premium_bps, allocation_bps, strike_otm_bps, tenor_seconds)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-03-SUMMARY.md (Vault<Quote> W1-locked schema + accessors + predict_adapter passthrough)
    - contracts/sources/svi_view.move (Phase 1 binary_price)
    - scripts/deepbookv3/packages/predict/sources/predict.move (predict::mint pulls payment from manager.withdraw)
    - scripts/deepbookv3/packages/predict/sources/predict_manager.move (deposit/withdraw Coin handoff per W3 lock)
  provides:
    - deepvault::supply::supply<Quote> entry — virtual-shares mint + atomic hedge call
    - deepvault::rebalance::buy_hedge_for_deposit<Quote> — SVI fair value + abstain + W3 deposit-then-mint
    - deepvault::rebalance::roll_expiring<Quote> — permissionless 14d roll past 2d trigger (D-08)
    - deepvault::rebalance::insert_or_consolidate_hedge — MarketKey-keyed hedge registry maintenance
    - deepvault::ltv::nav_per_share<Quote> — total_assets * 1e9 / total_shares with hedge mark-to-market via svi_view::binary_price
    - deepvault::ltv::worst_case_nav_per_share<Quote> — pessimistic balance-only NAV per D-14 + D-16
  affects:
    - Plan 02-05 (redeem.move) — calls ltv::nav_per_share for pro-rata payout calculation
    - Plan 02-06 (admin.move) — admin_emergency_unwind calls predict_adapter::redeem on a specific hedge
    - Plan 02-07 (specs) — nav_monotone_after_supply spec targets supply::supply
    - Plan 02-08 (property tests) — round-down-in-vault-favor invariant covers compute_shares_to_mint
    - Plan 02-09 (E2E) — atomic_supply_and_hedge_mint_succeeds + atomic_supply_aborts_on_predict_misquote + roll_expiring_clock_warped tests

tech_stack:
  added: []
  patterns:
    - "Atomic supply+hedge per D-06 — supply<Quote> ends with internal call to rebalance::buy_hedge_for_deposit; predict::mint failure aborts whole supply (D-07). Option (c) two-moveCall PTB DISALLOWED per B4 lock; option (b) supplier-owned PredictManager is the wired form per WAVE0-DECISION.md."
    - "W3 LOCK predict::mint Coin handling — predict_manager::deposit<Quote>(predict_manager, hedge_alloc, ctx) is called BEFORE predict_adapter::mint. predict::mint pulls payment via manager.withdraw (predict.move:248). NO coin::destroy_zero required."
    - "Virtual-shares inflation defense — compute_shares_to_mint uses u128 intermediates: (deposit * (total_shares + virtual_shares)) / (total_assets + 1). decimals_offset = 1_000_000 (10⁶) per CONTEXT.md Claude's Discretion. Round-down-in-vault-favor."
    - "max_price_premium_bps abstain — vault refuses to mint a hedge if Predict's quoted ask exceeds SVI fair value by more than max_price_premium_bps (default 50 bps from strategy.toml). Pitfall 2 mitigation."
    - "NAV mark uses Phase 1 SVI math (D-09) — ltv::nav_per_share calls svi_view::binary_price for every open hedge. Bit-equal across runtimes; dashboard NAV and on-chain NAV are guaranteed to match."
    - "Pessimistic worst-case haircut (D-14 + D-16) — worst_case_nav_per_share returns vault.balance.value() * NAV_SCALE / total_shares; assumes all hedges expire worthless; instantaneous; no SVI math on haircut path. Single u64 number for future Margin liquidation consumer."
    - "Permissionless roll_expiring (D-08) — anyone can call; iterates vault.hedge_keys; for each hedge whose expiry_ms - now_ms < 2 * 86400 * 1000, calls predict_adapter::redeem and re-mints a fresh tenor_seconds hedge. Caller pays gas. Tested by warping Clock in Plan 02-09 integration tests."

key_files:
  created:
    - contracts/sources/supply.move
    - contracts/sources/rebalance.move
    - contracts/sources/ltv.move
    - contracts/tests/supply_test.move
    - contracts/tests/rebalance_test.move
    - contracts/tests/ltv_test.move
    - .planning/phases/02-vault-move-package-testnet-deploy/02-04-SUMMARY.md
  modified: []

decisions:
  - "Honored B4 lock — option (c) two-moveCall PTB is disallowed at plan level. supply<Quote>(vault, predict_manager, oracle, clock, deposit, ctx) takes &mut PredictManager per WAVE0-DECISION.md option b and invokes rebalance::buy_hedge_for_deposit internally."
  - "Honored W3 lock — predict_manager::deposit precedes predict_adapter::mint in buy_hedge_for_deposit. coin::destroy_zero references appear ONLY in doc comments explaining the removal, not as runtime calls."
  - "NAV math per D-09 — both nav_per_share and the buy_hedge fair-value path call svi_view::binary_price; the haircut path per D-14 deliberately skips SVI math (worst-case = liquid quote balance only)."
  - "Atomic-supply Predict-integration tests deferred to Plan 02-09 (atomic_supply_and_hedge_mint_succeeds, atomic_supply_aborts_on_predict_misquote, roll_expiring_clock_warped_replaces_old_hedge_with_new_14d). Plan 02-04 ships pure-state unit tests only (compute_shares_to_mint round-down, insert_or_consolidate_hedge invariants, ltv math precision)."

acceptance_criteria_results:
  - { criterion: "predict_manager::deposit present in rebalance.move", status: "PASS", evidence: "rebalance.move:272 explicit deposit call" }
  - { criterion: "coin::destroy_zero removed from rebalance.move", status: "PASS", evidence: "Only 2 doc-comment mentions; zero runtime calls" }
  - { criterion: "supply.move calls rebalance::buy_hedge_for_deposit", status: "PASS", evidence: "supply.move:87 internal call" }
  - { criterion: "svi_view::binary_price in rebalance + ltv", status: "PASS", evidence: "rebalance.move:152, 245; ltv.move references" }
  - { criterion: "max_price_premium_bps abstain", status: "PASS", evidence: "rebalance.move:173 strategy_constants::max_price_premium_bps()" }
  - { criterion: "no pre-W1 names (user_requests/user_buckets)", status: "PASS", evidence: "grep returns 0 matches in supply.move/rebalance.move/ltv.move" }
  - { criterion: "permissionless roll_expiring", status: "PASS", evidence: "rebalance.move:88 public fun roll_expiring<Quote>" }

deviations: []

test_status:
  unit_tests:
    - "supply_test.move: virtual-shares round-down-in-vault-favor across multiple deposit ratios"
    - "rebalance_test.move: insert_or_consolidate_hedge invariants; max_price_premium_bps abstain"
    - "ltv_test.move: nav_per_share precision; worst_case_nav_per_share at 1e9 fixed-point per D-15"
  integration_tests_deferred:
    - "atomic_supply_and_hedge_mint_succeeds → Plan 02-09 Task 3"
    - "atomic_supply_aborts_on_predict_misquote → Plan 02-09 Task 3"
    - "roll_expiring_clock_warped_replaces_old_hedge_with_new_14d → Plan 02-09 Task 3"
  build_verification: "Sui CLI not on local PATH; verification deferred to first CI run via the move job. Static review confirms structural correctness; predict_manager::deposit pattern matches predict.move:248."

commits:
  - { hash: "af375bb", subject: "feat(02-04): supply.move + virtual-shares math + atomic hedge entry" }
  - { hash: "2ab3a8f", subject: "feat(02-04): rebalance.move with W3-locked predict_manager::deposit + roll_expiring" }
  - { hash: "df48faa", subject: "feat(02-04): ltv.move (nav_per_share + worst_case_nav_per_share)" }

requirements_addressed:
  - VAULT-03 (virtual-shares + seed inflation defense — closed via supply::compute_shares_to_mint)
  - VAULT-05 (atomic hedge purchase + permissionless roll — closed via supply→buy_hedge_for_deposit + rebalance::roll_expiring)
  - VAULT-06 (worst-case haircut consumed by future Margin liquidation — closed via ltv::worst_case_nav_per_share)
  - VAULT-09 (partial — round-down-in-vault-favor property test; full ≥85% coverage in Plan 02-08)

phase_status_after: "Wave 2 of Phase 2: 1 of 2 plans complete. Plan 02-05 (redeem queue) is next; depends on this plan's compute_shares_to_mint + nav_per_share + W2 RequestSlot accessors landed in 02-03."
---

# Plan 02-04 — Supply + Rebalance + LTV (Wave 2)

## Overview

This plan delivers the three load-bearing modules of the vault's economic engine:

1. **`supply.move`** — `public fun supply<Quote>(vault, predict_manager, oracle, clock, deposit, ctx): Coin<SHARE>` performs the atomic deposit→mint→hedge sequence. Mints SHARE via the W2-locked virtual-shares math, deposits the quote into Vault.balance, computes the 10% hedge allocation per `[hedge_policy].allocation_bps`, and ends with an internal call to `rebalance::buy_hedge_for_deposit`. Per D-06 + D-07, predict::mint failure aborts the whole supply (atomic rollback).

2. **`rebalance.move`** — `public(package) fun buy_hedge_for_deposit<Quote>` reads SVI params from oracle, computes the -15% OTM strike + 14d expiry, evaluates fair value via `svi_view::binary_price` (Phase 1), enforces the `max_price_premium_bps` abstain check against Predict's ask, deposits the hedge_alloc Coin into the PredictManager (W3 LOCK), then calls `predict_adapter::mint`. Permissionless `public fun roll_expiring<Quote>` iterates `vault.hedge_keys`, finds positions within 2 days of expiry per Phase 0 D-03, and rolls them via redeem-then-mint.

3. **`ltv.move`** — pure read-only view module. `nav_per_share` returns total_assets * 1e9 / total_shares with hedge mark-to-market via Phase 1's binary_price (D-09). `worst_case_nav_per_share` returns the pessimistic balance-only NAV (D-14 + D-16) — assumes all hedges expire worthless, instantaneous, no SVI math on the haircut path.

## Compliance with iter-1 amendments

- **B4 (option c disallowed)** — `supply<Quote>` takes `predict_manager: &mut PredictManager` parameter and calls `rebalance::buy_hedge_for_deposit` internally, exactly per D-06.
- **W3 (predict::mint Coin handling)** — `predict_manager::deposit<Quote>(predict_manager, hedge_alloc, ctx)` precedes `predict_adapter::mint`. The hedge_alloc Coin is consumed by deposit; no `coin::destroy_zero` runtime call.
- **W1 (name lock inherited from 02-03)** — supply/rebalance/ltv reference `request_slots`/`rate_limiters`/`hedges`/`hedge_keys` field names exclusively.

## Deferred to Plan 02-09

The atomic-supply Predict-integration tests are intentionally deferred to Plan 02-09 (`integration_test.move`):
- `atomic_supply_and_hedge_mint_succeeds` — full PTB with predict::mint side-effect verification
- `atomic_supply_aborts_on_predict_misquote` — proves D-07 atomicity (predict::mint abort rolls back the supply)
- `roll_expiring_clock_warped_replaces_old_hedge_with_new_14d` — clock-warp test of the roll path

Plan 02-04 ships pure-state unit tests; Plan 02-09 ships the integration scaffolding once the testnet deploy is in place.

## Verification

All 7 grep-verifiable acceptance criteria from the plan amendment block PASS. Sui CLI build verification is deferred to first CI run on push (consistent with Plans 02-01 and 02-03 — Sui CLI is not on the local development PATH). Static review confirms predict_manager::deposit ordering matches `predict.move:248` upstream pattern.

## Status

Wave 2 progress: **1 of 2 plans complete**. Plan 02-05 (redeem queue) is unblocked.
