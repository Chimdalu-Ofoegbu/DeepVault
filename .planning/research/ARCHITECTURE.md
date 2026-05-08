# Architecture Research

**Domain:** On-chain structured product (PLP+Hedge vault) on Sui DeepBook Predict + Margin, with off-chain risk dashboard and Python backtest harness
**Researched:** 2026-05-09
**Confidence:** MEDIUM-HIGH (DeepBook Margin design HIGH from official docs; Predict mint API surface MEDIUM — protocol still on testnet, internals subject to change per project constraint; SVI math HIGH from Gatheral paper)
**Quality bar:** math correctness > deploy hygiene > demo polish > composability breadth

---

## 1. System Overview

DeepVault is a three-tier system: a Move package on Sui (the trust boundary), an off-chain event-relay + dashboard (read-only consumer of chain state), and a Python backtest harness (offline twin of the on-chain strategy used to validate math before deploy and to produce the institutional report).

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        OFF-CHAIN — DASHBOARD TIER                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  React + Vite SPA                                                    │  │
│  │  • Plotly 3D — live SVI surface                                      │  │
│  │  • Recharts   — vault utilization, token-bucket, exposure panels     │  │
│  │  • What-if simulator (client-side; pure SVI math in TS)              │  │
│  │  • dApp Kit   — wallet, sign/execute PTBs                            │  │
│  └─────────────────────────────────▲────────────────────────────────────┘  │
│                                    │ WebSocket (push)                      │
│  ┌─────────────────────────────────┴────────────────────────────────────┐  │
│  │  Event Relay Service (Node.js)                                       │  │
│  │  • Sui RPC suix_subscribeEvent → OracleSVIUpdated, vault events      │  │
│  │  • Reconnect w/ checkpoint cursor; replay-on-connect for newcomers   │  │
│  │  • Snapshot store (last surface per oracle)                          │  │
│  └─────────────────────────────────▲────────────────────────────────────┘  │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     │ JSON-RPC + WS (Sui fullnode)
┌────────────────────────────────────┼───────────────────────────────────────┐
│                       ON-CHAIN — SUI MOVE TIER                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  deepvault::                          (this package)                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ vault    │ │ supply   │ │ redeem   │ │ rebalance│ │ pause      │  │  │
│  │  │ (state)  │ │          │ │ (queue)  │ │ (hedge)  │ │ (admin cap)│  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                              │  │
│  │  │ share    │ │ svi_view │ │ ltv      │                              │  │
│  │  │ (Coin<S>)│ │ (oracle) │ │ (math)   │                              │  │
│  │  └──────────┘ └──────────┘ └──────────┘                              │  │
│  └────────┬─────────────────────────┬──────────────────────┬────────────┘  │
│           │ reads OracleSVI         │ predict::mint        │ Margin pkg     │
│           ▼                         ▼                      ▼                │
│  ┌──────────────────┐   ┌────────────────────┐  ┌────────────────────────┐ │
│  │ DeepBook Predict │   │ DeepBook Predict   │  │ DeepBook Margin        │ │
│  │ OracleSVI        │   │ PredictManager,    │  │ MarginManager wraps    │ │
│  │ (shared object)  │   │ PLP vault, mint()  │  │ BalanceManager+TradeCap│ │
│  └──────────────────┘   └────────────────────┘  └────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ semantic-equivalence check
┌────────────────────────────────────┴───────────────────────────────────────┐
│                      OFFLINE — PYTHON BACKTEST TIER                        │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐ │
│  │ data ingest │ │ SVI replay   │ │ vault simulator│ │ report exporter  │ │
│  │ (BTC OHLCV  │ │ (per-tick    │ │ (mirrors Move  │ │ (PnL, drawdown,  │ │
│  │  + IV hist) │ │  surface)    │ │  state machine)│ │  hedge cost, LB) │ │
│  └─────────────┘ └──────────────┘ └────────────────┘ └──────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### Trust boundaries

| Boundary | Trust direction |
|---|---|
| dashboard → relay | dashboard trusts relay for liveness only; all canonical state re-derivable from chain |
| relay → fullnode | relay treats fullnode as source of truth; never persists derived state |
| Move package → DeepBook Predict / Margin | external packages are trusted within their published interfaces; defensive checks on every shared-object read |
| backtest → on-chain | backtest is offline and informs deploy; chain never reads backtest output |

---

## 2. Component Responsibilities (on-chain)

