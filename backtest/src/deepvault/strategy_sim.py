"""PLP + rolling-hedge strategy simulation (BACK-08 strategy core).

This module implements the *economic* simulation of the DeepVault structured
product: a PLP yield sleeve net of a rolling out-of-the-money binary-put crash
insurance sleeve. It produces the equity curve, total return, and a 3-way PnL
attribution that the walk-forward harness and the institutional HTML report
consume.

WHY THIS IS SEPARATE FROM vault_state.py
----------------------------------------
``vault_state.py`` is the Move-parity state machine: it mirrors on-chain u64/u128
accounting bit-for-bit and is asserted against live testnet traces within 1 wei
(D-14/D-15/D-16). That module answers "does Python agree with Move?". THIS module
answers a different question — "what return/drawdown does the PLP+hedge policy
produce over historical BTC?" — and is explicitly float-based (pandas-friendly,
per pnl_attribution.py's type-discipline note). The two never touch: the parity
machine is unchanged by this file.

MODEL (every number is documented in .planning/backtest-assumptions.md →
"Strategy Simulation Model"):

  Normalization: initial deposit NAV = 1.0. The equity curve IS the NAV series.

  Two sleeves (alloc = hedge_ratio, e.g. 0.10):
    * PLP sleeve = (1 − hedge_ratio) of capital, earning a documented constant
      ``PLP_APY`` (a conservative ASSUMPTION) NET of a realized-variance LP
      inventory cost (LVR). Per hourly bar:
        nav += plp_capital * ((1+PLP_APY)**Δt_years − 1)            # yield
        nav −= PLP_LVR_COEFF * log_ret_bar**2 * plp_capital         # LVR drag
      Δt_years = 1/(24*365). The LVR term (Loss-Versus-Rebalancing, Milionis–
      Moallemi–Roughgarden 2022) is the standard LP adverse-selection cost; it
      scales with each bar's realized variance, so it injects realistic per-bar
      NAV variance (a yield-only sleeve would be an unrealistically smooth ramp
      with an absurd Sharpe). Conservative coefficient → modest annual drag.
    * Hedge sleeve = rolling OTM binary put, rolled every ``tenor`` (14 days),
      sized as COVERAGE (insurance), not as a fixed-premium binary. Each cycle
      targets a payout of ``hedge_ratio * NAV`` if the -15% strike breaches
      (the hedge covers a hedge_ratio slice of the book against the tail); its
      fair premium is ``p * coverage``. Premium is CAPPED at the sustainable
      per-cycle insurance budget ``hedge_ratio * NAV * (tenor_days/365)`` — in
      high-vol regimes the vault buys LESS coverage rather than overspending.
      This bounds the payout (no 1/p jackpot as p→0) and makes the premium vary
      correctly with vol. The ANNUAL hedge spend lands ≈ the hedge_ratio budget.
      Rationale (deviation from a naive fixed-premium binary, which produces
      indefensible ~1000:1 payouts at low p) is documented in the ledger.

  Hedge pricing (realized-vol Black–Scholes digital put — the IV proxy):
    No historical IV surface exists, so the binary is priced from trailing
    realized vol. On-chain hedges price via the audited SVI evaluator
    (separately parity-validated in svi.py); the BACKTEST prices hedges via a
    BS digital put using trailing realized volatility as the IV proxy. Deribit
    IV history is deferred to v2 per the ledger.
      σ_ann = stdev(hourly log returns over a trailing window) * sqrt(24*365),
        computed ONLY from bars observable at cycle-open (available_at gate).
      K   = S0 * (1 − strike_otm)                       # -15% OTM
      d2  = (ln(S0/K) − 0.5 σ² T) / (σ √T), T = tenor_days/365   # zero drift
      p   = Φ(−d2)                                       # P(S_T < K), clamped
      premium = hedge_ratio * NAV_open * (tenor_days/365)
      notional = premium / p
    At expiry (spot at the bar ``tenor`` later — a realized observation, NOT
    lookahead): payoff = notional if S_T < K else 0 (expiry-spot settlement).

LOOKAHEAD SAFETY (BACK-03/BACK-06 — headline audit claim):
  Every decision at the cycle-open bar uses ONLY bars whose ``available_at`` is
  ≤ the decision time at that bar. The realized-vol estimate is windowed on
  ``available_at``; settlement reads the realized expiry-bar spot, which is an
  observation made at expiry, not a look into the future from cycle open. The
  input frame is treated READ-ONLY (never mutated) so the OOS-purity property
  test holds.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- #
# Documented model constants (see backtest-assumptions.md → Strategy Sim Model)
# --------------------------------------------------------------------------- #

# PLP_APY — conservative constant PLP yield assumption. Predict's PLP vaults
# market double-digit APYs; we deliberately pick a modest 8% so the headline
# number is defensible rather than promotional. Parameterized for v2 dynamic
# policies (STRAT-V2-01). This is the single biggest assumption in the model
# and is called out explicitly in the ledger.
PLP_APY: float = 0.08

# PLP_LVR_COEFF — Loss-Versus-Rebalancing coefficient (Milionis, Moallemi &
# Roughgarden 2022). PLP liquidity providers carry an inventory / adverse-
# selection cost that scales with realized variance; per bar the PLP sleeve
# loses PLP_LVR_COEFF * (log return)^2 * plp_capital. A conservative 0.25 makes
# the annual drag a few percent on BTC's realized variance and — crucially —
# gives the PLP NAV realistic per-bar variance (a pure-yield ramp would have an
# unrealistically high Sharpe). Parameterized for v2 calibration against live
# PLP pool P&L.
PLP_LVR_COEFF: float = 0.25

# Bars per year for the per-bar PLP accrual. BTC trades 24/7 → 24*365 = 8760
# (matches walk_forward.BARS_PER_YEAR / RESEARCH.md A9).
_BARS_PER_YEAR: int = 24 * 365

# Default rolling-hedge geometry, mirroring shared/strategy.toml (codegen'd into
# strategy_constants). Kept as call defaults so callers may sweep them, but the
# production values come from the locked policy.
_DEFAULT_TENOR_DAYS: int = 14  # TENOR_SECONDS = 1_209_600 = 14 * 86400
_DEFAULT_STRIKE_OTM: float = 0.15  # STRIKE_OTM_BPS = 1500 = -15%
_DEFAULT_VOL_WINDOW_BARS: int = 720  # 30 days * 24h trailing realized-vol window

# Minimum trailing bars required to form a vol estimate at the very first cycle
# (when < vol_window_bars of history exists). Two days of hourly data.
_MIN_VOL_BARS: int = 48

# Numerical guards.
_P_FLOOR: float = 1e-6
_P_CEIL: float = 1.0 - 1e-6


def _phi(x: float) -> float:
    """Standard-normal CDF via erf (float-domain; the simulation layer is not
    parity-bound, so we use math.erf rather than the integer on-chain phi)."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _annualized_realized_vol(log_returns: np.ndarray) -> float:
    """Annualize the stdev of hourly log returns.

    σ_hourly = std(log_returns, ddof=1); σ_ann = σ_hourly * sqrt(24*365).
    Returns 0.0 when fewer than 2 returns are available (caller guards σ>0).
    """
    if log_returns.size < 2:
        return 0.0
    sigma_hourly = float(np.std(log_returns, ddof=1))
    return sigma_hourly * math.sqrt(_BARS_PER_YEAR)


