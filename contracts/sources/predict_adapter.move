// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Single-file blast radius for predict::mint / predict::redeem ABI churn
// (RESEARCH.md Pitfall 6). All vault modules MUST go through this adapter.
// If Mysten changes the predict signatures, this is the ONE file to update.
//
// Source: scripts/deepbookv3/packages/predict/sources/predict.move
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
// Closes VAULT-07.

/// Thin passthrough wrapper over deepbook_predict::predict::{mint,redeem}.
module deepvault::predict_adapter;

use deepbook_predict::market_key::MarketKey;
use deepbook_predict::oracle::OracleSVI;
use deepbook_predict::predict::{Self, Predict};
use deepbook_predict::predict_manager::PredictManager;
use sui::clock::Clock;

/// Pure passthrough; no logic added — the indirection itself is the value.
/// Per WAVE0-DECISION.md option (b), the caller is responsible for supplying
/// a PredictManager whose `owner` matches `ctx.sender()` (predict.move:228).
public(package) fun mint<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    predict::mint<Quote>(predict, manager, oracle, key, quantity, clock, ctx);
}

/// Pure passthrough for closing a binary position.
public(package) fun redeem<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    predict::redeem<Quote>(predict, manager, oracle, key, quantity, clock, ctx);
}
