---
phase: 00-setup-ground-rules
plan: 04
subsystem: infra
tags: [config, testnet, mainnet, schema-parity, pitfall-14, runtime-config]

# Dependency graph
requires: [00-01, 00-02]
provides:
  - "config/testnet.toml — testnet runtime configuration with verified Predict addresses (package, registry, top-level shared object), DUSDC type tag, RPC URLs, schema_version=1, 8 sections"
  - "config/mainnet.toml — mainnet runtime scaffold with identical schema, 17 TBD slots Phase 5 preflight script asserts against"
  - "Schema-parity contract enforced (Pitfall 14 mitigation): both files share identical top-level sections AND identical key sets within each section, verifiable via tomllib diff"
  - "[contingency] block with predict_mainnet_shipped flag (DEPLOY-09 / D-09 fallback gate)"
  - "[hosting] block reserving dashboard_url + relay_url + relay_keepalive_path (Phase 4 fills)"
affects: [00-05, 00-06, 00-07, phase-4, phase-5]

# Tech tracking
tech-stack:
  added:
    - "TOML runtime config tier (config/{testnet,mainnet}.toml) — runtime address book consumed by indexer, dashboard, scripts, and Move via Move.toml [addresses]"
  patterns:
    - "Schema parity discipline: any new key added to one config file MUST be added to the other in lock-step (Pitfall 14 mitigation; preflight will diff)"
    - "TBD literal as the canonical 'unfilled' sentinel — greppable, parseable, and asserted-against by the Phase 5 preflight gate"
    - "Top-level `schema_version = 1` scalar to enable future schema migrations without ambiguity"
    - "No address hardcoding in source: every address comes from these TOMLs (or via codegen from Move.toml [addresses])"

key-files:
  created:
    - config/testnet.toml
    - config/mainnet.toml
  modified: []

key-decisions:
  - "Testnet [deepbook_margin], [oracle_svi].event_module_full, [assets].btc_oracle_type_tag retained as TBD even on testnet — these are not yet documented in the Mysten public surface as of Phase 0; Phase 1 spike (Margin Manager docs read + oracle_svi.move read) fills them. Decision: do NOT pre-fill with guesses; TBD literal is greppable and the Phase 5 preflight will catch any leak from testnet TBD->mainnet copy-paste."
  - "Schema parity verified using tomllib (Python 3.11+ stdlib): sections compared via `sorted(k for k,v in toml.items() if isinstance(v,dict))`, then per-section keys compared via `sorted(toml[s].keys())`. Top-level scalars (schema_version) ALSO compared. This exact incantation will be re-run by Phase 5 scripts/preflight.sh; documenting it here so Phase 5 can copy-paste."
  - "[hosting].relay_url placeholder TBD (filled in Phase 4) but the comment explicitly notes the `wss://` scheme requirement — the Render free-tier deploy will return a `wss://<slug>.onrender.com` URL, NOT `ws://`. Phase 4 must use the wss scheme so the dashboard's WebSocket client connects from the https-served Vercel page (mixed-content blocking on `ws://` from `https://`)."
  - "[contingency].predict_mainnet_shipped is the boolean false (TOML `false`, not the string `\"false\"`) — Phase 5 reads it via `tomllib` so type matters. Verified via `assert d['contingency']['predict_mainnet_shipped'] is False` in Task 1's automated check."

requirements-completed: [SETUP-04]

# Metrics
duration: 5min
completed: 2026-05-09
---

# Phase 0 Plan 04: Testnet + Mainnet Config Scaffold Summary

**Runtime address book wired for both networks with strict schema parity (Pitfall 14 mitigation). `config/testnet.toml` populated with the three verified Predict testnet addresses from CLAUDE.md Stack Pins (package `0xf5ea2b37…5138`, registry `0x43af14fe…6e64`, top-level shared object `0xc8736204…028a`), the DUSDC quote type tag, the public Predict testnet server URL, and the 2s oracle poll interval per STACK.md. `config/mainnet.toml` mirrors the schema key-for-key with 17 TBD placeholders that the Phase 5 preflight script will refuse-to-publish against. Both files carry `schema_version = 1` plus an identical 8-section structure: `[network]`, `[predict]`, `[deepbook_margin]`, `[oracle_svi]`, `[assets]`, `[deepvault]`, `[hosting]`, `[contingency]`. Schema parity verified end-to-end via `tomllib` (sections + per-section keys + top-level scalars all matched). The `[contingency]` block reserves `predict_mainnet_shipped = false` in both files — the DEPLOY-09 / D-09 gate Phase 5 flips on day-of if Predict mainnet has shipped by 2026-06-09. SETUP-04 satisfied.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-09T05:53:00Z
- **Completed:** 2026-05-09T05:58:00Z
- **Tasks executed:** 2 of 2 (no deferrals, no checkpoints)
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- **`config/testnet.toml` committed (62 lines).** Header comment names every consumer (indexer Phase 4, dashboard Phase 4, scripts/preflight.sh, vault::predict_adapter via Move.toml) and explicitly identifies the file as Pitfall 14 schema-parity counterpart. `[network]` block: `name = "testnet"`, `sui_rpc_url = "https://fullnode.testnet.sui.io:443"`, `sui_ws_url = ""` (intentionally empty — Sui JSON-RPC WS is deprecated; STACK.md mandates `queryEvents` polling), `predict_server_url = "https://predict-server.testnet.mystenlabs.com"`. `[predict]` block: three verified-2026-05-08 testnet addresses (package, registry, top-level shared object) sourced verbatim from CLAUDE.md Stack Pins, plus `plp_type_tag` for the LP share returned by `predict::supply`. `[assets]` block: `quote_type_tag = "0xe9504008…::dusdc::DUSDC"`, `quote_decimals = 6`. `[deepbook_margin]`, `[oracle_svi].event_module_full`, `[assets].btc_oracle_type_tag`, `[deepvault]`, and `[hosting]` slots remain TBD (filled in Phase 1 spike, Phase 2 deploy, Phase 4 deploy respectively). `[contingency].predict_mainnet_shipped = false` for schema parity with mainnet.

