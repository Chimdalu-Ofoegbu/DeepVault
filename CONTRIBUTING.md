# Contributing to DeepVault

DeepVault is a solo Sui Overflow 2026 hackathon submission with a hard 2026-06-16 ship date. This document records the policy locks every contribution honors. **Read before opening a PR or pushing to main.**

## Hard policy locks

These are not guidelines — they are the rails. The cost of violating them is documented in `.planning/research/PITFALLS.md`.

### 1. Code freeze: 2026-05-30

After **2026-05-30 (Day 22 of 39)**, the only commits permitted are:

- Bug fixes (with a linked Issue or test demonstrating the bug)
- Integration glue between already-shipped modules
- Documentation, README, demo-script edits
- Mainnet deploy + smoke-test code (Phase 5)

**Forbidden after code freeze:**
- Internal architecture changes to `vault::` core (`supply`, `redeem`, `rebalance`)
- New features outside the active Phase 0–6 scope
- Renaming public APIs
- Refactors of working code "for cleanliness"

If a change feels like it crosses this line, the answer is: open a v2 issue, write a TODO comment, move on.

### 2. No refactor after vault ships

Once the vault Move package passes its Phase 2 testnet end-to-end test (~Day 17), the internal architecture is **frozen** until submission. Refactor temptation is the #1 documented schedule killer for this project class (see `.planning/research/PITFALLS.md` Pitfall 18).

**Test:** "Does this refactor unblock a specific feature on the active list?"
- Yes → write the change, link the unblocked feature in the commit message
- No → don't write it; open a v2 issue if it's worth remembering

Branches named `refactor/*` longer than 2 days are a smell — close them.

### 3. No dashboard work before vault feature-complete

Phase 4 (dashboard + relay) cannot start until Phase 2 (vault Move package) is closed and Phase 3 Track A (two-protocol PTB) is at least integration-tested. CSS commits in Week 2 are a regression of this rule. (See `.planning/research/PITFALLS.md` Pitfall 19.)

**Order is not a suggestion:** vault → backtest → SVI → composition → dashboard → submission.

### 4. Hedge-ratio policy is locked

The hedge-ratio policy below is committed in writing **before backtest opens** to lock against hindsight tuning (see `docs/HEDGE-POLICY.md` for the full ADR). Numbers come from `shared/strategy.toml [hedge_policy]` and may be re-tuned **only** during Phase 3 backtest, on out-of-sample-aware walk-forward analysis. Once Phase 3 closes, the policy is **frozen permanently** — no re-tuning after testnet stress test or after seeing mainnet behavior.

**Locked numbers (v1, fixed-ratio v1):**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Allocation | 10% of new deposit (`allocation_bps = 1000`) | Standard DOV-class tail-hedge sizing; preserves most PLP APY |
| Strike | -15% OTM (`strike_otm_bps = 1500`) | Crash insurance framing; pays on -2σ to -3σ weekly moves |
| Tenor | 14 days (`tenor_seconds = 1209600`) | Cleaner accounting than 7-day rolling |
| Roll trigger | Expiry < 2 days (`roll_trigger_seconds = 172800`) | One roll per ~12-day cycle |
| Sizing function | Fixed (`sizing_function = "fixed"`); parameterized for future dynamic | Correct fixed > buggy dynamic under time pressure |

Full rationale and alternatives considered: `docs/HEDGE-POLICY.md`.

### 5. Weekly Monday Predict sweep is non-negotiable

Every Monday at 14:00 UTC (09:00 ET / 06:00 PT), GitHub Actions runs `scripts/predict-diff.sh` and creates a triage Issue. If the issue reports a **breaking change** to `predict::supply`, `predict::mint`, or `OracleSVIUpdated`:

1. Add label `blocking` to the issue
2. Halt feature work on the active phase
3. Update `vault::predict_adapter` to match the new ABI
4. Re-run integration suite
5. Resume feature work only when CI is green

Pitfall 6 (`.planning/research/PITFALLS.md`) documents the cost of skipping this ritual. The state file `.predict-diff-state` advances **only after a human triages** — never auto-advanced.

## Branch strategy

`main` only. Push directly. CI is the gate (required status checks: `move`, `ts`, `python`, `codegen-drift`, `parity`). No feature branches, no PR reviews — solo build, no second reviewer adds value.

## Editing generated code

Files marked `// AUTO-GENERATED — DO NOT EDIT` (or `# AUTO-GENERATED`) are emitted by `scripts/codegen.py` from `shared/strategy.toml`. Editing them directly is reverted on next codegen run.

To change a constant:

1. Edit `shared/strategy.toml`
2. Run `make codegen` (or `python scripts/codegen.py`)
3. Commit the TOML change AND the regenerated files together
4. CI's `codegen-drift` job verifies you didn't forget step 2

**Hedge-policy fields** (`[hedge_policy]` table) are POLICY changes — they require a paired update to `docs/HEDGE-POLICY.md` ADR section "Decision" + a `POLICY:` commit-message prefix.

## Commit log conventions

- Subject: imperative mood, ≤72 chars (e.g., "feat(vault): add token-bucket refill cap")
- Reference REQ-IDs where relevant (e.g., "closes SETUP-08")
- For policy changes: include "POLICY: ..." prefix and link the relevant ADR

## Build log discipline

The `## Build log` section in `README.md` is **append-only**. Never edit history; never delete entries. Weekly bullet update on Sunday evenings:

```
### Week N (YYYY-MM-DD to YYYY-MM-DD)
- Phase X completed: ...
- Pitfall hit / mitigated: ...
- Slack remaining: M days
```

Hackathon hygiene; judges will skim it.

## Ship-date hard locks

| Lock | Date | Source |
|------|------|--------|
| Code freeze | **2026-05-30** | This file §1 |
| Mainnet smoke test | 2026-06-12 | ROADMAP Hard Policy Locks #6 |
| Demo recording (mainnet) | 2026-06-13 to 2026-06-15 | ROADMAP Hard Policy Locks #7 |
| Submission | 2026-06-16 | Sui Overflow 2026 deadline |

Missing any of these is a phase-replanning trigger, not a schedule slip.

## References

- `docs/HEDGE-POLICY.md` — full hedge-ratio policy ADR
- `docs/MAINNET-FUNDING.md` — Phase 5 mainnet deploy playbook
- `docs/DEV-BOOTSTRAP.md` — fresh-machine setup guide
- `.planning/research/PITFALLS.md` — exhaustive pitfall catalog with mitigations
- `.planning/ROADMAP.md` §"Hard Policy Locks" — non-cuttable constraints