| Module | Responsibility | Key types | Caps held |
|---|---|---|---|
| `deepvault::vault` | Shared `Vault<C>` object: AUM ledger, hedge book, pause flag, withdrawal queue head/tail, token-bucket state, oracle whitelist | `Vault<C>`, `HedgeBook`, `WithdrawalQueue`, `TokenBucket` | — |
| `deepvault::share` | Vault share token issuance/burn (`Coin<VAULT_SHARE>` via `TreasuryCap`) | `VAULT_SHARE` (OTW), `TreasuryCap<VAULT_SHARE>` | TreasuryCap stored inside Vault |
| `deepvault::supply` | Entry: deposit collateral C, mint shares pro-rata to NAV | — | reads Vault + Predict PLP |
| `deepvault::redeem` | Entry: enqueue redemption (token-bucket gated); fulfillment pulls PLP back, settles hedges if needed | `RedemptionTicket` (hot potato or owned) | — |
| `deepvault::rebalance` | Hedge purchase via `predict::mint`; sell-back near expiry; SVI-priced sizing using fixed ratio v1 | — | reads OracleSVI |
| `deepvault::svi_view` | Read OracleSVI shared object → extract `(a,b,ρ,m,σ)` per slice → compute total variance `w(k,t)` and binary price | — | — |
| `deepvault::ltv` | LTV math used by Margin liquidator and by redeem path; bounds vault-share value against worst-case Predict outcome | — | — |
| `deepvault::pause` | Emergency pause: halts supply, halts new hedges, allows queued redemptions to drain at reduced rate | `AdminCap` (owned, single key) | AdminCap = pause authority |

### Why these boundaries

- **`vault` holds state, `supply`/`redeem`/`rebalance` are stateless action modules.** The brief lists them as separate entry points; keeping them as distinct modules makes the auditable surface match the brief and makes pause logic a single chokepoint (each entry checks `vault.paused`).
- **`share` is a separate module** because `Coin<VAULT_SHARE>` issuance needs a One-Time Witness, which must be at module init. Quarantining the witness avoids accidental `TreasuryCap` exposure.
- **`svi_view` is read-only** — never holds caps, never writes. This makes it safe to call from `rebalance` and from view functions used by indexers/dashboard.
- **`ltv` is pure math** — same module reused on-chain (rebalance gating, redeem haircut) and ported line-for-line into Python (backtest twin). Single source of truth for the LTV formula.
- **`pause` owns AdminCap.** No other module mints AdminCap. AdminCap is intentionally not transferable in v1 (no `key, store` — only `key`) to bound blast radius; multisig wrapper is post-submission.

---

## 3. Tokenized Vault Share — design

The vault share is a **fungible `Coin<VAULT_SHARE>`** issued via `TreasuryCap` held inside the shared `Vault` object. This is the standard Sui pattern and is the only design that makes the share usable as Margin collateral without bespoke wrapping.

### Issuance path

```
supply(vault: &mut Vault<C>, deposit: Coin<C>, predict: &mut PLPVault, ctx)
  ├─ vault.assert_not_paused()
  ├─ nav = vault.compute_nav(predict, oracle)        // C-denominated
  ├─ shares_to_mint = deposit.value() * total_shares / nav   (or = deposit on first deposit)
  ├─ predict_plp_supply(predict, deposit)            // PLP shares accrue inside vault.plp_balance
  ├─ coin::mint(&mut vault.share_treasury, shares_to_mint, ctx)
  └─ return Coin<VAULT_SHARE>
```

Two invariants enforced inside `supply`:
1. Pre/post NAV ratio per-share is non-decreasing (modulo hedge cost, which is bounded).
2. `total_shares * 1 ≤ NAV` — never mint a share that already represents a loss.

### Redemption path (queued + token-bucketed)

```
redeem_request(vault, shares: Coin<VAULT_SHARE>, ctx) → RedemptionTicket
  ├─ vault.queue.enqueue(ticket)
  └─ shares burned on enqueue; tickets carry shares_burned amount

redeem_fulfill(vault, ticket: RedemptionTicket, predict, ctx) → Coin<C>
  ├─ vault.token_bucket.try_consume(ticket.amount)   // reverts if drained this period
  ├─ withdraw PLP from predict, sell back hedges proportionally
  ├─ haircut := ltv::worst_case_haircut(vault, predict)
  ├─ payout := nav_per_share * ticket.amount * (1 - haircut)
  └─ return Coin<C>
```

The token-bucket limiter is a vault-level object: `{capacity, refill_rate, last_refill_ts, available}`. Refill happens lazily on every `redeem_fulfill`. This gives a deterministic, observable rate cap that the dashboard can render directly.

### Use as Margin collateral

DeepBook Margin's `MarginManager` accepts arbitrary collateral coins per its design: collateral is whatever is deposited into the wrapped `BalanceManager`. Because `VAULT_SHARE` is a standard `Coin`, it can be deposited into a `BalanceManager`, then the `MarginManager` wraps that and recognizes it as collateral. **The constraint:** Margin requires a price oracle for any collateral asset. For v1 this means we need a vault-share price feed — practically, this is `nav_per_share` exposed as a view function the relay republishes, or a Pyth/oracle integration if Margin requires its own format.

> **Critical-path risk:** if Margin's accepted-collateral list is whitelisted at the registry level (not arbitrary Coin types), then VAULT_SHARE-as-collateral requires a Margin governance action that won't happen in 39 days. Mitigation: the demo PTB still works — it borrows in C (e.g., dUSDC), supplies to vault, hedges via Predict — without VAULT_SHARE-as-collateral being load-bearing. The "share is collateralizable" property becomes a documentation claim with an integration test against a mock Margin pool, not a live mainnet feature. **Verify whitelist policy on day 1.**

---

## 4. Two-Protocol PTB — atomic flow