- **`config/mainnet.toml` committed (62 lines).** Schema mirrors testnet exactly: same 8 sections, same key set within each section, same top-level `schema_version = 1` scalar. Header comment carries a hard "DO NOT publish to mainnet until every TBD value below is filled" warning naming the Phase 5 preflight script. `[network].name = "mainnet"`, `sui_rpc_url = "https://fullnode.mainnet.sui.io:443"`. `predict_server_url = "TBD"` with inline comment that the expected pattern is `https://predict-server.mainnet.mystenlabs.com` but Mysten has not announced it as of Phase 0. `[predict]` block: 4 TBD slots with comment routing to DEPLOY-09 fallback if mainnet not shipped by 2026-06-09. `[assets].quote_type_tag = "TBD"` with comment naming USDsui (per CONTEXT.md D-08, acquired via Cetus DEX swap). `[deepvault]`: 5 TBD slots Phase 5's `sui client publish` step fills. `[hosting]`: `dashboard_url` (Vercel `<slug>.vercel.app`) and `relay_url` (Render `wss://<slug>.onrender.com`) TBD slots Phase 4 fills. `[contingency]`: explicit DEPLOY-09 comment block plus `predict_mainnet_shipped = false`.

- **Schema parity verified via tomllib (Pitfall 14 gate proven).** The verification script — which Phase 5's `scripts/preflight.sh` will re-run — passed:
  ```
  Schema parity OK (8 sections matched, top-level scalars matched)
  TBD slots in mainnet.toml: 18
  ```
  Sections compared: `['assets', 'contingency', 'deepbook_margin', 'deepvault', 'hosting', 'network', 'oracle_svi', 'predict']` — identical between testnet and mainnet. Per-section key sets also identical (verified by sorted-keys comparison). Top-level scalar `schema_version` present in both with value `1`.

- **17 TBD slots enumerated for the Phase 5 preflight checklist.** Phase 5's `scripts/preflight.sh` will refuse to publish until every one of these is filled with a real value:
  - `[network].predict_server_url` (1)
  - `[predict].package_id`, `.registry_id`, `.top_level_shared_object_id`, `.plp_type_tag` (4)
  - `[deepbook_margin].package_id`, `.margin_pool_id` (2)
  - `[oracle_svi].event_module_full` (1, currently `"TBD::oracle_svi::OracleSVIUpdated"` placeholder shape)
  - `[assets].quote_type_tag`, `.btc_oracle_type_tag` (2)
  - `[deepvault].package_id`, `.vault_shared_object_id`, `.admin_cap_id`, `.treasury_cap_holder`, `.deploy_tx_digest` (5)
  - `[hosting].dashboard_url`, `.relay_url` (2)

## Acceptance Criteria

