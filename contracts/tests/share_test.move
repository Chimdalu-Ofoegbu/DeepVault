// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Tests for deepvault::share — verifies the OTW init() emits a
// PendingTreasury (containing the TreasuryCap<SHARE>) to the deployer
// and that `consume_pending` is the only path that extracts the cap.

#[test_only]
module deepvault::share_test;

use deepvault::share::{Self, PendingTreasury};
use sui::test_scenario as ts;
use sui::test_utils::destroy;

#[test]
fun init_creates_pending_treasury_for_deployer() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    share::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);

    // The PendingTreasury landed in the deployer's inventory.
    let pending = scenario.take_from_sender<PendingTreasury>();

    // Capability containment: only `consume_pending` extracts the inner cap.
    let cap = share::consume_pending(pending);
    destroy(cap);
    scenario.end();
}