The flagship composability moment. One `Transaction` opens leveraged PLP+hedge in a single atomic block.

### PTB shape (TypeScript, dApp Kit)

```ts
const tx = new Transaction();

// 1. Borrow quote asset from Margin
const [borrowed] = tx.moveCall({
  target: `${MARGIN_PKG}::margin_manager::borrow_quote`,
  arguments: [
    tx.object(MARGIN_MANAGER),      // shared, wraps user's BalanceManager + TradeCap
    tx.object(MARGIN_POOL_QUOTE),   // shared MarginPool<C>
    tx.object(MARGIN_REGISTRY),     // shared
    tx.pure.u64(borrowAmount),
    tx.object('0x6'),               // Clock
  ],
  typeArguments: [QUOTE_TYPE],
});

// 2. Deposit own collateral → user's coin already in scope
const userCollat = tx.splitCoins(tx.object(userCoinId), [tx.pure.u64(userCollateral)]);
const totalDeposit = tx.mergeCoins(borrowed, [userCollat]);

// 3. Vault::supply — mints PLP into vault, returns VAULT_SHARE
const shares = tx.moveCall({
  target: `${DEEPVAULT_PKG}::supply::deposit`,
  arguments: [
    tx.object(VAULT),                // shared
    totalDeposit,
    tx.object(PLP_VAULT),            // shared, Predict PLP vault
    tx.object(ORACLE_SVI),           // shared
    tx.object('0x6'),
  ],
  typeArguments: [QUOTE_TYPE],
});

// 4. Vault::rebalance — purchases hedge via predict::mint, scaled to deposit
tx.moveCall({
  target: `${DEEPVAULT_PKG}::rebalance::buy_hedge_for_deposit`,
  arguments: [
    tx.object(VAULT),
    tx.object(PREDICT_MANAGER),      // shared
    tx.object(ORACLE_SVI),
    tx.pure.u64(depositAmount),      // for fixed-ratio sizing
    tx.object('0x6'),
  ],
  typeArguments: [QUOTE_TYPE],
});

// 5. Return VAULT_SHARE to user (or deposit into BalanceManager as collateral)
tx.transferObjects([shares], userAddress);
```

### Capability flow

```
User wallet
   ├─ owns BalanceManager + TradeCap (created upfront in setup tx)
   └─ owns MarginManager handle (wraps BM)

Inside PTB:
   borrow_quote  reads  MarginManager → checks TradeCap inside BM → mints debt shares,
                                       returns Coin<C> "borrowed"
   supply        reads  Vault.share_treasury (TreasuryCap stored in shared Vault),
                 calls  PLP::supply with merged Coin<C>,
                 mints  Coin<VAULT_SHARE>
   rebalance    reads  Vault, OracleSVI, PredictManager;
                 internal hedge_book updates;
                 calls  predict::mint to acquire binary positions
```

Two cap-pattern notes:
- `TradeCap` stays inside the user's `BalanceManager` (one-time issued when BM is created); the PTB never moves it out. Margin's borrow APIs verify cap presence by reference.
- `TreasuryCap<VAULT_SHARE>` lives **inside the shared Vault**. There is no permissionless mint surface — only `supply::deposit` can mint, gated by the vault's NAV invariant.

### Failure atomicity

If `predict::mint` fails (e.g., insufficient liquidity, oracle stale, settlement window closed), the entire PTB reverts. PLP is not supplied, debt is not borrowed, no vault share exists. This is the core property the demo sells.

---

## 5. Liquidation Path

Two distinct paths converge on the same LTV math: Margin-protocol-driven liquidation (when a user posted VAULT_SHARE as collateral) and emergency vault drain (when something is wrong with the vault itself).

### Margin-driven liquidation (collateral = VAULT_SHARE)

Per DeepBook Margin docs, liquidation triggers below ~1.15 risk ratio with target ~1.25. The liquidator:
1. provides repayment coins,
2. open orders cancelled,
3. system calculates max repayable debt,
4. collateral transfers to liquidator + 5% reward,
5. pool receives 3% secondary reward.

For VAULT_SHARE collateral, step 4 hands `Coin<VAULT_SHARE>` to the liquidator. The liquidator then redeems via the vault's standard `redeem_request` → `redeem_fulfill` flow. **The vault redemption queue must not be a bottleneck for liquidators.** Two options:

| Option | Trade-off |
|---|---|
| Liquidator path uses standard token-bucket | Conservative; liquidations stack into the queue and may delay debt repayment, increasing bad-debt risk |
| Liquidator path bypasses bucket via a dedicated lane | Faster repayment; requires distinguishing liquidator address (Margin caller) — adds capability check |

**Recommendation:** v1 ships option A with token-bucket sized so that worst-case liquidation backlog still completes inside Margin's grace window. This is the simplest correct path. Document the LTV math so judges can verify the bucket sizing.

### LTV math (the load-bearing invariant)

For the vault to be safely collateralizable, max LTV must be bounded by the **worst-case payout** of the hedge book against the **worst-case Predict outcome**, not against the fair value.

