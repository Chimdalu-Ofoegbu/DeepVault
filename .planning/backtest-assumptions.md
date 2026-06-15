# DeepVault Backtest — Assumption Ledger

**Last updated:** 2026-06-15
**Owner:** Phase 3 backtest harness (Plans 03-02 .. 03-10)
**Read-first for planner per CONTEXT.md D-05.**

This ledger is loaded into the institutional HTML report (Section 2 per CONTEXT.md
D-13). Cold-read test: an institutional LP must be able to identify every load-
bearing assumption + its `available_at` semantics from this file alone.

## Data Sources

### BTC OHLCV (BACK-01)

> **2026-06-15 supersede:** the data source moved from the CryptoDataDownload
> (CDD) Binance CSV to the **Binance public data-mirror** klines API. The CDD
> feed shipped (a) mixed-unit timestamps and (b) 409 gaps > 1 h across its
> history (including recurring 6-day holes) which the `load_window` gap guard
> (T-03-06) correctly rejected. The Binance mirror is contiguous (crypto trades
> 24/7), so the audit-integrity gap guard passes on real data with no
> gap-filling. The CDD-specific text below (CSV format, `Unix`-seconds column,
> `skiprows=1`, `columns[0] == 'Unix'` guard) is **obsolete** and retained only
> as provenance.

- **Source:** Binance public market-data mirror —
  `https://data-api.binance.vision/api/v3/klines` (symbol `BTCUSDT`, interval
  `1h`). No auth, no API key, market data only. Reachable where
  `api.binance.com` is geo-blocked. Implemented in
  `backtest/src/deepvault/data_ingest.py` (`fetch_btc_hourly` →
  paginated, deduped, sorted ascending, cached to
  `backtest/data/btcusdt_1h.parquet`).
- **Window:** 365 days hourly (~8,760 bars) per CONTEXT.md D-01; the fetcher
  pulls `FETCH_WINDOW_DAYS = 420` for walk-forward headroom and `load_window`
  slices to the active window.
- **Kline payload → canonical schema:** the raw kline array
  `[openTime_ms, open, high, low, close, volume_btc, closeTime_ms,
  quoteVolume_usdt, trade_count, ...]` is projected to
  `ts_ms / open / high / low / close / volume_btc / volume_usdt / trade_count`.
- **Unit convention:** Binance `openTime` is already **milliseconds**; it is
  stored verbatim as `ts_ms` (NO ×1000) so the column matches its unit and
  aligns with the Move side's u64 ms vault-event timestamps. *(This supersedes
  the CDD-era "`Unix` is seconds, multiply by 1000" rule.)*
