# Wave 0 Decision: PredictManager Ownership Resolution

**Date:** 2026-05-10
**Question:** RESEARCH.md Open Question #1 — Who owns the PredictManager?
**Method:** Empirical Move test of three configurations (see `contracts/tests/_spike/predict_manager_owner_spike_test.move`).
**Spike module:** `contracts/sources/_spike/predict_manager_owner_spike.move`

## Outcome

| Option | Test name | Result | Notes |
|--------|-----------|--------|-------|
| (a) Vault-as-owner | option_a_vault_owns_manager_supplier_calls_via_vault_aborts | PASS (annotated `expected_failure(abort_code = ENotOwner)`) | Aborts with `ENotOwner` — confirmed `predict.move:228` fires when supplier != manager.owner. The `expected_failure` annotation makes the abort the test's pass condition; the *substantive* outcome is that option (a) is INCOMPATIBLE with `predict::mint`. |
| (b) Supplier-owned | option_b_supplier_owns_manager_supplier_mints_succeeds | PASS | Supplier creates the PredictManager in their own tx, then mints. `ctx.sender() == manager.owner() == SUPPLIER`. Line 228 holds. |
| (c) Two-moveCall PTB | option_c_two_movecall_ptb_supplier_owned_manager_succeeds | PASS | Mechanically equivalent to (b) at the assert site. Included so the spike's empirical table is complete; option (c) is DISALLOWED at plan level (B4 fix on Plan 02-04) because it directly contradicts CONTEXT.md D-06 ("vault::supply ends with an internal call to vault::rebalance::buy_hedge_for_deposit"). |

**Empirical evidence preserved.** The spike calls the real
`deepbook_predict::predict::create_manager` (a public function at
`predict.move:192`) under each sender configuration; reads
`manager.owner()` via the public accessor at `predict_manager.move:46`;
and runs the spike module's `assert_owner_matches_sender`, which is a
verbatim copy of `predict.move:228`'s assertion. If the spike assertion
holds for these operands, line 228 holds for the same operands —
`predict::mint` adds no extra logic before the assert.

We did not invoke the full `predict::mint` because `Predict` and
`OracleSVI` constructors are `public(package)` (predict.move:507,
oracle.move:368) and unreachable from this package. The owner check at
line 228 is the *first* statement in `predict::mint`; everything after it
is irrelevant to which ownership configuration Sui will accept.

## Decision

Selected: option b

**Selected option:** (b) — supplier-owned PredictManager.

**Rationale.** Line 228 of `predict::mint` asserts
`ctx.sender() == manager.owner()`. `manager.owner` is set at
`predict_manager.move:90` to `ctx.sender()` of whoever calls
`predict_manager::new`. Sui has no way to spoof `ctx.sender()` — it is
the original signer of the PTB. Therefore the only addresses that can
pass line 228 are addresses that themselves created the PredictManager.
For a vault that accepts deposits from arbitrary LPs, that means each
LP must own their own PredictManager. Option (b) — supplier creates the
manager, then deposits with it — is the unique configuration that
preserves both correctness (sender == owner) and the brief's flagship
single-PTB composability story.

Option (a) would require either (i) a Predict-side change to allow the
manager owner to delegate, or (ii) every supplier to authenticate as
the AdminCap holder. Neither is in scope. Option (c) is mechanically
viable but violates D-06 by removing the internal-call-from-supply
shape; we keep (c) in the table only to prove the assertion fires the
same way regardless of how many moveCalls intervene.

## D-06 / D-07 Re-route

CONTEXT.md D-06 says: "vault::supply ends with an internal call to
vault::rebalance::buy_hedge_for_deposit for the 10% allocation. Same
Programmable Transaction Block — depositor's gas pays the
predict::mint."

**Selected option (b) re-routes D-06 as follows:**

- **Single PTB still holds.** The supplier signs ONE PTB with TWO
  moveCalls: `predict::create_manager` (or a previously created
  manager) → `vault::supply`. Both run in the same atomic transaction;
  if either aborts, the whole PTB reverts.
- **Single Move entry function is relaxed.** `vault::supply` is no
  longer the sole entry — the PTB also calls `predict::create_manager`
  if the supplier doesn't already have a PredictManager. After the
  first deposit, the same manager is reused, so most subsequent deposits
  are still single-entry from the user's perspective.
