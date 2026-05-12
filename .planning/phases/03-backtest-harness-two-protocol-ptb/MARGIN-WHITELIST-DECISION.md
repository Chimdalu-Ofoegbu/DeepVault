# DeepBook Margin testnet — VAULT_SHARE-as-collateral whitelist decision

**Decision date:** 2026-05-12
**Decided by:** Phase 3 Wave 0 spike (Plan 03-01 Task 2)
**Executor environment:** Windows 11, Sui CLI `1.71.1-2f5992f189cd-dirty`, Sui testnet RPC `https://fullnode.testnet.sui.io:443`

## Inputs

### Step 1: MarginRegistry object ID discovery

**Attempt (a) — local config:**

```bash
$ grep -rn -i 'margin_registry\|MarginRegistry\|MARGIN_REGISTRY' config/testnet.toml
(no matches)

$ grep -n 'margin_pool_id\|deepbook_margin' config/testnet.toml
28:[deepbook_margin]
29:# DeepBook Margin, testnet (TBD: pull from @mysten/deepbook-v3 0.17.0 Margin Manager docs in Phase 1+ spike)
30:package_id = "TBD"
31:margin_pool_id = "TBD"
```

Result: `config/testnet.toml` carries `[deepbook_margin]` placeholders `package_id = "TBD"`, `margin_pool_id = "TBD"`. **No locally-known margin pool ID.**

**Attempt (b) — vendored deepbook_margin Move.toml:**

```bash
$ cat scripts/deepbookv3/packages/deepbook_margin/Move.toml
[package]
name = "deepbook_margin"
edition = "2024.alpha"
[addresses]
deepbook_margin = "0x0"
```

Result: vendored package declares `deepbook_margin = "0x0"` — **NOT YET DEPLOYED** on any environment per the source-of-truth manifest.

**Attempt (c) — predict server REST:**

```bash
$ curl -sLv --max-time 10 'https://predict-server.testnet.mystenlabs.com/' 2>&1 | grep -E '^< HTTP|^< Content-Length'
< HTTP/1.1 200 OK
< Content-Length: 0

$ curl -sL --max-time 10 'https://predict-server.testnet.mystenlabs.com/markets'  # empty body
$ curl -sL --max-time 10 'https://predict-server.testnet.mystenlabs.com/margin'   # empty body
```

Result: predict server reachable (200 OK) but root and probed endpoints return empty bodies. No margin-related REST surface exposed at the level we probed. Mysten has not published documentation listing margin endpoints.

**Attempt (d) — Sui RPC direct probes:**

```bash
# (i) Inspect Predict registry shared object content for any margin pool refs
$ curl -sL --max-time 15 -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"sui_getObject","params":["0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",{"showContent":true,"showType":true}]}' \
    https://fullnode.testnet.sui.io
TYPE: 0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::registry::Registry
CONTENT_FIELDS: id, oracle_ids, predict_id

# (ii) List modules in Predict package — confirm margin is not inside Predict
$ sui_getNormalizedMoveModulesByPackage(0xf5ea...785138)
modules: constants, i64, market_key, math, oracle, oracle_config, plp, predict, predict_manager,
         pricing_config, range_key, rate_limiter, registry, risk_config, strike_matrix,
         treasury_config, vault
(no margin_registry, margin_manager, margin_pool module)

# (iii) Probe canonical deepbook v3 mainnet address (0xdee9) on testnet — no hits
$ suix_queryEvents(MoveEventType="0xdee9::margin_registry::MarginRegistry") → []
$ suix_queryEvents(MoveEventType="0xdee9::deepbook::PoolCreated")          → []
```

Result: Predict registry shared object exposes only `oracle_ids` and `predict_id` — no margin pool references. The Predict package does not contain margin modules (they live in the separate `deepbook_margin` package). No testnet-deployed `deepbook_margin` package is discoverable via the canonical RPC entry points.

### Step 2: Registry state read

Predict `Registry` content fields (queried in Step 1 (d)(i)): `[id, oracle_ids, predict_id]`. The Predict registry does NOT have a `pool_registry` field exposing margin pools. Margin pools live in a separate `MarginRegistry` shared object owned by the `deepbook_margin` package — which we could not locate.

### Step 3: DUSDC MarginPool ID discovery

Not reachable — Step 1 + Step 2 both indicate the `deepbook_margin` package is not bootstrapped on Sui testnet at the addresses our research surface knows about (CLAUDE.md, vendored Move.toml, predict server, Sui RPC canonical entries). The DUSDC `MarginPool<DUSDC>` shared object cannot be discovered.

### Step 4 (added by Task 3 SDK introspection, 2026-05-12): @mysten/deepbook-v3@1.3.6 exports

