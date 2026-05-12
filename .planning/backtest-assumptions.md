# DeepVault Backtest — Assumption Ledger

**Last updated:** 2026-05-12
**Owner:** Phase 3 backtest harness (Plans 03-02 .. 03-09)
**Read-first for planner per CONTEXT.md D-05.**

This ledger is loaded into the institutional HTML report (Section 2 per CONTEXT.md
D-13). Cold-read test: an institutional LP must be able to identify every load-
bearing assumption + its `available_at` semantics from this file alone.

## Data Sources

### BTC OHLCV (BACK-01)

- **Source:** CryptoDataDownload Binance — `https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv`
- **Window:** 365 days hourly (~8,760 bars) per CONTEXT.md D-01.
- **Format:** `Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount`
  with a "Disclaimer" prefix line (skiprows=1). Verified 2026-05-11 (RESEARCH.md
  A6/A7). Format-drift guard: `assert df.columns[0] == 'Unix'` in
  `backtest/src/deepvault/data_ingest.py` fails LOUDLY on any column reshape
  (T-03-05 mitigation).
- **Unit convention:** the CSV's `Unix` column is **seconds**. The ingest pipeline
  renames `Unix → ts_ms` AND multiplies by 1000 so the column name matches its
  unit and aligns with the Move side's u64 ms timestamps (vault events emit ms).
- **available_at semantics:** A bar with `ts_ms = T` (the bar's OPEN timestamp)
  is observable at `available_at = T + 3_600_001` (1 hour + 1 ms — the bar
  closes at T+1h, data is queryable 1 ms after close). Every join condition in
  the backtest enforces `available_at <= decision_time`. The `@strategy_fn`
  decorator (Plan 03-02 `backtest/src/deepvault/replay.py`) is the runtime
  enforcement of this invariant.
- **Gap policy:** `load_window` raises RuntimeError if any consecutive gap
  exceeds 1 hour + 60 s slack. Binance maintenance windows are rare; the goal
  is to fail LOUDLY rather than silently backtest a holed tape (T-03-06).
- **Why not Deribit IV history?** BACK-01 lists Deribit as "if available".
  Skipped per CONTEXT.md Claude's Discretion: "free Deribit IV history is
  fragmented post-2022; CryptoDataDownload Binance gives us a single clean
  source." Adding Deribit is a v2 nice-to-have.

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

## PnL Attribution Model (D-09)

Six columns sum to total return per bar:
- `plp_yield_bps`: PLP per-block accrual. **v1 model: 0 everywhere** (we BUY
  hedges via `predict::mint`, not provide PLP via `predict::supply` — RESEARCH.md
  A3 + WAVE0-DECISION.md Q3). Column exists for v2 STRAT-V2-01 expansion.
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
- 365+ day history — current scope is 365 days; pre-Binance-launch (Jul 2017)
  data is patchy from free CSV sources.
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