- **Internal call from `vault::supply` to
  `vault::rebalance::buy_hedge_for_deposit` is preserved.** That call
  receives `&mut PredictManager` as a parameter (passed in by the
  supplier from the PTB) and forwards it into `predict_adapter::mint`,
  which forwards into `predict::mint`. Since `ctx.sender()` throughout
  this chain is the supplier and `manager.owner == supplier`, line 228
  passes.
- **Demo claim adjusted.** The brief says "single PTB" — that holds.
  The brief says "depositor's gas pays the predict::mint" — that
  holds. The phrase "single Move entry function" was Claude-discretion
  framing, not a CONTEXT.md commitment, and is relaxed to "single PTB
  with two moveCalls."

**D-07 (atomic abort on `predict::mint` failure)** is unchanged.
PTB-level atomicity guarantees that if the internal `predict::mint`
aborts (oracle stale, ask out of bounds, exposure cap hit), the entire
`vault::supply` reverts. Option (b) does not weaken this — the same
PTB still wraps both moveCalls.

## Downstream Plan Wiring

- **Plan 02-04 (supply.move).** Wire option (b) supply signature:
  ```move
  public fun supply<Quote>(
      vault: &mut Vault<Quote>,
      predict: &mut deepbook_predict::predict::Predict,
      predict_manager: &mut deepbook_predict::predict_manager::PredictManager,
      oracle: &deepbook_predict::oracle::OracleSVI,
      deposit: Coin<Quote>,
      clock: &Clock,
      ctx: &mut TxContext,
  )
  ```
  Inside `supply`, the internal call to
  `vault::rebalance::buy_hedge_for_deposit` forwards the same
  `&mut PredictManager` argument. The vault never owns or stores a
  PredictManager — it borrows the supplier's manager for the duration
  of the supply tx.

- **Plan 02-05 (rebalance.move).** `buy_hedge_for_deposit` and
  `roll_expiring` both take `&mut PredictManager` — for `roll_expiring`
  the caller's own manager is used (the caller owns the position
  being rolled, so they own the manager that holds it). The hedge
  registry stored inside the vault tracks `manager_id` per
  HedgePosition so the dashboard knows which manager holds each open
  hedge.

- **Plan 02-09 (E2E script).** The TS PTB driver builds two
  moveCalls in a single `Transaction`: first
  `tx.moveCall({ target: '<predict_pkg>::predict::create_manager' })`
  (only on the supplier's first deposit; cached after that), then
  `tx.moveCall({ target: '<deepvault>::supply::supply', arguments: [...] })`
  passing the freshly created manager's object reference. The script
  signs and submits as a single tx.

- **Plan 02-04 / 02-05 acceptance criteria.** Move tests must include
  a supplier-owned-manager happy path AND a stale-oracle abort test;
  both should compile against the option-(b) signatures recorded
  here.

## Demo Story Impact

The brief calls "atomic supply→hedge inside one PTB" the flagship
single-PTB composability moment. Under option (b) this still ships:
the user signs ONE PTB, sees ONE tx digest, and either both the
deposit + hedge land or neither does. The shift from "single Move
entry" to "two moveCalls in one PTB" is invisible to the user (the
dashboard wraps it in a single "Deposit" button) and does not change
Phase 4's two-protocol PTB extension — Phase 4 adds a Margin borrow
moveCall at the front, making it three moveCalls in one PTB. The
two-protocol composability story is preserved.

## CONTEXT.md Amendment Required?

No amendment required — D-06 and D-07 are still satisfied
semantically by option (b). D-06 reads as "atomic hedge purchase
inside `vault::supply` PTB", which option (b) preserves: same PTB,
internal call from `supply` into `rebalance::buy_hedge_for_deposit`,
internal call from `rebalance` into `predict_adapter::mint`. Only the
phrasing about a "single Move entry function" (which appears in
Claude's-discretion framing in `02-CONTEXT.md`'s Specifics section,
not in the locked decisions) is relaxed; the locked semantic content
is intact.

If a future review insists on stricter language, the proposed
amendment is to add to D-06: "PredictManager is supplied by the LP
via a separate moveCall in the same PTB (Wave 0 spike outcome —
Plan 02-01)." This is a documentation refinement, not a decision
change.