```
worst_case_nav_per_share =
    plp_value_in_C * worst_case_plp_haircut       // PLP impairment on adverse settlement
  + Σ hedge_i.worst_case_payout                    // binary positions, payoff bounded {0, notional}
  - liabilities
  ÷ total_shares

max_safe_ltv = floor( worst_case_nav_per_share / current_nav_per_share * margin_ltv_cap )
```

Where `margin_ltv_cap` is Margin's own ceiling (e.g., 0.8). The vault publishes `worst_case_nav_per_share` as a view function; Margin (or a price-feed adapter) reads it.

### Emergency vault drain

`AdminCap`-gated `pause()`:
- Halts `supply`.
- Halts new `rebalance` hedge purchases (existing hedges continue to expiry).
- `redeem_request` continues; `redeem_fulfill` drains at reduced bucket rate.
- A separate `emergency_redeem` skips queue but applies a punitive haircut (e.g., `worst_case_haircut * 1.5`) so it's a last-resort path.

---

## 6. Off-Chain Event Relay

### Service shape

A small Node.js process. No DB needed at v1 — in-memory snapshots + reconnect cursor on disk.

```
┌──────────────────────────────────────────────────────────────┐
│ relay.ts                                                     │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ SuiClient.subscribeEvent({                               │ │
│ │   filter: { Package: DEEPVAULT_PKG },                    │ │
│ │   onMessage: dispatchEvent,                              │ │
│ │   onClose: scheduleReconnect,                            │ │
│ │ })                                                       │ │
│ │ SuiClient.subscribeEvent({                               │ │
│ │   filter: { MoveEventType: "...::oracle::OracleSVIUpdated"}│ │
│ │ })                                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ snapshotStore: Map<oracleId, SVISurfaceSnapshot>         │ │
│ │ checkpointCursor: persisted to disk every N seconds      │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ WebSocketServer (ws://) — broadcasts to dashboard        │ │
│ │   on connect → send full snapshot (replay-on-connect)    │ │
│ │   on event   → push delta                                │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Durability + reconnect

- **Reconnect cursor:** persist last seen `eventSeq` per subscription. On reconnect, query missed events via `suix_queryEvents` from cursor, then resume subscription.
- **Replay-on-connect for newcomers:** when a dashboard client opens a WS connection, relay sends the current snapshot (last surface per oracle, vault state, bucket state) before streaming live events. Newcomer never sees an empty UI.
- **Health check:** relay heartbeats every 10s on the WS to dashboard; dashboard reconnects on missed heartbeat.

### Pre-existing risk: deprecation timeline

Per Sui docs, `suix_subscribeEvent` JSON-RPC is scheduled for decommissioning in late July 2026. Submission is 2026-06-16, well before. **Do not migrate to gRPC for the hackathon** — JSON-RPC WS is documented and stable for the submission window. Add a one-line README note that post-submission migration to gRPC is required.

---

## 7. Python Backtest Harness

The most important off-chain component for judge credibility — handbook explicitly requires it, and judges will throw out a backtest with implausible numbers.

### Module layout

```
backtest/
├── data/
│   ├── ingest_btc.py        # OHLCV from Binance/Coinbase via ccxt; stored as parquet
│   ├── ingest_iv.py         # Deribit IV history (Block Scholes is closed; Deribit is the public proxy)
│   └── cache/               # parquet artifacts, never re-downloaded
├── svi/
│   ├── fit.py               # Calibrate SVI per slice, per day; output (a,b,ρ,m,σ) parquet
│   ├── eval.py              # Total variance w(k,t); MIRRORS deepvault::svi_view exactly
│   └── arbfree.py           # Butterfly + calendar checks
├── strategy/
│   ├── vault_state.py       # Python class mirroring on-chain Vault state machine
│   ├── supply.py            # Mirror of supply::deposit
│   ├── redeem.py            # Mirror of redeem flow w/ token-bucket
│   ├── rebalance.py         # Hedge sizing (fixed ratio v1) + sell-back on expiry
│   └── ltv.py               # Same LTV formula as deepvault::ltv
├── sim/
│   ├── replay.py            # Walk-forward loop: at each tick, apply chain semantics
│   ├── pnl.py               # Mark-to-market, realized vs unrealized split
│   └── drawdown.py          # Max DD, time underwater, recovery
├── audit/
│   ├── lookahead.py         # Audit harness: each function declares (reads, writes); no future timestamps
│   └── assumptions.md       # Explicit ledger: gas, slippage, oracle staleness, settlement delay
└── report/
    ├── render.py            # Jinja2 → HTML/PDF; institutional grade
    └── templates/
