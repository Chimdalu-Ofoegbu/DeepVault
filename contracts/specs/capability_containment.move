// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Sui Prover spec slot — capability containment.
//
// **W4 lock (Plan 02-07): documentation stub only.**
//
// The structural property "TreasuryCap<SHARE> and AdminCap never appear
// in any function's return value across the deepvault package" is a
// TYPE-LEVEL property, not a runtime property — Sui Prover proves
// runtime properties (preconditions, postconditions, value invariants).
// Capability containment is therefore enforced by a different mechanism.
//
// **Load-bearing mechanism:** the grep-based CI check in
// `.github/workflows/ci.yml`'s `move` job (Task 2 of Plan 02-07), which
// fails the per-push build if any `public fun` returns `TreasuryCap` or
// `AdminCap`. That step is the artifact responsible for VAULT-10's
// capability-containment property.
//
// **This file:** documentation anchor only. Per W4 amendment, this is
// NOT a Sui Prover spec — it ships a no-op `documentation_anchor()` fn
// so future Sui-Prover capability-tracking features (or auxiliary tools
// that look up properties by symbolic name) have a stable Move-level
// slot to attach to. There is intentionally NO prove annotation in
// this file; its presence here would mislead a reader into thinking
// Sui Prover is enforcing the property.
//
// Closes VAULT-10 (capability containment property — primary mechanism
// is the grep CI step; this file documents intent).

module deepvault::specs::capability_containment;

/// Documentation anchor for the capability-containment property.
///
/// The grep CI step in `.github/workflows/ci.yml`'s `move` job is what
/// actually enforces the property; this function is intentionally empty
/// and serves only to give the property a stable Move-level name. Do
/// not call this function — it is a documentation marker.
public fun documentation_anchor() {}
