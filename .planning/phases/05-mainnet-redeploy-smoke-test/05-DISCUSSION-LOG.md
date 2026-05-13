# Phase 5: Mainnet Redeploy + Smoke Test - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 05-mainnet-redeploy-smoke-test
**Areas discussed:** Phase 5 scope, smoke test granularity, Predict-mainnet trigger, fallback PTB shape, NAV tolerance, Predict trigger run

---

## Phase 5 Scope Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Move only | Phase 5 publishes the Move package + smoke-tests on mainnet. Vercel/Render deploys move to Phase 6 demo prep — cleaner scope, lower coupling, hosting can be done in parallel with demo recording. Hosting TBD slots in config/mainnet.toml are filled by Phase 6. | ✓ |
| Move + hosting both | Phase 5 does everything: Move publish, smoke test, AND Vercel/Render deploys. Gives a live URL ready for Phase 6 — but couples deploy risks. | |

**User's choice:** Move only (Recommended)
**Notes:** Cleaner blast radius — if mainnet smoke fails, hosting work hasn't been done unnecessarily; if hosting work needed re-doing, Phase 5 on-chain work isn't delayed. Phase 6 has time to pick up hosting in parallel with demo recording.

---

## Smoke Test Granularity (DEPLOY-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Staged with checkpoints | Each step (deposit → check NAV → hedge → check exposure → redeem-request → wait → redeem-fulfill → final NAV check) is its own script call with an explicit verification gate. If step N fails, we have a clean abort + AdminCap pause window. Slightly longer to execute but maximum forensic value. | ✓ |
| Single end-to-end script | One `scripts/mainnet-smoke-test.sh` runs the entire cycle; verification only at the end (NAV-per-share tolerance). Faster, cheaper, less moving parts — but if step 3 fails, you've already burned gas on steps 1-2 and recovering state is manual. | |

**User's choice:** Staged with checkpoints (Recommended)
**Notes:** Per-step gating is non-negotiable for a real-funds mainnet test. The AdminCap pause window between stages is the operator's emergency action if the smoke test reveals a state-corrupting bug.

---

## Predict-Mainnet Contingency Trigger (DEPLOY-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Programmatic at 09:00 UTC | `scripts/predict-mainnet-check.sh` runs at 09:00 UTC 2026-06-09 — queries mainnet RPC for the Predict package, attempts a read-only call. If it succeeds AND ABI matches testnet-4-16 branch, set `predict_mainnet_shipped=true`. Otherwise: lock fallback. Deterministic, recordable. | ✓ |
| Manual check by end-of-day 2026-06-09 | You check Mysten's announcements + Sui Discord by EOD 2026-06-09 and flip the flag manually. More flexible (you can negotiate with Mysten if Predict is 1 day late) but less rigorous. | |
| Programmatic at submission-3-days (2026-06-13) | Push the trigger to 2026-06-13 (3 days before submission) to give Predict mainnet more chances to ship. Higher risk — if Predict ships 2026-06-13 with breaking changes, no time to integrate. | |

**User's choice:** Programmatic at 09:00 UTC (Recommended)
**Notes:** 09:00 UTC on 2026-06-09 gives a 3-day buffer between trigger and the 2026-06-12 smoke test deadline. Sufficient time to integrate-or-fallback.

---

## Fallback PTB Demo Shape (DEPLOY-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Split demo: testnet PTB + mainnet supply/redeem | Demo video shows TWO sequences: (1) full PTB on testnet with Margin + Predict + vault hedge (already working from Phase 3), and (2) separate mainnet deposit/redeem cycle (no Predict integration on mainnet). README documents the split + rationale. Matches `docs/MAINNET-FUNDING.md` current fallback note. Lowest risk. | ✓ |
| Mainnet supply/redeem only + virtual hedge stub | Mainnet vault calls `vault::supply` + `vault::redeem` normally; `vault::rebalance` is replaced with a STUB that records a 'virtual hedge' (no Predict call). Code path is exercised on mainnet; no funds at hedge risk. Slightly more code work but mainnet shows hedge accounting fields. | |
| Mainnet supply/redeem only, no hedge mention | Mainnet shows pure vault deposit/redeem (no hedge at all). Simplest. Submission narrative becomes 'PLP yield with hedge math validated in backtest + testnet PTB; hedge purchase will activate when Predict mainnet ships.' Most defensible to judges if Predict slips. | |