After Task 3 installed `@mysten/deepbook-v3@1.3.6` (the latest npm, replacing CLAUDE.md's 0.17.0 pin per the SDK introspection result in WAVE0-DECISION.md "SDK introspection evidence" section), the SDK exposes:

```javascript
testnetPackageIds.MARGIN_PACKAGE_ID  = "0xd6a42f4df4db73d68cbeb52be66698d2fe6a9464f45ad113ca52b0c6ebd918b6"
testnetPackageIds.MARGIN_REGISTRY_ID = "0x48d7640dfae2c6e9ceeada197a7a1643984b5a24c55a0c6c023dac77e0339f75"

testnetMarginPools.DBUSDC = {
  address: "0xf08568da93834e1ee04f09902ac7b1e78d3fdf113ab4d2106c7265e95318b14d",
  type:    "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC"
}
testnetMarginPools.SUI   = { address: "0xcdbbe6a72e639b647296788e2e4b1cac5cea4246028ba388ba1332ff9a382eea", type: "0x2::sui::SUI" }
testnetMarginPools.DEEP  = { ... }
testnetMarginPools.DBTC  = { address: "0xf3440b4aafcc8b12fc4b242e9590c52873b8238a0d0e52fbf9dae61d2970796a", type: "0x6502dae8...::dbtc::DBTC" }
```

Verified live via Sui RPC `sui_getObject` on the DBUSDC margin pool address:

```
TYPE: 0xb8620c24c9ea1a4a41e79613d2b3d1d93648d1bb6f6b789a7c8f261c94110e4b::margin_pool::MarginPool<0xf7152c05...::DBUSDC::DBUSDC>
CONTENT_FIELDS: allowed_deepbook_pools, config, extra_fields, id, positions, protocol_fees, rate_limiter, state, vault
```

The live MarginPool shared object exists. Note the wrapper package `0xb8620c24...`
differs from the SDK's `MARGIN_PACKAGE_ID` `0xd6a42f...` — likely an upgrade-cap'd
version of the package; both refer to the same logical module.

**Crucial caveat:** the live testnet margin pool uses token type `DBUSDC = 0xf7152c05...::DBUSDC::DBUSDC`, which is DIFFERENT from DeepVault's quote token `DUSDC = 0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` (set in `config/testnet.toml` `[assets].quote_type_tag`). The live pool cannot be used directly without either:

(i) **Adapter route:** swap DUSDC → DBUSDC inside the PTB before the borrow step. This adds two more moveCalls and a Cetus dependency — out of scope for v1.

(ii) **Token migration:** re-deploy the vault using DBUSDC as quote. Touches the Phase 2 vault parameterization (Plan 02-03's `[assets]` block + redeploy). Could be done in Plan 03-09 closeout but is non-trivial.

(iii) **Mock fallback (selected):** keep DUSDC as the vault quote; ship the
mock_margin_pool integration test that exercises the 5-call shape locally with the
same token semantics. Live demo on testnet is documented-future.

## Decision

**Result:** UNDETERMINED-FALLBACK-TO-MOCK

(Selected from `WHITELISTED-LIVE | NOT-WHITELISTED-FALLBACK-TO-MOCK | UNDETERMINED-FALLBACK-TO-MOCK`.)

**Rationale.** `deepbook_margin` IS deployed on testnet (MARGIN_PACKAGE_ID `0xd6a42f...`,
MARGIN_REGISTRY_ID `0x48d7640d...`), with live MarginPools for SUI / DBUSDC / DEEP /
DBTC. **However, no MarginPool exists for our DeepVault quote token `DUSDC`
(`0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`)**.
The closest available pool, DBUSDC, uses a different token type
(`0xf7152c05...::DBUSDC::DBUSDC`). DeepVault cannot borrow DUSDC from any testnet
margin pool today. The decision falls back to `UNDETERMINED-FALLBACK-TO-MOCK` — we
are NOT blocked by the network (we reached it and confirmed pool inventory), but the
specific pool we need does not exist. This is qualitatively different from a
straightforward "VAULT_SHARE not whitelisted" verdict because no DUSDC-quoted
borrow path exists for ANY collateral, not just VAULT_SHARE.

The planner's W2 sentinel `EVIDENCE-BLOCKED-NO-NETWORK` does NOT apply
(network reachable; evidence collected; pool inventory enumerated empirically).

## Implications for Track A

Per CONTEXT.md D-18 fallback policy: Plans 03-03 and 03-05 build the demo PTB
skeleton that exercises the 5-call shape against the mock `MarginPool` only. The
live testnet PTB is **documented-future** until Mysten bootstraps `deepbook_margin`
on testnet. Three artifacts ship anyway:

1. **PROJECT.md scope section update** — note that PTB-03's "live testnet
   five-call PTB" is conditional on Mysten Margin testnet bootstrapping.
2. **Whitepaper / submission slide stub** — explicit "architectural readiness via
   mock_margin_pool integration test" framing.
3. **`contracts/tests/mock_margin_pool.move` integration test** — proves the
   5-call PTB shape compiles and runs locally against the mock `MarginPool`.

The mock pattern is documented in `.planning/phases/03-backtest-harness-two-protocol-ptb/03-PATTERNS.md` Pattern 4.

## Recheck date

**2026-06-08** — if Phase 3 has not closed by this date, re-spike the Margin testnet
registry state. Search procedure:

1. `git fetch origin predict-testnet-4-16 && git log HEAD..origin/predict-testnet-4-16 -- packages/deepbook_margin/Move.toml`
2. Probe `https://predict-server.testnet.mystenlabs.com/` again for new endpoints.
3. Search Mysten Discord and developer docs for `deepbook_margin` testnet announcements.
4. If a margin testnet package ID surfaces, update `config/testnet.toml` `[deepbook_margin]`
   block, re-run Step 1 (d) RPC probes, and amend this file with the live decision.

RESEARCH.md `## Open Questions (RESOLVED)` Q1 has a corresponding recheck date.

## Q1 cross-reference

This file IS the resolution of RESEARCH.md Open Question 1 ("Does Margin testnet
have a DUSDC margin pool that can be borrowed against?"). The locked answer:
**deepbook_margin is not detectably deployed on Sui testnet at the time of this
spike (2026-05-12)**. The 5-call PTB shape in WAVE0-DECISION.md remains the canonical
demo shape; Plan 03-03 + 03-05 ship the mock_margin_pool fallback.