```

### Semantic alignment with on-chain Move (the critical discipline)

The backtest is only credible if its strategy logic is **bit-for-bit equivalent** to the Move package modulo deterministic differences. Three mechanisms:

1. **Shared math constants file.** `deepvault::constants` (Move) and `backtest/strategy/constants.py` are generated from a single TOML file (`shared/strategy.toml`): hedge ratio, OTM strike width, token-bucket capacity/refill rate, LTV cap, settlement haircut. A pre-commit hook regenerates both.

2. **Golden test vectors.** A set of `(input, expected_output)` tuples for every pure function (`svi::eval_total_variance`, `ltv::worst_case_haircut`, `rebalance::sizing`, `share::shares_to_mint`). Both Move tests and Python tests must pass the same vectors. CI runs both.

3. **State-machine trace replay.** A tiny harness reads a sequence of vault actions (supply, redeem, rebalance) from a JSON file. Move runs them via `sui move test`; Python runs them via `vault_state`. Final NAV-per-share, hedge book, bucket state must match within 1 wei tolerance.

### Lookahead-bias audit

Each strategy function is decorated:

```python
@strategy_fn(reads=["t", "spot[t]", "svi[t]"], writes=["hedge_book"])
def buy_hedge_for_deposit(t, spot, svi, hedge_book): ...
```

The audit harness asserts no read with index `> t`. Manual cross-check on three flagship numbers (final PnL, max drawdown, hedge cost as % AUM) is documented in `audit/assumptions.md`.

---

## 8. Dashboard Architecture

```
src/
├── lib/
│   ├── ws.ts              # WS client with reconnect; exposes RxJS Observable<Event>
│   ├── sui.ts             # dApp Kit — wallet, signAndExecuteTransaction
│   ├── ptb.ts             # Builders for the supply / redeem / rebalance PTBs
│   └── svi.ts             # Pure TS SVI evaluator — same constants as Move + Python
├── components/
│   ├── SurfacePlot.tsx    # Plotly 3D — k × t × w; subscribed to OracleSVIUpdated
│   ├── ArbCheck.tsx       # Butterfly + calendar flags from svi.ts
│   ├── VaultPanel.tsx     # NAV, total shares, hedge book — from vault state events
│   ├── BucketGauge.tsx    # Token-bucket level gauge (Recharts)
│   ├── ExposurePanel.tsx  # Per-oracle, per-strike exposure bars
│   ├── WhatIf.tsx         # ±5σ slider; client-side PnL via svi.ts (no server round-trip)
│   └── ActionPanel.tsx    # Deposit / withdraw / liquidate via ptb.ts + dApp Kit
├── pages/
│   └── App.tsx
└── main.tsx
```

### What-if simulator: client-side, not server-side

The simulator computes PLP PnL under price moves. All inputs (current SVI surface, vault state) are already in the dashboard from WS. Computation is pure SVI evaluation + payoff math — fast in the browser, no relay round-trip. **Implication:** `svi.ts` in the dashboard, `svi/eval.py` in backtest, and `deepvault::svi_view` in Move all share the same constants and same algorithm. Three-way alignment, one source of truth.

### dApp Kit integration

Standard Sui pattern: `<WalletProvider><SuiClientProvider>` at app root, `useSignAndExecuteTransaction` hook in `ActionPanel`. PTB construction in `lib/ptb.ts`. No custom adapters.

---

## 9. Build Order — 39-day solo timeline

Critical-path ordering is governed by the quality bar (math first, deploy hygiene second, polish third) and by the fact that **everything depends on SVI math being right**.

### Phase 1 (days 1-6): Math foundation — cannot start anything else without this

| Day | Item | Why |
|---|---|---|
| 1 | Read OracleSVI shared object, confirm event signature, confirm `predict::mint` testnet ABI | First Monday contract version pin |
| 1-2 | `shared/strategy.toml` + Python+Move constants generator + golden test vector framework | All three tiers depend on this |
| 2-4 | SVI evaluator in Python (`backtest/svi/eval.py`) audited against Gatheral paper | Math correctness root |
| 4-5 | SVI evaluator in Move (`deepvault::svi_view`) — identical golden vectors | Math parity gate |
| 5-6 | SVI evaluator in TS (dashboard `lib/svi.ts`) — identical golden vectors | Three-way parity |

**Gate:** all three implementations pass the same 100+ golden vectors. No further work until this gate is green.

### Phase 2 (days 7-15): Vault Move package + testnet deploy

| Day | Item |
|---|---|
| 7-8 | `deepvault::vault` shared object scaffold, `share` module with TreasuryCap quarantine, `pause` + AdminCap |
| 8-10 | `supply` against testnet PLP (single Predict pool); golden test vectors for shares-to-mint |
| 10-12 | `redeem_request`/`redeem_fulfill`, token-bucket implementation |
| 12-14 | `rebalance::buy_hedge_for_deposit` calling `predict::mint`; sell-back on near-expiry |
| 14-15 | `ltv::worst_case_haircut`; integration test: full supply→hedge→redeem cycle |

**Gate:** end-to-end testnet flow without Margin works. **Monday day 8 + day 15 contract version checks.**

### Phase 3 (days 16-22): Two-protocol PTB + backtest harness (parallel-ish)

These can interleave because they share no critical state:

- **Track A (Move):** Margin integration, the four-step PTB, capability flow tests, liquidation simulation.
- **Track B (Python):** vault state machine port, replay loop, lookahead audit, first 30-day backtest run.

| Day | Item |
|---|---|
| 16-18 | Margin BalanceManager + TradeCap setup; investigate VAULT_SHARE-as-collateral whitelist |
| 18-20 | Two-protocol PTB end-to-end on testnet; capability-flow tests |
| 16-19 | Python `vault_state` mirror; trace-replay parity test against Move |
| 19-22 | 30+ days backtest across normal + trending + stress; lookahead audit; manual cross-check |

**Gate:** Mainnet readiness pre-flight: full PTB works; backtest report draft exists; `worst_case_haircut` documented.

### Phase 4 (days 23-30): Dashboard + relay

| Day | Item |
|---|---|
| 23-24 | Event relay service, WS server, snapshot store, reconnect cursor |
| 24-26 | Plotly 3D surface plot, live SVI streaming end-to-end |
| 26-27 | VaultPanel, BucketGauge, ExposurePanel, ArbCheck |
| 27-28 | What-if simulator (client-side) |
| 28-30 | dApp Kit integration; deposit/withdraw flows from dashboard |

**Gate:** dashboard fully functional against testnet vault with live SVI surface.

### Phase 5 (days 31-36): Mainnet redeploy + hardening

| Day | Item |
|---|---|
| 31 | Mainnet contract version pin; swap testnet pkg IDs → mainnet (USDsui → dUSDC, Predict mainnet IDs, Margin mainnet config) |
| 32 | Mainnet deploy of `deepvault` package; init script (create Vault, AdminCap to deployer) |
| 33 | Mainnet smoke test: supply → rebalance → redeem with $50 of real funds |
| 34 | Backtest report render; institutional-grade PDF/HTML |
| 35-36 | Demo video script + record + edit; show single PTB opening Margin + Predict + vault share atomically |

### Phase 6 (days 37-39): Submission slack

| Day | Item |
|---|---|
| 37 | README, architecture diagram, strategy whitepaper |
| 38 | Final mainnet sanity check; redeploy if breaking change appeared in weekly sweep |
| 39 | Submit |

### Cut-latest order (if behind schedule)

In reverse priority — drop these first:

1. **What-if simulator polish** (keep core, drop ±5σ animation)
2. **Per-oracle exposure panel** (vault panel covers the overall exposure number)
3. **Arbitrage-free checker UI** (keep math in `svi.ts`, hide UI; mention in README)
4. **Sell-back on near-expiry** (let hedges expire; document as v1.1 feature)
5. **VAULT_SHARE-as-Margin-collateral live demo** (keep test vectors + documentation; demo PTB borrows in C only)

**Never cut:**
- SVI three-way parity gate (math correctness > everything)
- 30-day backtest with lookahead audit (handbook hard requirement)
- Mainnet redeploy (key decision in PROJECT.md)
- Two-protocol PTB demo video (foundation-blessed composability story)

---

## 10. Architectural Patterns

### Pattern 1: Shared math source-of-truth (one TOML, three implementations)

**What:** A single `shared/strategy.toml` file generates Move constants, Python constants, and TS constants. A pre-commit hook regenerates each on change. Golden test vectors run on all three.

**When:** Any project where on-chain logic must be replicated off-chain (backtest, simulator, dashboard).

**Trade-offs:** + Eliminates entire class of "the Python sim says X but the contract does Y" bugs that destroy backtest credibility. − Cost of the codegen tooling (~half a day).

### Pattern 2: TreasuryCap quarantine inside shared object

**What:** `TreasuryCap<VAULT_SHARE>` is stored as a field on the shared `Vault`. No external mint surface; `supply::deposit` is the only path that can call `coin::mint`.

**When:** Vault share tokens, LP tokens, anything whose issuance must be controlled by an invariant.

**Trade-offs:** + Minting policy is on-chain auditable. − Requires care: the cap must never be exposed by reference outside the module.

### Pattern 3: Hot-potato redemption ticket (alternative considered, rejected for v1)

**What:** `redeem_request` returns a non-droppable `RedemptionTicket` that must be passed to `redeem_fulfill` in the same PTB.

**When:** When you want redemption to be a single atomic UX flow, not a queued asynchronous one.

**Trade-offs:** Rejected for v1 because **the brief explicitly requires a withdrawal queue with token-bucket limiter** — that's incompatible with same-PTB hot-potato. Use owned-object ticket instead (queueable, fulfillable later).

### Pattern 4: Three-way semantic parity via golden vectors

**What:** Every pure function has a vector file `(inputs, expected_output)`. Move tests, Python tests, and TS tests all consume the same file. CI fails if any drift.

**When:** Critical math that lives in multiple runtimes.

**Trade-offs:** + Detects drift the moment it happens. − Requires upfront discipline to write vectors before implementations.

### Pattern 5: Replay-on-connect for the dashboard relay

**What:** When a WS client connects, the relay sends a full snapshot before streaming deltas. New users never see an empty UI; reconnecting users get instant state.

**When:** Any push-based dashboard where state is high-cardinality but not high-velocity.

**Trade-offs:** + Vastly better UX. − Requires the relay to maintain a snapshot store (modest memory cost).

---

## 11. Anti-Patterns

### Anti-Pattern 1: Storing SVI parameters in the vault and re-fetching from oracle "for safety"

**What people do:** Cache oracle SVI parameters inside the vault, refresh periodically.

**Why wrong:** Two sources of truth diverge under network reorgs or oracle updates. Hedge sizing and pricing must use the **same** SVI snapshot, read once per PTB.

**Do instead:** Read OracleSVI by reference inside the PTB; pass the read result by value to all downstream calls in the same transaction.

### Anti-Pattern 2: Floating-point math anywhere on-chain

**What people do:** Approximate SVI with f64-style logic via clever scaling.

**Why wrong:** Move has no floats. Ad-hoc fixed-point arithmetic introduces precision bugs that golden vectors will catch but only if the golden vectors were generated correctly.

**Do instead:** Standard 18-decimal fixed-point (or 27 for variance). All three implementations (Move, Python, TS) use the same fixed-point library or shim. Document the chosen scale in `strategy.toml`.

### Anti-Pattern 3: Permissioned hedge rebalancer (a keeper bot the team owns)

**What people do:** Off-chain bot triggers `rebalance` on a schedule.

**Why wrong:** Brief explicitly out-of-scope. Worse for judges — looks like the on-chain logic is incomplete and a centralized actor fills the gap.

**Do instead:** `rebalance` is permissionless and incentivized — anyone can call it; any deviation from target hedge ratio is corrected and a small reward goes to the caller. (For v1, even simpler: rebalance is a manual user action shown in the dashboard.)

### Anti-Pattern 4: Backtest run on the same dataset used for SVI calibration

**What people do:** Use Q1-Q3 2025 data to calibrate hedge ratio, then "backtest" on Q1-Q3 2025 data showing 80% APY.

**Why wrong:** Lookahead bias. Judges will throw out the result. Handbook explicitly warns about this.

**Do instead:** Calibrate on one window (e.g., 2024), run walk-forward backtest on a strictly later window (e.g., 2025-2026). Document the split in `audit/assumptions.md`.

### Anti-Pattern 5: Optimistic Margin collateral assumption

**What people do:** Assume DeepBook Margin accepts arbitrary `Coin<T>` as collateral, build the demo around VAULT_SHARE-as-collateral, discover on day 35 that Margin uses a whitelist.

**Why wrong:** Late-discovery integration risk; potentially un-fixable in 39 days.

**Do instead:** Day 1 — verify Margin's collateral acceptance mechanism (read the `MarginRegistry` source). If whitelisted, the demo PTB still works without VAULT_SHARE-as-collateral; document the integration as "v1.1 once whitelist proposal is accepted."

---

## 12. Mainnet Redeploy Hygiene

Discrete, ordered, scripted. Not a manual click-through.

### Differences testnet → mainnet

| Surface | Testnet | Mainnet | Action |
|---|---|---|---|
| Quote asset | USDsui | dUSDC (per ecosystem standard) | Type parameter swap; redeploy |
| Predict package | testnet pkg ID | mainnet pkg ID | Update `Move.toml` named addresses |
| Margin package | testnet pkg ID | mainnet pkg ID | Update `Move.toml` |
| OracleSVI shared object IDs | testnet IDs | mainnet IDs | Update deploy config |
| `predict-server` indexer URL | testnet endpoint | mainnet endpoint | Update relay config |
| Initial hedge ratio | (lab values) | conservative production value | Update `strategy.toml` |

### Pre-deploy checklist (run from script)

```bash
./scripts/preflight.sh
  ├─ checks Move.toml addresses match mainnet config
  ├─ runs golden vectors against fresh mainnet RPC
  ├─ pulls current Predict mainnet pkg version, asserts == pinned version
  ├─ pulls current Margin mainnet pkg version, asserts == pinned version
  ├─ runs full Move test suite
  └─ runs Python parity tests