**User's choice:** Split demo: testnet PTB + mainnet supply/redeem (Recommended)
**Notes:** Aligns with the existing `docs/MAINNET-FUNDING.md` fallback documentation. Phase 3 already produced the full PTB on testnet, so the testnet half of the demo is shovel-ready.

---

## NAV Tolerance Band

| Option | Description | Selected |
|--------|-------------|----------|
| ± hedge cost only | Post-redeem NAV-per-share must equal pre-deposit NAV-per-share minus the hedge cost (which is the expected cost for the held hedge). Any deviation beyond ±10 bps of this expected value = FAIL. Tight, matches the brief's 'PLP yield minus crash insurance' thesis exactly. | ✓ |
| ±50 bps (looser) | Accept any NAV-per-share movement within ±50 bps of pre-deposit value. Catches catastrophic bugs (accounting drift, hedge mispriced) but tolerates small Cetus slippage / micro fees. Safer for first mainnet test. | |
| Documented, no hard gate | Record the NAV delta; don't auto-fail the smoke test on numeric grounds. If smoke test 'completes' without reverting, mark Phase 5 done. NAV-delta analysis becomes a Phase 6 README artifact rather than a gate. Lowest risk to deadline. | |

**User's choice:** ± hedge cost only (Recommended)
**Notes:** Tight tolerance matches the brief's economic thesis — judges will scrutinize NAV accounting. ±10 bps is the institutional floor.

---

## Predict-Mainnet Check Execution

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Action + manual confirm | `.github/workflows/predict-mainnet-check.yml` cron runs at 09:00 UTC 2026-06-09. Result posted as a GitHub Issue with 'shipped: true/false' + ABI-match status. You review and merge a config commit to flip `predict_mainnet_shipped`. Automated + human-gated. | ✓ |
| GitHub Action auto-commits | Same Action, but it auto-commits the config flip to master without human review. Fully automated — if the script reports shipped+ABI-match, master gets a commit moving Phase 5 toward the live-Predict path. Faster but no human in the loop on contract-version validation. | |
| Manual you (no automation) | You run the script yourself on 2026-06-09 morning, commit the result manually. Simplest, no CI dance, but easy to forget on the day. Sets a calendar reminder + a fallback that defaults to false if you haven't flipped it. | |

**User's choice:** GitHub Action + manual confirm (Recommended)
**Notes:** Automated detection ensures the check actually runs on the day; human review on the contract-version comparison catches ABI drift that automation could miss (e.g., field rename that's safe vs structural change requiring re-integration).

---

## Claude's Discretion

- Script invocation pattern: `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` prefix per Phase 0 D-06; no ambient `sui client switch` state
- Deployment output capture: `MAINNET-DEPLOY.json` mirroring `TESTNET-DEPLOY.json` schema
- AdminCap retention policy: held by deploy wallet for Phase 5 + Phase 6 window; post-submission burn is backlog
- Preflight artifact: bash script (`scripts/preflight.sh`); reuses helpers from `e2e-vault-deploy.sh`
- Smoke test gas budget: `--gas-budget 500000000` per step (matches `e2e-vault-deploy.sh`)
- Token-bucket wait: `WITHDRAWAL_BUCKET_REFILL_MS_PER_USER + 5s` from `shared/strategy.toml` (no hardcoded value)

## Deferred Ideas

- Multisig governance for AdminCap — post-submission backlog
- Mainnet RPC failover / multi-endpoint — post-submission infra hardening
- AdminCap burn after smoke test — v1 keeps it; post-submission decision
- Custom mainnet domain — Phase 0 D-16 closed
- Vercel + Render hosting deploys pointing at mainnet — moved to Phase 6 demo prep per D-01
- Demo video recording — Phase 6 scope
- Recording wallet provisioning + funding — Phase 6 scope