def binary_put_price(s0: float, strike_otm: float, sigma_ann: float, tenor_days: int) -> float:
    """Zero-drift Black–Scholes digital (binary) PUT price = P(S_T < K).

    K = S0 * (1 − strike_otm); T = tenor_days / 365; risk-neutral with ZERO
    drift (documented assumption — we do not impose a BTC drift on the hedge
    leg). p = Φ(−d2), d2 = (ln(S0/K) − 0.5 σ² T) / (σ √T). Clamped to
    [1e-6, 1−1e-6] so notional = premium/p never blows up or divides by zero.

    Degenerate inputs (σ ≤ 0, T ≤ 0, S0 ≤ 0) return the floor price so the
    caller still sizes a (tiny) finite notional rather than NaN-poisoning NAV.
    """
    if s0 <= 0.0 or sigma_ann <= 0.0 or tenor_days <= 0 or strike_otm <= 0.0:
        return _P_FLOOR
    strike = s0 * (1.0 - strike_otm)
    t_years = tenor_days / 365.0
    vol_sqrt_t = sigma_ann * math.sqrt(t_years)
    if vol_sqrt_t <= 0.0:
        return _P_FLOOR
    d2 = (math.log(s0 / strike) - 0.5 * sigma_ann * sigma_ann * t_years) / vol_sqrt_t
    p = _phi(-d2)
    return min(max(p, _P_FLOOR), _P_CEIL)


