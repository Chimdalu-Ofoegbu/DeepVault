# DeepVault — Demo Video Script (~3 min)

**Status:** Film-ready storyboard (Phase 06, Plan 06-04 — DEPLOY-05 preparatory artifact).
**Target runtime:** ~3:00 (hard cap 3:00; trim the cold open first if over).
**What it films:** the honestly-real `make demo` flow on Sui **testnet** — `vault::supply`
(atomic deposit **+ a real on-chain Predict hedge mint**) → `redeem_request` → 1h cooldown →
`redeem_fulfill`, with the 7 staged `[CHECKPOINT PASS]` markers, the supply **tx digest pasted
into suiscan on camera**, the wallet DUSDC diff, and the final **dual ±10 bps verdict**.

> **READ THIS FIRST — the one thing that makes the demo honest.** This script does **not** film a
> live two-protocol Margin PTB. There is **no DUSDC Margin pool on Sui testnet** (the live pool is
> `DBUSDC`, a different token), so a live `LoanBorrowed` / Margin-borrow leg **cannot** be recorded
> today. The two-protocol single-PTB is the architectural centerpiece and is presented as
> **architecturally proven via the `mock_margin_pool` integration test (the 5-call shape compiles
> and runs) and documented as live-on-testnet pending Mysten's DUSDC Margin pool**. A shot showing a
> live Margin `LoanBorrowed` event is **FORBIDDEN** (06-RESEARCH.md Pitfall 3 — non-negotiable). The
> demo narrates the PTB over the passing test/code, never over a live tx.

