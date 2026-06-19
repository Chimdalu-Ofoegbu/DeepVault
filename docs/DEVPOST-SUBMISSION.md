# DeepVault

> **Paste-ready Devpost / Sui Overflow 2026 submission draft (DEPLOY-10).**
> Every field below is filled. **One token remains a deliberate placeholder** the
> filer must replace before submitting: `<DEMO-VIDEO-URL-PLACEHOLDER>` (the share
> URL from the demo recording, `docs/DEMO-SCRIPT.md`). The repository URL is
> filled (`https://github.com/Chimdalu-Ofoegbu/DeepVault`). **Do not invent the video URL.**
>
> **Honesty bar (LD-1):** every number here is window-labeled and traces to a
> committed artifact via `.planning/phases/06-submission-package/NUMBERS-CANONICAL.md`.
> Full-window claims cite `.planning/backtest-assumptions.md`; out-of-sample (OOS)
> claims cite `backtest/reports/full-365d.json`. **Never collapse a full-window
> return and an OOS Sharpe into one unlabeled claim. No third-party audit has
> happened.**

---

# Title

**DeepVault — PLP yield minus crash insurance, as one composable Sui deposit.**

A composable structured-product vault on Sui DeepBook Predict that fuses PLP
(Predict Liquidity Provision) yield with automated binary tail-risk hedging,
paired with an institutional-grade PLP Risk Studio dashboard streaming a live SVI
volatility surface.

## Tagline

**PLP yield minus crash insurance, as one composable Sui deposit** — the third
primitive in the DeepBook stack (DeepBook → DeepBook Predict → DeepVault).

---

## Inspiration

DeepBook Predict opened a binary-options venue on Sui: liquidity providers (LPs)
supply the PLP pool and earn yield, but they silently carry the venue's tail
risk — when the underlying gaps down hard, PLP LPs are the ones who pay out the
winning puts. That is real, unhedged crash exposure wearing a "yield" label.

We wanted to prove two things at once:

1. **A genuinely useful product:** package PLP yield *and* the crash insurance
   that offsets its tail risk into a single deposit, so an LP gets "PLP yield
   minus crash insurance" without manually running an options desk.
2. **Sui composability at the protocol layer:** show that a vault can route a
   deposit across DeepBook Margin + DeepBook Predict + its own hedge book inside
   one atomic Programmable Transaction Block (PTB), using the Move object model,
   `BalanceManager` + `TradeCap`, and shared objects as load-bearing primitives —
   not a demo gimmick.

DeepVault is our answer: a working testnet vault plus an auditable risk
dashboard, built for the Sui Overflow 2026 DeepBook specialized track.

---

## What it does

**One deposit, two legs.** You deposit a quote asset (DUSDC on testnet). The
vault:

- routes **~90%** to DeepBook Predict's **PLP pool** for liquidity-provision
  yield, and
- spends **~10%** (`allocation_bps = 1000`, frozen v1 policy) to buy a **binary
  tail hedge** — a deep-OTM digital put struck **15% below spot**
  (`strike_otm_bps = 1500`) with a **14-day tenor** — priced off a live SVI
  volatility surface (Gatheral & Jacquier 2014). Hedges auto-roll when they
  approach expiry.

When the underlying tanks more than ~15% within the tenor, the binaries pay and
cushion the drawdown; in calm markets you collect PLP fees minus a small,
honest hedge premium. (Note: the backtest's yield leg assumes a **conservative
8% PLP APY** — a defensible placeholder, *not* a measured on-chain Predict
yield; see `docs/WHITEPAPER.md` §6 Model Assumptions.)

**Safe redemption.** Withdrawals go through a per-user **token-bucket** rate
limiter plus a **1-hour cooldown** (`redeem_request` → wait → `redeem_fulfill`),
so a single actor can't drain the vault and NAV stays consistent. An
ERC-4626-style inflation defense (virtual shares + a burned seed deposit) blocks
the classic first-depositor share-price attack.

**An institutional PLP Risk Studio.** A React + Plotly dashboard (with a
`Vault | Risk Studio` mode split) streams, live:

