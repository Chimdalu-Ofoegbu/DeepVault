# DeepVault Hedge-Ratio Policy (v1)

**Status:** Locked
**Locked:** 2026-05-09 (Phase 0)
**Next review:** Phase 3 backtest (re-tunable on walk-forward only)
**Permanent freeze:** Phase 3 close (~2026-05-29, day before code freeze)
**Owner:** DeepVault solo builder

## Context

DeepVault is a structured-product vault on DeepBook Predict that fuses PLP yield with SVI-priced binary tail-risk hedges. The hedge-ratio policy determines how much of each deposit is routed to the hedge book and the geometry of the hedge purchases. This policy is committed before backtest opens to prevent hindsight tuning (see `.planning/research/PITFALLS.md` Pitfall 2).

## Decision (locked)

| Parameter | Value | Source-of-truth field |
|-----------|-------|------------------------|
| Allocation | 10% of new deposit | `shared/strategy.toml [hedge_policy] allocation_bps = 1000` |
| Strike | -15% OTM (binary put 15% below current BTC spot at hedge-mint time) | `shared/strategy.toml [hedge_policy] strike_otm_bps = 1500` |
| Tenor | 14 days | `shared/strategy.toml [hedge_policy] tenor_seconds = 1209600` |
| Roll trigger | Expiry < 2 days | `shared/strategy.toml [hedge_policy] roll_trigger_seconds = 172800` |
| Sizing function | Fixed (v1) | `shared/strategy.toml [hedge_policy] sizing_function = "fixed"` |

These values flow at build time into:
- `contracts/sources/strategy_constants.move` (Move runtime)
- `backtest/src/deepvault/strategy_constants.py` (Python runtime)
- `dashboard/src/lib/strategy_constants.ts` (TypeScript runtime)

via `scripts/codegen.py`. Editing the values requires regenerating all three files (`make codegen`) and a paired update to this ADR.

## Rationale (per parameter)

### Allocation: 10%

Standard DOV-class tail-hedge allocation. Preserves >85% of the PLP APY in normal regimes while providing meaningful crash protection. Values in [5%, 15%] are defensible; 10% is the center of the institutional norm.

### Strike: -15% OTM

Aligns with "crash insurance" framing. Pays on -2σ to -3σ weekly BTC moves. Tighter strikes (-5%, -10%) increase hedge cost without proportionally improving tail protection; wider (-25%, -30%) leave too large an unhedged drawdown band.

### Tenor: 14 days, roll trigger < 2 days

14-day tenor produces ~12-day cycles between rolls, balancing:
- Cost of vol decay on a held option (favor short tenor)
- Transaction cost of frequent rolls (favor long tenor)
- Complexity of overlapping positions (avoided with 14-day non-overlap)

7-day rolling is operationally noisier; 30-day tenor leaves too much unhedged dwell time between adverse SVI updates.

### Sizing function: Fixed (v1)

Brief Week-8 cut adopted up front: correct fixed-ratio sizing > buggy dynamic sizing under 39-day time pressure. The `sizing_function` parameter exists in `shared/strategy.toml` so a v2 phase can swap to a dynamic policy (vol-target, drawdown-target, signal-driven) without touching vault internals.

## Re-tuning policy

Re-tuning the four numbers above is permitted **only** during Phase 3 backtest (~Days 18-24) on out-of-sample-aware walk-forward analysis:

1. Calibrate parameters on a rolling 60-day in-sample window
2. Test on the next 14-day out-of-sample window only
3. Walk forward to the next window
4. Reserve final 30% of history as a held-out validation set never touched during calibration

Once Phase 3 closes, this policy is **frozen permanently**. Specifically forbidden:

- Re-tuning after seeing testnet stress test results
- Re-tuning after seeing mainnet behavior in the smoke test
- "Polishing" a parameter for the demo video

If the locked policy underperforms in backtest, document the underperformance and ship with the principled choice. Pitfall 2 in `.planning/research/PITFALLS.md` documents why this rule exists.

## Alternatives considered

- **Allocation = 5% or 20%** — bracketing checked; 10% is the published institutional norm
- **Strike = -10% / -20%** — tighter is more expensive, wider leaves drawdown gap; -15% is center
- **Tenor = 7 days / 30 days** — operational noise / dwell-time argument above
- **Dynamic sizing in v1** — Brief Week-8 cut; correctness wins under deadline

## Cross-references

- `shared/strategy.toml` — runtime source of truth (`[hedge_policy]` table)
- `scripts/codegen.py` — emitter for the three runtime constants files
- `.planning/research/PITFALLS.md` Pitfall 2 — lookahead-bias prevention
- `.planning/research/SUMMARY.md` Hard Policy Locks #10 — committed before backtest opens
- `CONTRIBUTING.md §"Hedge-ratio policy is locked"` — short-form summary for contributors
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` D-01..D-05 — original decision capture

## Change log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-05-09 | Initial lock (Phase 0) | Hard requirement: hedge-ratio policy committed before backtest opens |

After Phase 3 close, this section is closed. Future policy changes are v2 work.

---
*Locked 2026-05-09 (Phase 0). Permanent freeze: Phase 3 close (~2026-05-29).*