- **available_at semantics:** A bar with `ts_ms = T` (the bar's OPEN timestamp)
  is observable at `available_at = T + 3_600_001` (1 hour + 1 ms — the bar
  closes at T+1h, data is queryable 1 ms after close). Every join condition in
  the backtest enforces `available_at <= decision_time`. The `@strategy_fn`
  decorator (Plan 03-02 `backtest/src/deepvault/replay.py`) and the
  strategy-sim trailing-vol gate (Plan 03-10
  `backtest/src/deepvault/strategy_sim.py`) are the runtime enforcement of this
  invariant.
- **Gap policy:** `load_window` raises RuntimeError if any consecutive gap
  exceeds 1 hour + 60 s slack. The goal is to fail LOUDLY rather than silently
  backtest a holed tape (T-03-06).
- **Why not Deribit IV history?** BACK-01 lists Deribit as "if available".
  Skipped per CONTEXT.md Claude's Discretion: free Deribit IV history is
  fragmented post-2022; the Binance mirror gives a single clean OHLCV source.
  The consequence is documented under "Strategy Simulation Model" → hedge
  pricing: with no IV surface, the backtest prices hedges from trailing
  realized vol (the IV proxy). Adding Deribit IV is a v2 nice-to-have.

### SVI Surface (MATH-06)

- **Source:** Bit-equal Move/Python/TS SVI evaluator (Phase 1 parity gate;
  `backtest/src/deepvault/svi.py`).
- **available_at semantics:** SVI parameters at decision time `t` are fit from
  data ending strictly before `t` — i.e., `fit_window_end_ts < decision_ts` for
  every binary mint. The `@strategy_fn` decorator (Plan 03-02) enforces this
  at runtime by gating column access on the harness DataFrame.

## Strategy Parameters (LOCKED — Phase 0 D-01..D-05)

- Hedge allocation = 10% (ALLOCATION_BPS = 1000)
- Strike OTM offset = -15% (STRIKE_OTM_BPS = 1500)
- Tenor = 14 days (TENOR_SECONDS = 1_209_600)
- Roll trigger = 2 days before expiry (ROLL_TRIGGER_SECONDS = 172_800)
- Sizing = fixed-ratio v1, parameterized for v2 dynamic (STRAT-V2-01)
- These are NOT tuned on OOS data per Phase 0 hedge-policy lock. The Phase 3
  sensitivity table (hedge ratio in {0.05, 0.10, 0.15, 0.20, 0.30}) exists to
  show robustness, NOT to pick the optimum (PITFALLS Pitfall 2).

## Strategy Simulation Model (Plan 03-10 — `strategy_sim.py`)

This is the economic model that produces the backtest's returns, drawdown, and
PnL attribution. It is **float-based** (pandas-friendly; NOT parity-bound) and is
intentionally separate from `vault_state.py` — that module is the Move-parity
state machine asserted against live testnet traces within 1 wei (D-14/15/16),
and is **not modified** by the strategy sim. Every number below is an explicit,
defensible assumption an institutional LP can cold-read.

**Normalization.** Initial deposit NAV = **1.0**. The equity curve IS the NAV
series. Returns are reported as fractions of initial NAV.

**Two sleeves** (alloc = `hedge_ratio`, e.g. 0.10):

1. **PLP sleeve** = `(1 − hedge_ratio)` of capital. Per hourly bar it earns a
   constant yield NET of an inventory drag:
   - **PLP yield.** `PLP_APY = 0.08` (**8% APY — an ASSUMPTION**). Rationale:
     Predict PLP vaults market double-digit APYs; we deliberately pick a modest,
     conservative 8% so the headline is defensible rather than promotional.
     Accrues per bar: `nav += plp_capital × ((1+PLP_APY)^(1/8760) − 1)`,
     where `plp_capital = (1−hedge_ratio) × NAV` and 8760 = 24×365 (BTC 24/7).
     Parameterized for v2 dynamic policies (STRAT-V2-01).
   - **PLP LVR drag.** `PLP_LVR_COEFF = 0.25`. LP liquidity providers carry an
     adverse-selection / inventory cost — **Loss-Versus-Rebalancing** (Milionis,
     Moallemi & Roughgarden, 2022), the canonical AMM/LP loss term — which scales
     with realized **variance**. Per bar: `nav −= PLP_LVR_COEFF × r_t² ×
     plp_capital`, where `r_t` is that bar's realized log-return. On 365-day BTC
     this is a modest ~4–5%/yr drag. It is also what gives the PLP NAV realistic
     **per-bar variance** — a pure-yield ramp would have an unrealistically high
     Sharpe (the sim without it produced OOS Sharpe ~7.7, flagged indefensible).
     `r_t²` is an observation of the just-closed bar, not a forward look.
     Coefficient is conservative and parameterized for v2 calibration against
     live PLP pool P&L.

2. **Hedge sleeve** = rolling OTM binary-put crash insurance, rolled every
   `tenor` (14 days). Sizing is **coverage-based (insurance economics)**, NOT a
   naive fixed-premium binary:
   - **Why not the naive fixed-premium binary?** A binary that spends a fixed
     premium and takes `notional = premium / p` blows up as the option price
     `p → 0` (deep OTM, low vol): e.g. a σ≈26% cycle priced `p≈0.0009`, turning a
     0.4% premium into a position that pays **>400% of NAV** if the strike
     breaches. That ~1000:1 payout makes a single hedge hit a lottery jackpot and
     is **indefensible** as "crash insurance". (This is a deliberate **deviation**
     from a literal premium-then-notional reading of the model; it fixes an
     economic bug — Rule 1.)
   - **Coverage sizing (used).** Each cycle TARGETS a payout of
     `coverage = hedge_ratio × NAV` if the −15% strike breaches (the hedge covers
     a `hedge_ratio` slice of the book against the tail). Its fair premium is
     `p × coverage`. To stay within the sustainable insurance budget, premium is
     **CAPPED** at `budget = hedge_ratio × NAV × (tenor_days/365)`; when the fair
     premium exceeds the budget (high-vol regimes) the vault buys LESS coverage
     (`notional = budget / p`) rather than overspending. This **bounds the
     payout** (max ≈ `hedge_ratio × NAV`, no 1/p jackpot) and makes the premium
     vary correctly with vol (cheap when calm, dearer when stressed). The ANNUAL
     hedge spend lands ≈ the `hedge_ratio` insurance budget (~5–6% at 10% on the
     365-day window) — the sustainable interpretation, NOT `hedge_ratio` per
     cycle (which would be ~26× the budget/yr).
   - **Warm-up guard.** A cycle whose trailing window has < 48 usable bars, or a
     zero/degenerate σ, is **SKIPPED** (no premium, no position) — this prevents
     the bar-0 cold-start (no trailing data → σ=0 → floored p → absurd notional).
     The rolling-hedge program effectively starts once a credible realized-vol
     estimate exists.

**Hedge pricing — realized-vol Black–Scholes digital put (the IV proxy).**
On-chain hedges price via the audited SVI evaluator (`svi.py`, separately
parity-validated against the Gatheral paper and the on-chain `oracle.move`). The
**backtest** prices hedges via a **Black–Scholes digital (binary) put using
trailing realized volatility as the IV proxy** — no historical IV surface is
available (Deribit IV deferred to v2; see Data Sources). Specifics:
- **Trailing realized vol σ.** Annualized stdev of hourly log-returns over a
  trailing window of **720 bars (30 days)**: `σ_hourly = std(log(close_t /
  close_{t−1}), ddof=1)`, `σ_ann = σ_hourly × sqrt(24×365)`. Computed ONLY from
  bars whose `available_at ≤` the cycle-open decision time (lookahead-safe). If
  fewer than 720 bars are observable, what's available is used (subject to the
  48-bar warm-up minimum).