def simulate_strategy(
    market_data: pd.DataFrame,
    hedge_ratio: float,
    plp_apy: float = PLP_APY,
    tenor_days: int = _DEFAULT_TENOR_DAYS,
    strike_otm: float = _DEFAULT_STRIKE_OTM,
    vol_window_bars: int = _DEFAULT_VOL_WINDOW_BARS,
) -> dict:
    """Simulate the PLP + rolling-hedge policy over ``market_data``.

    The input frame is consumed READ-ONLY (no column is written, no row is
    mutated) so the OOS-purity invariant holds. Decisions at each cycle-open
    bar use only bars observable at that bar's decision time
    (``available_at <= decision_time``); settlement reads the realized spot at
    the expiry bar.

    Args:
        market_data: per-bar OHLCV frame with at least ``close`` and, for the
            lookahead gate, ``ts_ms`` + ``available_at``. Sorted ascending by
            ts_ms (the data_ingest contract guarantees this).
        hedge_ratio: fraction of capital allocated to the hedge program's
            ANNUAL insurance budget (also drives the PLP sleeve = 1 − ratio).
        plp_apy: constant PLP yield (see PLP_APY rationale).
        tenor_days: hedge tenor in days (default 14, the locked policy).
        strike_otm: OTM offset as a fraction (default 0.15 = -15%).
        vol_window_bars: trailing realized-vol window in bars (default 720 = 30d).

    Returns:
        dict with keys:
          per_bar_nav (pd.Series[float]): NAV per bar, starting at 1.0.
          equity_curve (pd.Series[float]): alias of per_bar_nav (normalised to 1.0).
          total_return (float): final NAV − 1.0.
          attribution (dict): cumulative + per-cycle decomposition:
              plp_yield (float, ≥0), hedge_cost (float, ≥0, = Σ premium),
              hedge_payoff (float, ≥0, = Σ payoff),
              total_return (float, = plp_yield − hedge_cost + hedge_payoff),
              cycles (pd.DataFrame): one row per cycle.
          realized_vol_series (pd.Series[float]): σ_ann per cycle-open bar.
          n_cycles (int), n_payoffs (int).
    """
    n = len(market_data)
    if n == 0:
        empty = pd.Series([], dtype="float64")
        return {
            "per_bar_nav": empty,
            "equity_curve": empty,
            "total_return": 0.0,
            "attribution": _empty_attribution(),
            "realized_vol_series": pd.Series([], dtype="float64"),
            "n_cycles": 0,
            "n_payoffs": 0,
        }

    # Pull raw numpy arrays once (read-only views into the frame's columns).
    close = np.asarray(market_data["close"].to_numpy(), dtype=np.float64)
    has_gate = "ts_ms" in market_data.columns and "available_at" in market_data.columns
    if has_gate:
        ts_ms = np.asarray(market_data["ts_ms"].to_numpy(), dtype=np.int64)
        available_at = np.asarray(market_data["available_at"].to_numpy(), dtype=np.int64)
    else:
        # Synthetic frames without the gate columns fall back to index-window
        # vol (still strictly trailing — never reads forward of the cycle open).
        ts_ms = np.arange(n, dtype=np.int64)
        available_at = ts_ms  # no observation lag modelled

    # Precompute hourly log returns for the trailing-vol windows. Element i is
    # the return realized OVER bar i (log close_i / close_{i-1}); it becomes
    # observable when bar i's data is available (available_at[i]).
    log_ret = np.empty(n, dtype=np.float64)
    log_ret[0] = 0.0
    if n > 1:
        with np.errstate(divide="ignore", invalid="ignore"):
            log_ret[1:] = np.log(close[1:] / close[:-1])
        log_ret[~np.isfinite(log_ret)] = 0.0

    # Bars per hedge cycle.
    bars_per_cycle = max(int(round(tenor_days * 24)), 1)

    # ---- NAV recursion -------------------------------------------------- #
    plp_fraction = 1.0 - hedge_ratio
    # Per-bar PLP growth factor applied to the PLP sleeve's notional.
    plp_bar_factor = (1.0 + plp_apy) ** (1.0 / _BARS_PER_YEAR) - 1.0

    nav = 1.0
    per_bar_nav = np.empty(n, dtype=np.float64)

    # Open-hedge ledger: maps expiry bar index -> (strike_price, notional).
    open_hedges: dict[int, tuple[float, float]] = {}

    cum_plp_yield = 0.0
    cum_plp_lvr = 0.0
    cum_hedge_cost = 0.0
    cum_hedge_payoff = 0.0
    cycle_rows: list[dict] = []
    realized_vols: list[dict] = []
    n_payoffs = 0

    for i in range(n):
        # 1) Settlement of any hedge expiring at THIS bar (realized observation).
        if i in open_hedges:
            strike_price, notional = open_hedges.pop(i)
            spot_at_expiry = close[i]
            if spot_at_expiry < strike_price:
                payoff = notional
                nav += payoff
                cum_hedge_payoff += payoff
                n_payoffs += 1
                # Annotate the originating cycle row with its realized payoff.
                for row in reversed(cycle_rows):
                    if row["expiry_idx"] == i and row["payoff"] == 0.0:
                        row["payoff"] = payoff
                        row["settled"] = True
                        row["spot_at_expiry"] = spot_at_expiry
                        break
            else:
                for row in reversed(cycle_rows):
                    if row["expiry_idx"] == i and not row["settled"]:
                        row["settled"] = True
                        row["spot_at_expiry"] = spot_at_expiry
                        break

        # 2) PLP sleeve P&L for this bar: yield accrual NET of the LVR inventory
        #    drag. Both scale with the PLP notional (plp_fraction * nav), which
        #    compounds with the whole book. The LVR drag uses THIS bar's
        #    realized squared log-return — an observation of the bar that has
        #    just closed, not a forward look. plp_yield is tracked GROSS (the
        #    positive yield column) and the LVR drag is netted into NAV and
        #    accumulated separately so attribution stays additive.
        plp_capital = plp_fraction * nav
        plp_increment = plp_capital * plp_bar_factor
        lvr_drag = PLP_LVR_COEFF * (log_ret[i] * log_ret[i]) * plp_capital
        nav += plp_increment - lvr_drag
        cum_plp_yield += plp_increment
        cum_plp_lvr += lvr_drag

        # 3) Cycle open: at bar 0 and every bars_per_cycle thereafter, buy a
        #    fresh OTM binary put using ONLY data observable at this bar.
        if i % bars_per_cycle == 0:
            decision_time = available_at[i]
            n_usable = _usable_trailing_count(
                available_at, i, decision_time, vol_window_bars
            )
            sigma_ann = _trailing_vol(
                log_ret, available_at, i, decision_time, vol_window_bars
            )
            s0 = close[i]
            # WARM-UP GUARD: a cycle whose trailing window has fewer than the
            # minimum bars (or a zero/degenerate σ) cannot be priced credibly.
            # Rather than divide premium by a floored p (which would size an
            # absurd notional and turn the first cycle into a lottery ticket),
            # we SKIP the hedge for that cycle — the PLP sleeve still runs, but
            # no premium is spent and no notional is opened. This is the
            # documented warm-up: the rolling-hedge program starts only once a
            # credible realized-vol estimate exists.
            warmup_skip = (n_usable < _MIN_VOL_BARS) or (sigma_ann <= 0.0)
            if warmup_skip:
                p = float("nan")
                premium = 0.0
                notional = 0.0
                strike_price = s0 * (1.0 - strike_otm)
                expiry_idx = i + bars_per_cycle
            else:
                p = binary_put_price(s0, strike_otm, sigma_ann, tenor_days)
                # COVERAGE-BASED SIZING (insurance economics, NOT fixed-premium
                # binary). target_coverage = hedge_ratio * NAV is the payout we
                # want if the -15% strike breaches — i.e. the hedge covers a
                # hedge_ratio slice of the book against the tail. Its fair
                # premium is p * coverage. To keep the program within the
                # sustainable insurance budget, premium is CAPPED at
                # budget = hedge_ratio * NAV * (tenor_days/365); when the fair
                # premium exceeds the budget (high-vol regimes), we buy LESS
                # coverage (notional = budget / p) rather than overspending.
                # This bounds the payout (no 1/p jackpot as p->0) and makes the
                # premium vary correctly with vol — see backtest-assumptions.md.
                target_coverage = hedge_ratio * nav
                budget = hedge_ratio * nav * (tenor_days / 365.0)
                fair_premium = p * target_coverage
                if fair_premium <= budget:
                    notional = target_coverage
                    premium = fair_premium
                else:
                    premium = budget
                    notional = budget / p if p > 0.0 else 0.0
                strike_price = s0 * (1.0 - strike_otm)
                nav -= premium
                cum_hedge_cost += premium
                expiry_idx = i + bars_per_cycle
                if expiry_idx < n:
                    open_hedges[expiry_idx] = (strike_price, notional)

            realized_vols.append({"open_idx": i, "ts_ms": int(ts_ms[i]), "sigma_ann": sigma_ann})
            cycle_rows.append(
                {
                    "cycle": len(cycle_rows),
                    "open_idx": i,
                    "expiry_idx": expiry_idx,
                    "ts_ms": int(ts_ms[i]),
                    "spot_open": s0,
                    "strike": strike_price,
                    "sigma_ann": sigma_ann,
                    "binary_price": p,
                    "premium": premium,
                    "notional": notional,
                    "payoff": 0.0,
                    "spot_at_expiry": float("nan"),
                    # last partial cycle never settles in-window; warm-up skips
                    # have no open position so they are "settled" (inert).
                    "settled": (expiry_idx >= n) or warmup_skip,
                    "warmup_skip": warmup_skip,
                }
            )

        per_bar_nav[i] = nav

    nav_series = pd.Series(per_bar_nav, dtype="float64")
    total_return = float(nav_series.iloc[-1] - 1.0)

    cycles_df = pd.DataFrame(cycle_rows)
    attribution = {
        "plp_yield": cum_plp_yield,
        "plp_lvr": cum_plp_lvr,
        "hedge_cost": cum_hedge_cost,
        "hedge_payoff": cum_hedge_payoff,
        # Identity: total_return == plp_yield − plp_lvr − hedge_cost + hedge_payoff.
        # The NAV recursion adds plp_increment, subtracts lvr_drag, subtracts
        # premium, and adds payoff — so the four cumulative terms reconstruct
        # the total return exactly (asserted in test_strategy_sim).
        "total_return": cum_plp_yield - cum_plp_lvr - cum_hedge_cost + cum_hedge_payoff,
        "cycles": cycles_df,
    }

    return {
        "per_bar_nav": nav_series,
        "equity_curve": nav_series,
        "total_return": total_return,
        "attribution": attribution,
        "realized_vol_series": pd.Series(
            [r["sigma_ann"] for r in realized_vols], dtype="float64"
        ),
        "n_cycles": len(cycle_rows),
        "n_payoffs": n_payoffs,
    }


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _usable_trailing_count(
    available_at: np.ndarray,
    open_idx: int,
    decision_time: int,
    vol_window_bars: int,
) -> int:
    """Count bars in the trailing window that are observable at decision time.

    Mirrors the gate in ``_trailing_vol`` so the caller can decide whether a
    credible vol estimate (≥ _MIN_VOL_BARS) exists before pricing a hedge.
    """
    if open_idx <= 0:
        return 0
    lo = max(0, open_idx - vol_window_bars)
    window_avail = available_at[lo:open_idx]
    return int(np.count_nonzero(window_avail <= decision_time))