> **NOTE — the recording is a human-action checkpoint.** This file is the script. Recording it
> requires a human operator with a **funded testnet wallet on camera** running live PTBs — Claude
> cannot record video or drive a wallet UI. Follow the [Pre-recording checklist](#pre-recording-checklist),
> then film shot by shot.

---

## The command being filmed

```bash
SUI_PRIVATE_KEY=<ephemeral testnet key> ORACLE_SVI_ID=<BTC-USD OracleSVI shared object id> make demo
# → bash scripts/testnet-smoke-test.sh → (cd dashboard && npx tsx ../scripts/testnet-smoke-test.ts)
```

- **`SUI_PRIVATE_KEY`** — an **ephemeral throwaway** testnet keypair (see checklist). Never your real
  key; this key is shown to nothing but your own shell and must hold only faucet funds.
- **`ORACLE_SVI_ID`** — the BTC-USD `OracleSVI` shared-object id from the **Mysten Predict testnet
  registry** (the public Predict server). It is a value you *resolve*, not one you deploy.
- **Demo amount:** 50 DUSDC (`SUPPLY_AMOUNT_MICRO = 50_000_000n`). Allocation to the hedge is the
  locked v1 `allocation_bps = 1000` (10%).
- **Wall-clock:** ≈ 1 h 5 m — dominated by the 1-hour `REDEMPTION_COOLDOWN_MS` between
  `redeem_request` and `redeem_fulfill`. **This hour is NOT filmed in real time** — see the
  [cooldown cut plan](#the-1-hour-cooldown-do-not-film-it-live).

The 7 staged checkpoints (each prints a `[CHECKPOINT PASS]` line; `scripts/testnet-smoke-test.sh`
L20–34):

| # | Checkpoint | What it does |
|---|------------|--------------|
| 1 | pre-deposit snapshot | capture `vault.total_assets`, `total_shares_supply`, NAV-per-share |
| 2 | supply tx | atomic deposit + **real on-chain hedge mint** (`vault::supply`) |
| 3 | events `Supplied` + `HedgeMinted` | assert both Move events emitted; capture hedge `cost_basis_quote` |
| 4 | `redeem_request` | assert `RedeemRequested`; capture request timestamp |
| 5 | cooldown wait | wait `REDEMPTION_COOLDOWN_MS` (1 h) + 5 s slack |
| 6 | `redeem_fulfill` | assert `RedeemFulfilled`; capture received `Coin<DUSDC>` value |
| 7 | dual ±10 bps gate | Gate A per-depositor ratio ≥ 99.9% (`ratio_bps=...`); Gate B NAV-per-share drift ≤ 10 bps (`nav_delta_bps=...`) |

Real testnet objects shown on suiscan (verbatim from
`.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`):

| Object | id / digest | suiscan URL |
|--------|-------------|-------------|
| `deepvault` package | `0xbc9aaeaa237400179e4c55cf49209dcf6ed0492be6eeb0088677e754ebd6e862` | `https://suiscan.xyz/testnet/object/0xbc9aaeaa237400179e4c55cf49209dcf6ed0492be6eeb0088677e754ebd6e862` |
| Vault shared object | `0x2824d97e221413660fd9f8e23155bd4d1d459c06a893b1d350eb279c3bf7a911` | `https://suiscan.xyz/testnet/object/0x2824d97e221413660fd9f8e23155bd4d1d459c06a893b1d350eb279c3bf7a911` |
| Deploy tx | `ETYPnLemp761HsXeWigdh7h5hMvqEa2id4KDm8auBBCS` | `https://suiscan.xyz/testnet/tx/ETYPnLemp761HsXeWigdh7h5hMvqEa2id4KDm8auBBCS` |
| **Supply tx (live)** | *(printed by checkpoint 2 at record time)* | `https://suiscan.xyz/testnet/tx/<digest>` ← **pasted on camera** |

---

## Storyboard (shot by shot)

Each row is one shot. **ON SCREEN** = what the viewer sees; **NARRATION** = the spoken line (≈ the
words; tighten to taste); **ACTION / COMMAND** = what the operator does.

### 1 — Cold open · 0:00–0:20 (~20 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | The DeepVault README header / the deployed dashboard landing (Vault tab). Title card: "DeepVault — a composable structured product on DeepBook Predict." |
| **NARRATION** | "DeepVault is one deposit that buys two things at once: PLP yield from DeepBook Predict, **minus** automated crash insurance. You earn the liquidity-provision yield, and a slice of every deposit quietly buys a deep-out-of-the-money binary put that pays off if the market craters. PLP yield minus crash insurance — in a single Sui transaction. That single-transaction composability is the whole thesis: Margin, Predict, and the vault share, fused atomically." |
| **ACTION / COMMAND** | Show the README top or the dashboard landing. Do **not** show any backtest figure on screen here (LD-1 — see guardrails). Keep it to the picture + the laypitch. |

### 2 — Setup · 0:20–0:40 (~20 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | A terminal at repo root. The `make demo` command typed but **not yet run**, with the env vars visible (the key value itself off-screen / masked). |
| **NARRATION** | "Here's the entire judge-facing demo: one command, `make demo`. It supplies 50 test-USDC into the live testnet vault and, in the same call, mints a **real on-chain hedge** against Mysten's Predict testnet package — this is not a mock. `ORACLE_SVI_ID` is the BTC-USD volatility oracle from Mysten's Predict registry; `SUI_PRIVATE_KEY` is a throwaway testnet wallet funded only from the faucet." |
| **ACTION / COMMAND** | Type (do not yet press Enter): `SUI_PRIVATE_KEY=<ephemeral> ORACLE_SVI_ID=<BTC-USD OracleSVI> make demo`. **Mask/omit the key value on camera** — type it from an off-screen paste or pre-export it so only `SUI_PRIVATE_KEY=***` shows. State the 50-DUSDC amount and "10% goes to the hedge." |

### 3 — Supply + real hedge mint · 0:40–1:30 (~50 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | Terminal running. `[CHECKPOINT PASS]` lines 1 → 2 → 3 scroll: pre-deposit snapshot, the supply tx, then `Supplied` + `HedgeMinted` asserted. The printed **supply tx digest** is highlighted. Cut to a browser: paste the digest into suiscan. Then the wallet extension showing DUSDC −50. |
| **NARRATION** | "Press go. Checkpoint one snapshots the vault. Checkpoint two is the supply transaction — deposit plus hedge mint, atomic. Checkpoint three confirms **both** Move events fired: `Supplied` and `HedgeMinted` — the hedge was minted on-chain, against the real Predict package. Here's the transaction digest; let's verify it on-chain." *(paste digest)* "There it is on suiscan: the supply call, the events, the object changes — real testnet state. And in the wallet, the balance dropped by 50 DUSDC: the deposit went in and a slice bought the put." |
| **ACTION / COMMAND** | Press Enter on `make demo`. Let checkpoints 1–3 print. Select + copy the printed supply tx digest. Switch to the suiscan browser tab and open `https://suiscan.xyz/testnet/tx/<digest>` **on camera**; point at the `Supplied` / `HedgeMinted` events. Optionally open the vault object `https://suiscan.xyz/testnet/object/0x2824d97e…f7a911`. Switch to the wallet extension; show the **DUSDC −50** diff. |

### 4 — Redeem (with the cooldown cut) · 1:30–2:10 (~40 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | Terminal: `[CHECKPOINT PASS]` 4 (`redeem_request` / `RedeemRequested`). A clean cut / timelapse wipe with an on-screen caption: **"1-hour redemption cooldown — timelapsed."** Resume on `[CHECKPOINT PASS]` 6 (`redeem_fulfill` / `RedeemFulfilled`). Wallet shows DUSDC restored. |
| **NARRATION** | "To withdraw, you file a redeem request — checkpoint four. The vault enforces a one-hour redemption cooldown, a deliberate anti-griefing window; I've timelapsed it here. *(cut)* An hour later, `redeem_fulfill` — checkpoint six — returns the USDC to the wallet, net of the hedge cost. The balance is back." |
| **ACTION / COMMAND** | After checkpoint 4 prints, **stop the recording** (or insert a hard cut). Let the real 1-hour `REDEMPTION_COOLDOWN_MS` elapse off-camera (the script keeps running). **Resume recording at checkpoint 6.** *(Alternative: pre-run the whole `make demo` once, capture the full terminal log, and narrate over the captured log — same cut between 4 and 6.)* Show the wallet DUSDC restored. **Do not film an hour of waiting.** |

### 5 — Verdict (dual ±10 bps gate) · 2:10–2:30 (~20 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | Terminal: `[CHECKPOINT PASS]` 7 and the final verdict line carrying **`ratio_bps=…`** (Gate A) and **`nav_delta_bps=…`** (Gate B), both annotated `OK`. The shell exits `0`. |
| **NARRATION** | "Checkpoint seven is the verdict — a dual ±10 basis-point gate. Gate A: the depositor got back at least 99.9% of deposit-minus-hedge-allocation. Gate B: the vault's NAV-per-share drifted under 10 basis points across the whole cycle. Both green. The deposit-hedge-redeem round trip conserved value to within ten basis points." |
| **ACTION / COMMAND** | Show checkpoint 7 + the verdict line; point at the live `ratio_bps` and `nav_delta_bps` values **as printed by this run** (these are the only quantitative figures shown on screen — they are the demo's own output, never a quoted backtest number). Show the `exit 0`. |

### 6 — Composability callout (the two-protocol PTB) · 2:30–2:50 (~20 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | The architecture diagram (`docs/architecture.svg`) with the two-protocol single-PTB path highlighted, **or** the source `scripts/two-protocol-ptb-demo.ts` / the passing `mock_margin_pool` integration test output. **No wallet, no live tx, no `LoanBorrowed` event.** |
| **NARRATION** | "The flagship composability moment is a single programmable transaction block that opens the whole leveraged position atomically: deposit collateral to Margin, borrow quote, bridge it out, then call `vault::supply` — deposit **and** hedge mint — in the same PTB, with the vault share optionally re-posted as collateral. Five calls, one atomic transaction; if any leg fails, the whole thing reverts. This shape is **proven by our `mock_margin_pool` integration test** — it compiles and runs. It goes **live on testnet the day Mysten ships a DUSDC Margin pool**; today there's only a different-token pool, so we prove it in the test, not on a live wallet." |
| **ACTION / COMMAND** | Show the SVG PTB path or the green `mock_margin_pool` test. Narrate the 5-call shape: `margin deposit → borrow_quote → withdraw (bridge) → vault::supply::supply → optional VAULT_SHARE re-deposit`. **FORBIDDEN:** any shot implying a live Margin borrow / `LoanBorrowed` on testnet. |

### 7 — Mainnet-readiness sidebar · 2:50–3:00 (~10 s)

| Field | Content |
|-------|---------|
| **ON SCREEN** | `docs/MAINNET-READINESS.md` (the "Why mainnet deploy is deferred" section + the 5-step procedure list). |
| **NARRATION** | "Why testnet? DeepBook Predict hasn't shipped on mainnet inside the submission window. A mainnet smoke test today would degrade to deposit-and-redeem with **zero hedge allocation** — strictly worse than this full testnet demo. The mainnet toolkit is committed and runs in **under 30 minutes** the day Predict ships on mainnet. DeepVault — PLP yield minus crash insurance, composable on Sui." |
| **ACTION / COMMAND** | Show `docs/MAINNET-READINESS.md` §"Why mainnet deploy is deferred" and the 5-step ≤30-min procedure. Keep it to ~10 s. End card optional. |

---

## The 1-hour cooldown: do NOT film it live

The redemption cooldown (`REDEMPTION_COOLDOWN_MS = 3_600_000` ms = 1 h, single source of truth in
`shared/strategy.toml [redemption]`) sits between checkpoint 4 (`redeem_request`) and checkpoint 6
(`redeem_fulfill`). It is **not** filmable in real time. Pick one:

- **Cut & resume (recommended):** record through checkpoint 4, **stop**, let the script keep running
  off-camera for the hour, **resume** recording at checkpoint 6. Stitch with a timelapse/cut caption
  ("1-hour cooldown — timelapsed").
- **Pre-run & narrate:** run the full `make demo` once start-to-finish, capture the complete terminal
  log (and the supply tx digest), then record a screen-capture of the **log** with narration, cutting
  between checkpoints 4 and 6.

Either way: the viewer must understand an hour passed; never imply the round trip is instant, and
never speed-ramp over the cooldown without a caption.

---

## Pre-recording checklist

Complete every item before you hit record.

- [ ] **Funded throwaway testnet wallet** — an **ephemeral** keypair holding **≥ 60 DUSDC** (50 for
      the supply + headroom) **plus testnet SUI for gas**, all from the faucet. This is a disposable
      key; it guards nothing of value. (Wallet hygiene per `docs/MAINNET-READINESS.md` §Wallets.)
- [ ] **`SUI_PRIVATE_KEY` exported off-camera** — export it in the shell *before* recording, or paste
      from off-screen, so the key value never appears on screen (only `SUI_PRIVATE_KEY=***`).
- [ ] **`ORACLE_SVI_ID` resolved** — the BTC-USD `OracleSVI` shared-object id from the **Mysten
      Predict testnet registry** (public Predict server). Have it ready to paste.
- [ ] **`TESTNET-DEPLOY.json` is `deployed`** — the smoke test hard-errors otherwise
      (`scripts/testnet-smoke-test.sh` L70–82). It is, as of 2026-05-16; just confirm.
- [ ] **Dashboard running** — for the cold-open landing shot (local Vite dev server is fine and
      avoids network surprises; point it at the testnet vault).
- [ ] **suiscan tab open** — `https://suiscan.xyz/testnet/` ready for the digest paste.
- [ ] **Wallet extension visible** — to show the DUSDC −50 / restored diff between checkpoints.
- [ ] **Screen recorder + microphone** tested (levels, region, cursor visible).
- [ ] **Cooldown plan chosen** — cut-&-resume vs pre-run-&-narrate (see above).
- [ ] **Dry run done** — ideally run `make demo` once end-to-end first (this also produces a real
      supply tx digest and confirms a green dual-gate verdict before you record).

---

## Honesty guardrails (binding on the recording)

> **G1 — No live Margin / two-protocol PTB shot (06-RESEARCH.md Pitfall 3).** There is no DUSDC
> Margin pool on Sui testnet. The two-protocol single-PTB is filmed **only** as the architecture
> diagram / the passing `mock_margin_pool` test, narrated as **"architecturally proven via mock,
> live-on-testnet pending Mysten's DUSDC Margin pool."** **Never** show a live `LoanBorrowed` /
> Margin-borrow event from a testnet tx. The honestly-real on-chain action in this video is the
> `vault::supply` deposit **+ real Predict hedge mint** and the redeem cycle — film that as real,
> and frame the Margin leg as mock-proven/pending.

> **G2 — Every number on screen must be the live demo's own output (LD-1).** The only quantitative
> figures shown on camera are the values **this run prints** — primarily `ratio_bps` and
> `nav_delta_bps` from the checkpoint-7 dual gate (plus the on-screen balances/events). **Do NOT**
> overlay or speak a backtest performance figure (e.g. the full-window +7.52% total return or the
> OOS −2.30% APY from `.planning/phases/06-submission-package/NUMBERS-CANONICAL.md`) **as if it were
> this demo's output.** Backtest numbers belong in the README / whitepaper / Devpost (where they are
> window-labeled and sourced), not narrated over the live terminal as the demo's result. If you
> mention strategy economics verbally in the cold open, keep it qualitative ("yield minus insurance"),
> not a specific percentage.

> **G3 — Ephemeral-key hygiene.** The demo wallet is a throwaway funded only from the faucet; its
> private key is never displayed on screen. This script embeds no key, seed, or mnemonic.

---

## After recording (hand-off)

1. Save the recording and upload it (YouTube unlisted, Loom, or similar).
2. Keep the share URL — **Plan 06-05 (Devpost filing) needs it** as the demo-video link in
   `docs/DEVPOST-SUBMISSION.md`.
3. Resume signal back to the workflow: type **"recorded"** plus the video share URL, or describe any
   blocker (wallet funding, OracleSVI id resolution, a red checkpoint).