- **Strike** `K = S0 × (1 − strike_otm)` = `S0 × 0.85` (−15% OTM).
- **Binary put price** under **zero-drift** risk-neutral BS:
  `d2 = (ln(S0/K) − 0.5 σ² T) / (σ √T)`, `T = tenor_days/365`, `p = Φ(−d2)`.
  **Zero drift is an explicit assumption** — we do not impose a BTC drift on the
  hedge leg. Guards: σ>0, T>0; `p` clamped to `[1e-6, 1−1e-6]`.
- **Settlement — expiry-spot.** At cycle expiry (the bar `tenor` later) the spot
  `S_T` is the realized price at that bar (an observation made at expiry, NOT a
  forward look from cycle open). `payoff = notional if S_T < K else 0`. v1 uses
  **expiry-spot settlement**, not path-minimum — a hedge that dips below K
  intraperiod but recovers by expiry does NOT pay. Documented simplification;
  path-dependent (American/barrier) settlement is a v2 fidelity item.

**Net hedge PnL per cycle** = `payoff − premium`.

**Lookahead safety (BACK-03/BACK-06 — headline audit claim).** Every cycle-open
decision (σ estimate, strike, premium, notional) uses ONLY bars observable at
that bar's decision time (`available_at` gate). Settlement reads the realized
expiry-bar spot. The input frame is consumed **READ-ONLY** (columns copied into
numpy, never written back), so the OOS slice is bit-identical pre/post run
(`test_oos_never_touched_during_calibration`). A dedicated test
(`test_future_crash_does_not_change_past_decision`) proves mutating bars AFTER a
cycle open leaves that cycle's σ/premium/notional/strike unchanged.

**Attribution identity.** The 3-way (4-component) decomposition reconstructs the
total return exactly:
`total_return = plp_yield − plp_lvr − hedge_cost + hedge_payoff`
(asserted to float tolerance in `test_strategy_sim.py`). This is what the report
renders in Section 6.

**Validated numbers (365-day window, hedge_ratio = 0.10, run 2026-06-15):**