def _trailing_vol(
    log_ret: np.ndarray,
    available_at: np.ndarray,
    open_idx: int,
    decision_time: int,
    vol_window_bars: int,
) -> float:
    """Annualized realized vol from bars OBSERVABLE at ``decision_time``.

    Lookahead gate: only returns whose bar became observable strictly before
    the cycle-open decision (``available_at[j] <= decision_time`` AND
    ``available_at[j] < available_at[open_idx]``) enter the estimate. Because
    bar i's return becomes observable at available_at[i], and the cycle opens
    at available_at[open_idx], any bar with available_at <= the open bar's own
    availability is fair game — but the open bar's OWN return (which is only
    observable AT its close, i.e. after the open decision) is excluded. We take
    the last ``vol_window_bars`` such returns.
    """
    if open_idx <= 0:
        return 0.0
    # Window of candidate bars strictly before the open bar.
    lo = max(0, open_idx - vol_window_bars)
    window_ret = log_ret[lo:open_idx]
    window_avail = available_at[lo:open_idx]
    # Lookahead gate: each candidate bar must be observable at decision time.
    mask = window_avail <= decision_time
    usable = window_ret[mask]
    if usable.size < 1:
        return 0.0
    # If we have fewer than the minimum, still estimate but the caller's
    # binary_put_price floor protects against a degenerate σ.
    if usable.size < 2:
        return 0.0
    return _annualized_realized_vol(usable)