```

### Deploy script

```bash
./scripts/deploy_mainnet.sh
  ├─ sui client publish --gas-budget X
  ├─ capture published pkg ID; write to deploy/mainnet.toml
  ├─ create Vault (PTB: deepvault::vault::create<DUSDC>)
  ├─ capture Vault ID; transfer AdminCap to deployer
  └─ verify Vault, AdminCap, share TreasuryCap exist on-chain
```

### Post-deploy smoke test

A scripted PTB that runs the full critical path with $50 of real funds:
1. Setup BalanceManager + TradeCap (one-time).
2. Run the two-protocol PTB: borrow → supply → hedge.
3. Wait one block.
4. Run `redeem_request` → wait for bucket → `redeem_fulfill`.
5. Assert: NAV-per-share within tolerance of pre-test value (allow for hedge cost).

This script runs **before the demo video is recorded**, not after submission. If it fails, fix and redeploy. Budget for one redeploy in phase 5.

### Demo video discipline

Record against the **mainnet** vault, not testnet. The submission is mainnet; testnet artifacts are confusing. Record after smoke test passes; re-record only if a Monday contract sweep shows a breaking change before submission.

---

## 13. Integration Points

### External (on-chain)

| Service | Integration | Notes / risks |
|---|---|---|
| DeepBook Predict — `PredictManager`, `OracleSVI`, `predict::mint`, `PLP vault` | Direct Move calls | Smart contracts may change before mainnet (project constraint); Monday version sweeps |
| DeepBook Margin — `MarginManager`, `MarginPool`, `MarginRegistry`, `BalanceManager`, `TradeCap` | Direct Move calls | Verify collateral whitelist policy day 1 |
| Sui Clock (`0x6`) | Time source | Used in token bucket refill, settlement windows |

### External (off-chain)

| Service | Integration | Notes |
|---|---|---|
| Sui fullnode JSON-RPC + WS | `suix_subscribeEvent`, `suix_queryEvents` for replay | Deprecation post-July-2026 — not our problem for submission |
| `predict-server.testnet/mainnet.mystenlabs.com` | Indexer queries for historical surface data | Backup data source; not load-bearing for live UI |
| Binance/Coinbase via ccxt | BTC OHLCV historical | Backtest only |
| Deribit | BTC IV history (Block Scholes is closed) | Backtest only |

### Internal boundaries

| Boundary | Comm | Notes |
|---|---|---|
| dashboard ↔ relay | WebSocket (server push) | Replay-on-connect for newcomers |
| relay ↔ fullnode | JSON-RPC + WS | Reconnect with persisted cursor |
| dashboard ↔ wallet | dApp Kit (browser) | Standard pattern |
| Move package ↔ DeepBook Predict | Move call | One source of truth: read OracleSVI once per PTB |
| Move package ↔ DeepBook Margin | Move call | Cap-flow respected; never extract TradeCap from BalanceManager |
| Move tests ↔ Python tests ↔ TS tests | Shared golden vectors via filesystem | Generated from `shared/strategy.toml` |
| Backtest ↔ Move | Trace-replay JSON | State-machine parity gate |

---

## 14. Scaling Considerations

| Scale | Adjustments |
|---|---|
| Hackathon demo (1-50 users) | Single relay process, in-memory snapshots, JSON-RPC WS — fine |
| Post-submission small mainnet (100-1k users) | Add Postgres for event archive; relay becomes stateless behind a CDN; gRPC migration |
| Production (10k+ users) | Sharded relays per oracle; archival snapshots; multi-sig AdminCap; permissionless keeper for `rebalance` |

For the 39-day window: **do not invest in any of phase 2/3 scaling**. The simplest correct path is the right path.

### What breaks first

1. **Relay reconnect storm** if many clients reconnect simultaneously after a fullnode restart. Mitigation: jittered reconnect with exponential backoff in dashboard; relay tolerates many connections.
2. **Token-bucket starvation** during a coordinated redemption event. Mitigation: bucket size tuned via backtest stress scenarios; emergency_redeem haircut path exists.
3. **Oracle staleness** if Block Scholes feed lags. Mitigation: vault refuses `supply` and `rebalance` if `clock - oracle.last_update > MAX_STALENESS`.

---

## Sources

- [DeepBook Predict — Sui Documentation](https://docs.sui.io/onchain-finance/deepbook-predict/) — HIGH confidence on Predict overview, OracleSVI, PLP, mint scope
- [DeepBook Margin Design — Sui Documentation](https://docs.sui.io/standards/deepbook-margin/design) — HIGH confidence on MarginManager wrapping BalanceManager, liquidation thresholds, PTB object flow
- [Margin Manager SDK — Sui Documentation](https://docs.sui.io/standards/deepbook-margin-sdk/margin-manager) — HIGH confidence on borrow/repay flow
- [BalanceManager SDK — Sui Documentation](https://docs.sui.io/standards/deepbookv3-sdk/balance-manager) — HIGH confidence on TradeCap pattern
- [Introducing DeepBook Predict — Sui Blog](https://blog.sui.io/introducing-deepbook-predict/) — MEDIUM confidence on Block Scholes oracle, third-primitive framing
- [Programmable Transaction Blocks — Sui Documentation](https://docs.sui.io/concepts/transactions/prog-txn-blocks) — HIGH confidence on PTB atomicity and capability flow
- [Building PTBs — Sui Documentation](https://docs.sui.io/guides/developer/sui-101/building-ptb) — HIGH confidence on PTB construction
- [Using Events — Sui Documentation](https://docs.sui.io/guides/developer/sui-101/using-events) — HIGH confidence on event subscription
- [Sui API Reference](https://docs.sui.io/sui-api-ref) — HIGH confidence on `suix_subscribeEvent` and gRPC migration timeline
- [Gatheral & Jacquier — Arbitrage-free SVI volatility surfaces](https://arxiv.org/pdf/1204.0646) — HIGH confidence on SVI math, butterfly/calendar arbitrage conditions
- [Gatheral SVI parameterization (Baruch lecture)](https://mfe.baruch.cuny.edu/wp-content/uploads/2015/06/VW3.pdf) — HIGH confidence on raw SVI parametrization

### Confidence flags

- **MEDIUM** on exact `predict::mint` ABI — protocol still on testnet, Mysten warns interfaces may change. Mitigation: pin version every Monday; ABI-fetch test in CI.
- **MEDIUM** on VAULT_SHARE-as-Margin-collateral feasibility — depends on whitelist policy not yet verified. Day-1 verification task.
- **HIGH** on the rest.

---
*Architecture research for: DeepVault PLP+Hedge structured product on DeepBook Predict + Margin*
*Researched: 2026-05-09*