| Quantity | Value |
|---|---|
| Realized σ_ann (priced cycles) | 26.3% – 60.3% (mean 40.4%) |
| Binary put price p (−15% / 14d) | 0.0009 – 0.0939 (mean 0.028) |
| Premium per cycle | ~0.21% of NAV (mean) |
| Annual hedge cost | 5.43% of NAV |
| PLP yield (full-window cum) | +7.14% |
| PLP LVR drag (full-window cum) | −4.16% |
| Hedge cost (full-window cum) | −5.43% |
| Hedge payoff (full-window cum) | +9.98% (1 payoff fired) |
| **Total return (full window)** | **+7.52%** |
| Hedged max drawdown (full window) | −1.66% |
| Unhedged buy-and-hold BTC max DD | −52.86% |
| OOS (recent 30%) Sharpe @ 0.10 | −1.92 (no payoff in calm OOS regime; insurance is a net cost there) |
| OOS unhedged BTC max DD | −28.02% (vs hedged −0.99%) |

The OOS window saw no hedge payoff (BTC ranged sideways), so the insurance is a
net cost there — the honest cost of carry. Over the full window, where a −15%
breach fired, the payoff dominates and the strategy is net positive while
cutting drawdown ~32× vs holding spot. This asymmetry — small steady bleed,
large tail protection — is the intended "PLP yield minus crash insurance"
profile.

## PnL Attribution Model (D-09)

> **2026-06-15 note (Plan 03-10):** the on-chain six-column model below
> (`pnl_attribution.py`) is the per-*action* trace accountant retained for the
> testnet trace-replay path. The **backtest's** return decomposition is now the
> 3-way **strategy attribution** documented under "Strategy Simulation Model"
> (PLP yield − PLP LVR − hedge cost + hedge payoff), surfaced by
> `walk_forward.run_walk_forward()` and rendered in report Section 6. The
> `plp_yield_bps = 0` note below describes the *on-chain action* accountant, not
> the backtest — in the backtest, PLP yield is non-zero and explicitly modeled.

Six columns sum to total return per bar:
- `plp_yield_bps`: PLP per-block accrual in the **on-chain action accountant**.
  **0 everywhere in that accountant** (on-chain we BUY hedges via
  `predict::mint`, not provide PLP via `predict::supply` — RESEARCH.md A3 +
  WAVE0-DECISION.md Q3). The backtest's PLP yield is modeled separately (see
  Strategy Simulation Model). Column exists for v2 STRAT-V2-01 expansion.
- `hedge_cost_bps`: Premium paid per bar (cost basis of new hedges + new rolls).
- `hedge_payoff_bps`: Settlement payoffs received per bar.
- `fees_bps`: Strategy-level fees. **v1 = 0 per Phase 2 D-13.**
- `slippage_bps`: Next-bar VWAP minus next-bar open (BACK-08 pessimistic fills).
- `gas_bps`: Sui gas at testnet prices. **Assumption: 1 bp per PTB** (supply,
  hedge_mint, roll, redeem_request, redeem_fulfill, redeem_cancel — every
  state-mutating action contributes 1 bp; non-tx bars contribute 0).
  Documented because real gas is signer-dependent and varies bar-to-bar; the
  deterministic model is calibrated against `result.effects.gasUsed` once the
  full 365-day cycle-full.json artifact lands (Plan 03-09 cross-check).
  Implemented in `backtest/src/deepvault/pnl_attribution.py` Plan 03-08.
- `slippage_bps`: **Defined as `(next-bar VWAP − next-bar open) / next-bar open
  × 10_000`** (BACK-08 pessimistic-fill convention). Slippage is negative when
  next-bar opens above its VWAP — the bar's intra-bar prints walked DOWN, so
  the supply's market fill was worse than the next bar's open. When no next
  bar exists (the action lands on the last bar of the window) or next-bar
  volume is zero, slippage is recorded as 0. Implemented in Plan 03-08.

## Sharpe / Sortino / Drawdown (D-10 / BACK-09)