def _empty_attribution() -> dict:
    return {
        "plp_yield": 0.0,
        "plp_lvr": 0.0,
        "hedge_cost": 0.0,
        "hedge_payoff": 0.0,
        "total_return": 0.0,
        "cycles": pd.DataFrame(
            columns=[
                "cycle",
                "open_idx",
                "expiry_idx",
                "ts_ms",
                "spot_open",
                "strike",
                "sigma_ann",
                "binary_price",
                "premium",
                "notional",
                "payoff",
                "spot_at_expiry",
                "settled",
                "warmup_skip",
            ]
        ),
    }


def unhedged_max_drawdown_bps(market_data: pd.DataFrame) -> int:
    """Max drawdown (bps, negative) of buy-and-hold BTC over the window.

    Comparison baseline for the report: the hedge should reduce drawdown vs
    simply holding spot BTC. Uses the ``close`` series normalised to 1.0.
    """
    if market_data is None or len(market_data) < 2 or "close" not in market_data.columns:
        return 0
    close = np.asarray(market_data["close"].to_numpy(), dtype=np.float64)
    close = close[np.isfinite(close)]
    if close.size < 2 or (close <= 0).any():
        return 0
    running_max = np.maximum.accumulate(close)
    drawdown = (close - running_max) / running_max
    return int(float(drawdown.min()) * 10_000)
