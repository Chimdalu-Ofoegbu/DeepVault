// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// SPIKE TEST — Wave 0 of Phase 2.
//
// Resolves RESEARCH.md Open Question #1: which PredictManager ownership
// configuration is compatible with the line-228 owner assertion in
// `deepbook_predict::predict::mint` (vendored at SHA
// 1159d79af33c70e09e406310e1d8f067832ede9d).
//
// The line-228 assertion the spike validates:
//
//     assert!(ctx.sender() == manager.owner(), ENotOwner);
//
// We cannot exercise the full `predict::mint` path because `Predict` and
// `OracleSVI` constructors are `public(package)` (predict.move:507,
// oracle.move:368) and unreachable from this package. The empirically
// equivalent test we run instead:
//
//   1. Call the real public `deepbook_predict::predict::create_manager`
//      (predict.move:192) which delegates to `predict_manager::new`
//      (predict_manager.move:88) — Mysten code, real shared PredictManager
//      with `owner = ctx.sender()` of the caller.
//   2. In a later transaction (with a possibly different sender), read
//      `manager.owner()` via the public accessor (predict_manager.move:46)
//      and run the spike module's `assert_owner_matches_sender(...)`,
//      which is a verbatim copy of the line-228 assertion semantics.
//
// If the spike assertion fires with `ENotOwner`, line 228 in the real
// `predict::mint` would also fire — there is no difference in semantics.
//
// Outcome (deterministic from the design, captured for audit in
// .planning/phases/02-vault-move-package-testnet-deploy/WAVE0-DECISION.md):
//   option (a) — admin creates, supplier mints     → MUST FAIL
//   option (b) — supplier creates, supplier mints  → MUST PASS
//   option (c) — supplier creates, supplier mints separately in same PTB
//                                                  → MUST PASS

#[test_only]
module deepvault::predict_manager_owner_spike_test;

use deepbook_predict::predict;
use deepbook_predict::predict_manager::PredictManager;
use deepvault::predict_manager_owner_spike;
use std::unit_test::assert_eq;
use sui::test_scenario as ts;

/// Admin / vault-deployer address. Owns the AdminCap in production.
const ADMIN: address = @0xa1;

/// Random supplier address — represents an LP calling `vault::supply`.
const SUPPLIER: address = @0xb2;

// ============================================================================
// Option (a): vault-as-owner — admin creates the PredictManager,
// supplier (a different address) tries to use it.
//
// Expected: aborts at `assert_owner_matches_sender` because
// `ctx.sender() == SUPPLIER` but `manager.owner() == ADMIN`. This is the
// same abort that line 228 of `predict::mint` would produce.
// ============================================================================
#[test, expected_failure(abort_code = predict_manager_owner_spike::ENotOwner)]
fun option_a_vault_owns_manager_supplier_calls_via_vault_aborts() {
    let mut scenario = ts::begin(ADMIN);

    // Admin creates a PredictManager — this is what would happen if
    // `vault::create_vault` (run by the deployer) called
    // `predict::create_manager` at deploy time per option (a).
    {
        let ctx = scenario.ctx();
        predict::create_manager(ctx);
    };

    // Switch to the supplier's transaction — this is what would happen
    // when an arbitrary LP calls `vault::supply` and the vault tries to
    // forward into `predict::mint`. `ctx.sender()` is now SUPPLIER, but
    // the PredictManager's `owner` is still ADMIN.
    scenario.next_tx(SUPPLIER);
    {
        let manager = scenario.take_shared<PredictManager>();
        // This call mirrors line 228 of `predict::mint` exactly:
        //   `assert!(ctx.sender() == manager.owner(), ENotOwner);`
        // Expected to abort with `ENotOwner`.
        predict_manager_owner_spike::assert_owner_matches_sender(
            &manager,
            scenario.ctx(),
        );
        ts::return_shared(manager);
    };

    abort // unreachable — guard for the expected_failure annotation
}

// ============================================================================
// Option (b): supplier-owned — supplier creates the PredictManager
// themselves, then immediately mints with their own manager.
//
// Expected: succeeds. `ctx.sender() == manager.owner() == SUPPLIER`.
// Line 228 of `predict::mint` would also pass in this configuration.
// ============================================================================
#[test]
fun option_b_supplier_owns_manager_supplier_mints_succeeds() {
    let mut scenario = ts::begin(SUPPLIER);

    // Supplier creates the PredictManager in their own tx — this is
    // option (b): the user's PTB front-loads `predict::create_manager`
    // before calling `vault::supply`.
    {
        let ctx = scenario.ctx();
        predict::create_manager(ctx);
    };

    // Same supplier "mints" — sender == owner, assert holds.
    scenario.next_tx(SUPPLIER);
    {
        let manager = scenario.take_shared<PredictManager>();
        predict_manager_owner_spike::assert_owner_matches_sender(
            &manager,
            scenario.ctx(),
        );
        // Verify the assertion's premise is true at the operand level —
        // this guards us against a silent pass.
        assert_eq!(manager.owner(), SUPPLIER);
        ts::return_shared(manager);
    };

    scenario.end();
}

// ============================================================================
// Option (c): two-moveCall PTB — supplier creates the manager and then
// (in the same PTB / scenario tx) calls `predict::mint` directly. The
// vault has already "recorded the intent" in an earlier moveCall.
//
// Expected: succeeds. Mechanically equivalent to option (b) at the
// `predict::mint` call site — the only difference is that the vault sees
// two moveCalls in the same PTB instead of one entry function. Line 228
// passes for the same reason: sender == owner == SUPPLIER.
//
// Per Plan 02-04 amendment (B4 fix), option (c) is DISALLOWED at the
// plan level — it contradicts CONTEXT.md D-06's "vault::supply ends with
// an internal call". The test is included so the spike's empirical
// table is complete (and to confirm option (c) is *not* blocked by the
// owner assertion — only by D-06). If the spike forces (c), Plan 02-01
// emits a `## PHASE SPLIT RECOMMENDED` block rather than silently
// dropping D-06.
// ============================================================================
#[test]
fun option_c_two_movecall_ptb_supplier_owned_manager_succeeds() {
    let mut scenario = ts::begin(SUPPLIER);

    // moveCall 1: supplier "records intent" — modeled here as a no-op
    // tx to keep the spike self-contained. In production this would be
    // `vault::supply` (without the internal hedge buy) or a thin
    // `vault::record_intent` entry.
    {
        let _ctx = scenario.ctx();
        // intentional no-op — placeholder for `vault::record_intent`
    };

    // moveCall 2: supplier creates manager and calls mint themselves,
    // same PTB / same scenario tx semantics. Sender == owner.
    scenario.next_tx(SUPPLIER);
    {
        let ctx = scenario.ctx();
        predict::create_manager(ctx);
    };

    scenario.next_tx(SUPPLIER);
    {
        let manager = scenario.take_shared<PredictManager>();
        predict_manager_owner_spike::assert_owner_matches_sender(
            &manager,
            scenario.ctx(),
        );
        assert_eq!(manager.owner(), SUPPLIER);
        ts::return_shared(manager);
    };

    scenario.end();
}