- Annualization: 8,760 bars/year (BTC trades 24/7). RESEARCH.md A9.
- Risk-free rate = 0 (hackathon convention; documented per CONTEXT.md D-10).
- Sharpe/Sortino computed on OOS only (most recent 30% per D-03).
- Max drawdown reports underwater duration AND depth.

## Walk-Forward Methodology (D-03 / D-04)

- OOS split: most recent 30% of window (~110 days at 365-day window).
- In-sample is the older 70%, bucketed monthly.
- Cadence: monthly. Calibrate on month N (training data ≤ N-1), deploy on month
  N+1. Never look at month N+1 during calibration.
- OOS data is NEVER written to during calibration. Plan 03-08 enforces via
  `@strategy_fn(reads=full_window, writes=in_sample_only)` and a property test
  in `test_walk_forward.py`.

## Lookahead-Bias Audit (D-06 / D-07 / D-08)

- **Shuffled-label sanity test:** `|alpha| <= 0.5% APY` to pass (D-06). Above
  0.5% blocks the backtest run and surfaces a leak.
- **Hand recompute:** 3 random trade rows (`np.random.choice` seed 42), notebook
  at `backtest/notebooks/hand-recompute.ipynb`. Numbers must match the harness
  output to the wei (D-07).
- **@strategy_fn decorator** enforces decision-bar / observation-bar split at
  runtime (D-08). Implementation: Plan 03-02 (`backtest/src/deepvault/replay.py`,
  shipped 2026-05-12, 95% test coverage). Any strategy function reading or
  writing a column not declared in its `reads=`/`writes=` manifest raises
  `LookaheadViolation`.

## Stress Events (D-02)

- **Event 1:** August 5 2024 yen-carry unwind (BTC -15% intraday). Clean tail
  event; demonstrates hedge payoff fires when needed.
- **Event 2:** One 2024-2025 high-vol episode picked at backtest time (Q1 2025
  selloff or a 2026 vol event within the 365-day window).
- At least one of the two MUST be in the OOS holdout.

## Trace-Replay Parity (D-14 / D-15 / D-16)

- Python `vault_state` machine mirrors Move semantics bit-for-bit (D-14). Plan
  03-04 ships this module.
- Trace generation is live testnet, NOT synthetic (D-16). Reviewers can re-run
  the capture via `scripts/two-protocol-ptb-demo.ts` and `scripts/e2e-vault-cycle.ts`.
- **JSON convention** (WAVE0-DECISION.md Q5): u64 fields as **strings** (avoids
  JavaScript Number 2^53 precision loss), IDs as 0x-lowercase-hex strings, u8
  direction codes as numbers.
- Tolerance: 1 unit at NAV_SCALE = 1e9 (matches Phase 1 `parity_runner.py`).

## Excluded From v1

- Per-second hedge re-mark — v2 backtest-fidelity question.
- Minute-bar resolution — hourly only at v1.
- Multi-asset (ETH, SOL) — BTC-only.
- 365+ day history — current scope is 365 days (the Binance data-mirror serves
  contiguous recent history; very deep history is out of scope at v1).
- Dynamic hedge sizing — STRAT-V2 territory.
- Deribit IV history — see "Why not Deribit?" above.

## Open Risks (RESOLVED in Wave 0)

- **@mysten/deepbook-v3 SDK version pin (0.17.0 vs 1.3.6)** — resolved in Plan
  03-01 Wave 0 spike. Pinned to **1.3.6** (Margin SDK builders absent in 0.17.0).
  See WAVE0-DECISION.md Q2.
- **DUSDC margin pool on testnet** — UNDETERMINED-FALLBACK-TO-MOCK. deepbook_margin
  IS deployed on testnet but no DUSDC-quoted MarginPool exists. Mock pool at
  `contracts/tests/mock_margin_pool.move` proves architectural readiness; live
  test gated on Margin governance whitelist. See MARGIN-WHITELIST-DECISION.md.
- **365-day backtest runtime budget** — PASS with massive headroom (1.33 s
  extrapolated vs 600 s budget; 598.67 s slack). The `@strategy_fn` escape-hatch
  (raw-DataFrame extraction via `df._df` after the gate validates reads) is
  documented on `_GatedFrame` but NOT load-bearing for v1. See WAVE0-DECISION.md
  Q4.
