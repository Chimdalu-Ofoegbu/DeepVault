// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// SPIKE module — Wave 0 of Phase 2.
//
// Resolves RESEARCH.md Open Question #1 (BLOCKER): PredictManager ownership.
//
// Background. `deepbook_predict::predict::mint` (vendored at SHA
// 1159d79af33c70e09e406310e1d8f067832ede9d, source line 228) opens with:
//
//     assert!(ctx.sender() == manager.owner(), ENotOwner);
//
// `manager.owner` is set at predict_manager.move:90 to `ctx.sender()` of the
// caller of `predict_manager::new`. So whoever creates the PredictManager is
// the only address Sui will accept as the `predict::mint` caller.
//
// Three ownership configurations are tested empirically in the companion
// test module (contracts/tests/_spike/predict_manager_owner_spike_test.move):
//   (a) admin creates the manager, supplier tries to mint via the vault
//       — expected: aborts (sender != owner)
//   (b) supplier creates the manager themselves, then mints
//       — expected: succeeds (sender == owner)
//   (c) supplier owns the manager and uses a two-moveCall PTB
//       (vault::supply records intent, then predict::mint runs separately)
//       — expected: succeeds (mechanically equivalent to b)
//
// We cannot construct a real `Predict` shared object from outside the
// vendored package (`predict::create<Quote>` is public(package)) and we
// cannot construct a real `OracleSVI` from outside either
// (`oracle::create_oracle` is public(package)). What we CAN do — and what
// the test does — is:
//   1. Call the real `deepbook_predict::predict::create_manager` (a public
//      function at predict.move:192) under each sender configuration.
//   2. Read the resulting `manager.owner()` via the public accessor at
//      predict_manager.move:46.
//   3. Run the same `ctx.sender() == manager.owner()` check that
//      `predict::mint` runs at line 228, with a copied error code so
//      `expected_failure` annotations bind.
//
// This is empirically equivalent to what `predict::mint` itself does at
// the assert: a real PredictManager built by Mysten code, read via the
// real public accessor, compared to a real `ctx.sender()`. If the assertion
// holds for our copy at the same operands, it holds for line 228.
//
// The whole `_spike/` namespace is deliberately deletable post-Wave 1 —
// no production code depends on it.

module deepvault::predict_manager_owner_spike;

use deepbook_predict::predict_manager::PredictManager;

/// Mirrors `deepbook_predict::predict::ENotOwner` (predict.move:38) verbatim.
/// Kept locally so `expected_failure(abort_code = ...)` can target this
/// module without importing a private constant. Same numeric value
/// (1) so cross-reference is unambiguous.
const ENotOwner: u64 = 1;

/// Mirrors the line-228 owner assertion in
/// `deepbook_predict::predict::mint`. Aborts with `ENotOwner` when the
/// transaction sender does not match the PredictManager owner — which is
/// exactly what `predict::mint` does before it even touches Predict state
/// or oracle math.
///
/// The function is `public(package)` only so the spike test in this same
/// package can call it. No production module references this — it's
/// confined to the `_spike/` namespace.
public(package) fun assert_owner_matches_sender(
    manager: &PredictManager,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == manager.owner(), ENotOwner);
}

/// Read accessor for the abort code so the test module can name it
/// in `#[test, expected_failure(abort_code = ...)]` annotations.
public(package) fun e_not_owner(): u64 {
    ENotOwner
}