| Criterion | Met? | Evidence |
|-----------|------|----------|
| Both config files exist | YES | `config/testnet.toml`, `config/mainnet.toml` (committed `f314e55`, `e7c49d5`) |
| Both have `[network]`, `[deepbookv3]`-class, `[deepvault]`, `[hosting]`, `[contingency]` sections | YES | All 8 sections present in both: `[network]`, `[predict]`, `[deepbook_margin]`, `[oracle_svi]`, `[assets]`, `[deepvault]`, `[hosting]`, `[contingency]` (note: split into `[predict]` + `[deepbook_margin]` because they are distinct DeepBookV3 packages with distinct address slots — clearer than a flat `[deepbookv3]`) |
| Schema parity check passes (same set of keys in both files) | YES | `Schema parity OK (8 sections matched, top-level scalars matched)` — sections AND per-section keys AND top-level scalars all matched |
| `[contingency]` block present in both with `predict_mainnet_shipped = false` | YES | TOML boolean `false` (not string), verified via `assert d['contingency']['predict_mainnet_shipped'] is False` in both files |
| `[hosting]` block present with `wss://` note for relay_url | YES | `relay_url = "TBD"` with inline comment `# wss://<slug>.onrender.com, filled Phase 4` (mainnet) and `wss://<slug>.onrender.com` (testnet) |
| Phase 5 preflight has greppable TBD literal | YES | 17 TBD slots in mainnet.toml, all matchable by `grep -n '\"TBD\"' config/mainnet.toml` |
| Testnet has three known Predict addresses | YES | package `0xf5ea2b37…5138`, registry `0x43af14fe…6e64`, top-level shared object `0xc8736204…028a` (CLAUDE.md verified 2026-05-08) |
| Both reference docs/MAINNET-FUNDING.md | YES | `[contingency].fallback_documented_in = "docs/MAINNET-FUNDING.md"` in both |

## Threat Register Closure

| Threat ID | Disposition | Resolution |
|-----------|-------------|------------|
| T-00-14 (Tampering: schema drift) | mitigate | Schema parity check passing; Phase 5 preflight will re-run the same tomllib diff |
| T-00-15 (Info Disclosure: AdminCap holder) | accept | `[deepvault].treasury_cap_holder` reserved as TBD; Phase 5 deploy will commit the public deployer address per D-10 (public repo) |
| T-00-16 (DoS: publish with TBD slots) | mitigate | TBD literal is greppable; Phase 5 preflight refuses-to-proceed gate has a stable string to assert against |
| T-00-17 (Repudiation: deploy_tx_digest unrecorded) | mitigate | `[deepvault].deploy_tx_digest` slot reserved; Phase 5 will populate from `sui client publish` output |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical functionality] TBD slot count in mainnet.toml**
- **Found during:** Task 2 verification
- **Issue:** Plan acceptance criterion required "at least 8 fields equal TBD"; the populated mainnet config has 17 TBD slots in the actual TOML body (not counting the `TBD::oracle_svi::OracleSVIUpdated` shape placeholder which technically counts via `grep -q TBD`).
- **Fix:** No fix required — exceeds the floor. The 17 slots are intentional and span every address-shaped field that Phase 5 must fill.
- **Files modified:** none
- **Commit:** n/a (not a deviation, recording for clarity)

**No actual deviations.** Plan executed exactly as written. Schema parity gate passed on first run.

## Self-Check: PASSED

- `config/testnet.toml` exists at expected path: FOUND
- `config/mainnet.toml` exists at expected path: FOUND
- Commit `f314e55` (Task 1, testnet.toml): FOUND in `git log`
- Commit `e7c49d5` (Task 2, mainnet.toml): FOUND in `git log`
- Schema parity script output: `Schema parity OK (8 sections matched, top-level scalars matched)` — PASSED
- TOML parse on both files via `tomllib`: PASSED
- All boolean values are TOML booleans (not strings): VERIFIED via `is False` identity check

## Phase 5 Hand-Off Notes

Anything Phase 5 must do regarding these configs (preflight checklist source):

1. **Re-run schema parity check first thing.** `scripts/preflight.sh` should embed the exact tomllib diff used in Task 2's verify step. If parity ever fails, halt; investigate which side drifted and bring them back into lock-step.
2. **Iterate over the 17 mainnet TBD slots above and assert each is filled.** A simple grep `grep -n '"TBD"' config/mainnet.toml` should return zero matches before publish.
3. **Verify `[network].predict_server_url` shape.** Expected: `https://predict-server.mainnet.mystenlabs.com` per the testnet pattern. If Mysten has announced a different URL, update before publish.
4. **Flip `[contingency].predict_mainnet_shipped = true`** on the day-of if Predict mainnet is live; otherwise leave `false` and follow the DEPLOY-09 fallback documented in `docs/MAINNET-FUNDING.md` (Plan 06).
5. **Capture `deploy_tx_digest` from `sui client publish` output** into `[deepvault].deploy_tx_digest` immediately after publish — this is the only repudiation-resistant proof of the deploy event.
6. **Any future schema edit MUST update BOTH files.** If a Phase 4 indexer needs a new key (e.g., `[network].websocket_url`), the developer must add it to both `testnet.toml` and `mainnet.toml` in the same commit, or the parity gate will trip CI.

## Commits

- `f314e55` — feat(00-04): add config/testnet.toml runtime config (Pitfall 14 mitigation)
- `e7c49d5` — feat(00-04): add config/mainnet.toml TBD scaffold (Pitfall 14 mitigation)

## Files Created

- `config/testnet.toml` (62 lines) — testnet runtime config, populated
- `config/mainnet.toml` (62 lines) — mainnet runtime scaffold, 17 TBD slots