- a **3D SVI volatility surface** rebuilt from on-chain `OracleSVIUpdated` events,
- an **arbitrage checker** (butterfly / `g(k)` no-arb overlay),
- a **what-if shock simulator** (client-side: "what does a −X% move do to my
  position?"),
- and **exposure / position / token-bucket / event-stream** panels.

The result is a deposit a non-expert can use and a risk console a desk would
recognize.

---

## How we built it

Five tiers, single-sourced from one `shared/strategy.toml` that code-generates
the locked constants into every runtime.

1. **Move vault package (Sui, deployed to testnet).** `supply` (atomic deposit +
   on-chain hedge mint), `redeem` (request / fulfill / cancel + token-bucket),
   `rebalance` (`buy_hedge_for_deposit` + permissionless `roll_expiring`),
   `svi_view::binary_price` (the on-chain digital-put pricer), `ltv` (worst-case
   NAV under a fully-adverse Predict outcome), and a thin `predict_adapter`
   (single-file blast radius around the Predict ABI). The vault is a shared
   object; capabilities follow the `BalanceManager` + `TradeCap` discipline.

2. **Three-way SVI parity gate.** The binary-price math (raw 5-parameter SVI →
   zero-drift Black–Scholes digital, `Φ(d2)`) is implemented in **Move, Python,
   and TypeScript** and pinned by **141 golden vectors** — **21 of them straight
   from the worked examples in Gatheral & Jacquier (2014)** — that must be
   **bit-for-bit equal** across all three runtimes in CI. The on-chain pricer is
   cloned line-for-line from the audited DeepBook Predict oracle (Cody-1969
   `Φ`, integer-Newton `sqrt` with fixed unrolled iterations for cross-runtime
   determinism). Math is documented in **`docs/WHITEPAPER.md`**.

3. **Event relay / indexer (Node).** `queryEvents` polls `OracleSVIUpdated` at a
   2s cadence with a disk-persisted cursor, decodes the BCS payload, and pushes
   parsed updates to the dashboard over a WebSocket (replay-on-connect).

4. **React + Plotly Risk Studio.** Vite + `@mysten/dapp-kit`; 11 panels behind
   the `Vault | Risk Studio` split; the 3D surface is `plotly.js`
   `type: 'surface'`.

5. **Python walk-forward backtest.** A PLP+hedge economic model (`strategy_sim`)
   replayed over 365 days of BTC hourly bars with an out-of-sample holdout, a
   hedge-ratio sensitivity sweep, and a **lookahead-bias audit** (shuffled-label
   test + a seeded hand-recompute). Returns are sourced from this harness, never
   hand-edited (`backtest/reports/full-365d-report.html`).

**The composability centerpiece — a 5-call single PTB:** `margin deposit` →
`borrow_quote` → `withdraw` (bridge the borrowed `Coin<DUSDC>`) →
`vault::supply::supply` (atomic deposit + hedge mint) → optional
`VAULT_SHARE`-as-collateral re-deposit. Any failing call aborts the whole block;
the `TradeCap` never escapes the wrapped `BalanceManager`. The four-tier system
and this PTB are diagrammed in **`docs/architecture.svg`**.

---

## Challenges we ran into

We kept the project honest, which meant naming the things that *don't* work
live today rather than faking them.

- **The two-protocol single-PTB cannot run live on testnet — yet.** There is no
  DUSDC DeepBook Margin pool on testnet (the live Margin pool uses a different
  token, DBUSDC), so the full Margin + Predict + vault PTB has no pool to borrow
  against. We proved the 5-call shape compiles and executes via a
  **`mock_margin_pool` integration test** and ship it as **documented-future /
  live-on-testnet-pending** the moment a DUSDC Margin pool exists. We do **not**
  claim a live testnet Margin borrow. The honestly-filmable demo is
  `make demo`: deposit + **real on-chain Predict hedge mint** + redeem, with the
  `Supplied` and `HedgeMinted` events and the tx digest visible on Suiscan.

- **Hedge custody is per-supplier, not pooled — by a Predict ownership constraint.**
  DeepBook Predict gates `mint`/`redeem` on `ctx.sender() == manager.owner()`, and a
  shared `Vault` object is never a transaction sender, so the vault can't own a
  `PredictManager` (our WAVE-0 spike,
  `contracts/tests/_spike/predict_manager_owner_spike_test.move`, proves option (a)
  aborts with `ENotOwner`). v1 therefore uses **supplier-owned** managers: each deposit's
  hedge lives in the depositor's own manager and settles back there, so the binaries are
  **real and on-chain** but **pooled vault-level hedge custody and NAV reconciliation are
  pre-mainnet** (the vault carries the hedge leg at cost basis today). See
  `docs/WHITEPAPER.md` §8.1.

- **DeepBook Predict mainnet did not ship inside the submission window.** Mysten
  launched Predict on **testnet** (2026-05-05) and framed mainnet as "later in
  2026." So the demo targets **testnet**, and a ~10-second **mainnet-readiness
  sidebar** (`docs/MAINNET-READINESS.md`) covers the post-submission deploy
  posture: the toolkit is committed, lint-clean, and runnable in **≤30 minutes**
  of operator time the day Predict ships on mainnet.

- **Cross-runtime bit-equal math is unforgiving.** Getting Move, Python, and
  TypeScript to agree to the last integer unit on `Φ(d2)` meant porting fixed
  op-order, a fixed-iteration integer `sqrt` (no convergence detection), and the
  Cody-1969 rational `Φ` identically into three languages, then gating it in CI.

- **An honest backtest, not a flattering one.** The locked v1 hedge ratio (0.10)
  is deliberately **not** the out-of-sample-optimal ratio (0.05 is) — we refused
  to retrospectively re-tune to the test set. In the calm OOS holdout that means
  the insurance shows up as a net cost-of-carry, and we report it as such.

---

## Accomplishments we're proud of

- **A real, deployed testnet vault** with the full deposit → on-chain hedge mint
  → cooldown-gated redeem cycle green end-to-end (`make demo`, dual ±10 bps NAV
  gate). Addresses are real and below.
- **Bit-for-bit SVI math across three runtimes** — 141 golden vectors (21 from
  Gatheral & Jacquier 2014) bit-equal in Move, Python, and TypeScript, gated in
  CI.
- **An honest backtest with the asymmetry on the table** (window-labeled, both
  windows, per `NUMBERS-CANONICAL.md` — committed report:
  `backtest/reports/full-365d-report.html`):

  > **Over the full 365-day window the strategy returned +7.52%** (one −15%
  > breach fired; hedge payoff **+9.98%**), cutting hedged max drawdown to
  > **−1.66%** versus **−52.86%** for unhedged buy-and-hold BTC (~32× tighter).
  > **In the calm out-of-sample (OOS) 30% holdout, the hedge was a net cost**
  > (APY **−2.30%**, Sharpe **−1.87**, 7 hedge cycles / 0 payoffs) — the honest
  > cost-of-carry of crash insurance when no crash arrives.

  *(Full-window figures: `.planning/backtest-assumptions.md`. OOS figures:
  `backtest/reports/full-365d.json`. These are two different windows — never
  read the +7.52% full-window return next to the −1.87 OOS Sharpe as one run.)*

  This small-steady-bleed-in-calm, large-protection-in-a-crash shape **is** the
  "PLP yield minus crash insurance" profile — presented without inflation.

- **A credibility moat, not just a feature list.** What a copycat vault can't
  trivially clone is the *discipline*: a CI-gated cross-runtime (Move / Python /
  TypeScript) SVI parity proof — the same number on-chain, in the backtest, and
  in the dashboard, bit-for-bit — built on the audited Predict oracle math, plus
  a pre-committed sizing policy and a disclosed out-of-sample holdout that we
  refused to retro-tune. The "third primitive in the DeepBook stack" claim earns
  its place through auditable correctness and honest reporting, not marketing.

---

## What's next

- **Mainnet deploy when DeepBook Predict ships there.** The toolkit (preflight +
  predict-mainnet-check + deploy + smoke-test) is committed and ready in ≤30
  minutes (`docs/MAINNET-READINESS.md`).
- **Live `VAULT_SHARE`-as-Margin-collateral** once a DUSDC DeepBook Margin pool
  exists — turning the documented-future 5th PTB call into a live one.
- **Dynamic hedge sizing (v2).** The sizing function is parameterized (`"fixed"`
  in v1) for a future volatility-/regime-responsive policy.
- **Multi-asset support** beyond BTC.
- **A third-party security audit (v2).** *The codebase is **not** audited today;*
  an external audit is future work, not a claim about the current submission.

---

## Submission details

**Paste this block into the matching Devpost / portal fields.**

### Live demo

- **Network:** Sui **testnet** (DeepBook Predict is testnet-only in the
  submission window).
- **Live dashboard:** <https://deep-vault-dashboard.vercel.app> — the hosted PLP
  Risk Studio (live 3D SVI surface + vault state, streamed from the hosted
  relay). The relay runs on Render's free tier and sleeps after ~15 min idle, so
  the first load after idle cold-boots (~30–60s) then reconnects automatically;
  open it a minute ahead for a guaranteed-warm view.
- **Demo:** `make demo` → deposit + real on-chain Predict hedge mint + 1h-cooldown
  redeem; emits `Supplied` + `HedgeMinted`; tx digest viewable on Suiscan.
- **Demo video:** `<DEMO-VIDEO-URL-PLACEHOLDER>`  *(fill with the recording's
  share URL — see `docs/DEMO-SCRIPT.md`)*
- **Repository:** https://github.com/Chimdalu-Ofoegbu/DeepVault

### Deployed testnet contracts (real, from `TESTNET-DEPLOY.json`)

| Object | ID / digest | Explorer |
| --- | --- | --- |
| Package | `0xbc9aaeaa237400179e4c55cf49209dcf6ed0492be6eeb0088677e754ebd6e862` | https://suiscan.xyz/testnet/object/0xbc9aaeaa237400179e4c55cf49209dcf6ed0492be6eeb0088677e754ebd6e862 |
| Vault (shared) | `0x2824d97e221413660fd9f8e23155bd4d1d459c06a893b1d350eb279c3bf7a911` | https://suiscan.xyz/testnet/object/0x2824d97e221413660fd9f8e23155bd4d1d459c06a893b1d350eb279c3bf7a911 |
| Admin cap | `0x9e40150e07ce223019afbaca425cb08b84c541ad402b428ee4a9942dfaaba3e7` | https://suiscan.xyz/testnet/object/0x9e40150e07ce223019afbaca425cb08b84c541ad402b428ee4a9942dfaaba3e7 |
| Deploy tx | `ETYPnLemp761HsXeWigdh7h5hMvqEa2id4KDm8auBBCS` | https://suiscan.xyz/testnet/tx/ETYPnLemp761HsXeWigdh7h5hMvqEa2id4KDm8auBBCS |

*Deployed 2026-05-16. Quote asset on testnet: DUSDC
(`0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`).*

### Documentation & artifacts (in-repo, GitHub-renderable)

- **Strategy whitepaper:** `docs/WHITEPAPER.md` (SVI math + hedge pricing +
  sizing bounds + liquidation-under-worst-case + risk disclosures)
- **Architecture diagram:** `docs/architecture.svg` (four tiers + the single-PTB
  composability moment)
- **Backtest report (committed):** `backtest/reports/full-365d-report.html`
- **README (start here):** `README.md`
- **Mainnet-readiness playbook:** `docs/MAINNET-READINESS.md`

### Tracks & framing

- **Sui Overflow 2026 — DeepBook specialized track.**
- Narrative: **the third primitive in the DeepBook stack** (DeepBook → DeepBook
  Predict → DeepVault).

---

## Fill-at-filing checklist

Before submitting on the portal:

- [ ] **Replace `<DEMO-VIDEO-URL-PLACEHOLDER>`** with the recorded demo's share
      URL (the recording is the human-action step from the demo plan; see
      `docs/DEMO-SCRIPT.md`).
- [x] **Repository URL filled** — `https://github.com/Chimdalu-Ofoegbu/DeepVault`.
- [ ] **Keep every number's window label** when pasting — do **not** put the
      full-window **+7.52%** next to the OOS **−1.87 Sharpe** as a single
      unlabeled claim.
- [ ] **Add no figure** that is not in
      `.planning/phases/06-submission-package/NUMBERS-CANONICAL.md`.
- [ ] **Do not imply a third-party audit** — the codebase is not audited; an
      audit is listed under "What's next" as future work.
- [ ] Confirm the testnet addresses and Suiscan links above resolve.

> No secrets appear in this document — only public testnet object IDs and public
> in-repo artifact paths. Do not paste any private key or seed phrase into the
> portal.
