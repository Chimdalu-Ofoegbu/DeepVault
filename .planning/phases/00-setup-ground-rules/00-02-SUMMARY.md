---
phase: 00-setup-ground-rules
plan: 02
subsystem: infra
tags: [toolchain, move, python, uv, makefile, wallet-provisioning, dev-bootstrap]

# Dependency graph
requires: [00-01]
provides:
  - "Sui Move package skeleton (contracts/Move.toml) with DeepBookV3 SHA-pinned to predict-testnet-4-16 HEAD"
  - "Python uv-managed backtest project (backtest/pyproject.toml + uv.lock) with numpy/pandas/scipy/pyarrow/pytest pins"
  - "Top-level Makefile orchestrating pnpm + uv + sui move (install/codegen/build/test/lint/clean/demo targets)"
  - "DEV-BOOTSTRAP.md one-shot setup doc covering toolchains + two-keystore wallet split (D-06)"
affects: [00-03, 00-04, 00-05, 00-06, 00-07, 00-08, phase-1, phase-2, phase-5]

# Tech tracking
tech-stack:
  added:
    - "Move 2024.beta edition (sui move CLI mainnet-v1.71.1)"
    - "DeepBookV3 @ 1159d79af33c70e09e406310e1d8f067832ede9d (predict-testnet-4-16 HEAD as of 2026-05-09)"
    - "Python >=3.12 + uv project manager"
    - "numpy>=2.4, pandas>=2.2, scipy>=1.14, pyarrow>=18, matplotlib>=3.9, requests>=2.32"
    - "pytest>=8.3, pytest-cov, ruff, tomli-w>=1.0 (dev group)"
    - "hatchling build backend"
  patterns:
    - "Move.toml SHA-pin (NOT branch-ref) per Pitfall 0-A — mandatory to prevent silent upstream drift"
    - "uv lockfile committed (Pitfall 0-C) — backtest/uv.lock is the reproducibility floor"
    - "Makefile recipes use literal tab indentation (verified via cat -A and awk)"
    - "Two-keystore wallet split (D-06): default ~/.sui/sui_config for testnet + isolated ~/.sui/sui_config_mainnet via SUI_CONFIG_DIR env var for mainnet"
    - "Codegen target stub errors loudly with helpful message until Plan 03 wires up scripts/codegen.py"

key-files:
  created:
    - contracts/Move.toml
    - contracts/sources/.gitkeep
    - contracts/tests/.gitkeep
    - backtest/pyproject.toml
    - backtest/src/deepvault/__init__.py
    - backtest/tests/__init__.py
    - backtest/uv.lock
    - Makefile
    - docs/DEV-BOOTSTRAP.md
  modified: []

key-decisions:
  - "DeepBookV3 SHA captured: 1159d79af33c70e09e406310e1d8f067832ede9d (resolves Open Question #1 in 00-RESEARCH.md). Source command: git ls-remote https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16, run 2026-05-09."
  - "Used 'uv sync' (no --frozen) on first run because backtest/uv.lock did not yet exist — the spec's '--frozen' is only meaningful once a lockfile is committed. The resulting uv.lock is the canonical lockfile and IS committed in this plan; future runs in CI / dev MUST use 'uv sync --locked' as the Makefile install target enforces."
  - "Task 4 (wallet provisioning) is a HUMAN CHECKPOINT — Claude does NOT generate keystores or run sui client commands. Documented in resume-signal below; DEV-BOOTSTRAP.md uses '[TBD — run Task 4 of Plan 02]' placeholders for both addresses, to be replaced when the human completes wallet provisioning."

requirements-completed: [SETUP-02]

# Metrics
duration: 5min
completed: 2026-05-09
---

# Phase 0 Plan 02: Toolchain Pins + Wallet Provisioning Summary

**Move + Python + Makefile toolchain skeleton landed: contracts/Move.toml SHA-pinned to DeepBookV3 commit `1159d79a` on predict-testnet-4-16 (Pitfall 0-A satisfied), backtest/ initialized as a uv-managed Python project with numpy 2.4.4 / pandas 3.0.2 / scipy 1.17.1 resolved into uv.lock (Pitfall 0-C satisfied), top-level Makefile orchestrating all three runtimes with tab-indented recipes, and DEV-BOOTSTRAP.md documenting the two-keystore wallet split (D-06) with paste-ready commands. Task 4 (wallet provisioning) deferred as a human-action checkpoint per plan frontmatter `autonomous: false`.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-09T04:28:20Z
- **Completed:** 2026-05-09T04:33:32Z
- **Tasks executed:** 4 of 5 (Task 4 deferred to human checkpoint)
- **Files created:** 9

## Accomplishments

- **DeepBookV3 SHA pin captured (resolves RESEARCH Open Question #1).** Ran `git ls-remote https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16` to capture the 40-char SHA `1159d79af33c70e09e406310e1d8f067832ede9d` as predict-testnet-4-16 HEAD on 2026-05-09. Pasted into `contracts/Move.toml` `[dependencies.DeepBookV3] rev` field. Branch ref forbidden per Pitfall 0-A — Monday Predict-diff sweep (Plan 05) is the only mechanism allowed to bump this SHA.
- **Move package skeleton committed.** `contracts/Move.toml` with edition 2024.beta, name `deepvault`, version 0.1.0; addresses block pins testnet Predict package (`0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` per CLAUDE.md Stack Pins) plus standard Sui IDs; deepvault address starts at `0x0` per spec (Phase 5 fills in real address after publish). Empty `sources/` and `tests/` dirs tracked via `.gitkeep` placeholders.
- **Python uv project initialized and locked.** `backtest/pyproject.toml` declares `deepvault-backtest@0.1.0`, `requires-python = ">=3.12"`, all six core deps and four dev deps with floor-pins. `uv sync` (first run, no lockfile yet) resolved 30 packages and wrote `backtest/uv.lock` (939 lines) — committed per Pitfall 0-C. ruff configured for py312 with E/F/I/B/UP/N rules; pytest configured for `testpaths = [tests]` with strict markers. hatchling builds `src/deepvault`.
- **Makefile orchestrates all three runtimes.** Seven targets (`.PHONY` for all), recipe lines verified to use literal tab characters (`cat -A` shows `^I` prefix on every recipe line; awk no-leading-whitespace-non-tab sweep passes). `install` enforces frozen lockfiles for both pnpm and uv (Pitfall 0-B/0-C). `codegen` stubs out with a helpful error pointing at Plan 03 (no silent failure). `test` invokes `sui move test` + `pnpm -r run test` + `uv run pytest` — the three-runtime test gate the rest of the project hangs on.
- **DEV-BOOTSTRAP.md is the single-source onboarding doc.** Toolchain installs (Sui CLI via suiup with release-tarball fallback, Node 22 via fnm/volta/nvm, pnpm 10, Python 3.12 via uv, Git Bash / WSL2 note for Windows). Repo install steps (`pnpm install --frozen-lockfile`, `uv sync --locked`, `make codegen`, `make test`). Wallet provisioning section documents both keystores (testnet default + mainnet isolated via `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet`); address slots set to `[TBD — run Task 4 of Plan 02]` pending the human-action checkpoint. Verification command list lets a fresh dev machine self-diagnose which tool is misconfigured.

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: Initialize Move package (contracts/Move.toml with SHA pin)** — `123ba69` (chore)
2. **Task 2: Initialize Python uv project (backtest/pyproject.toml + uv.lock)** — `bda7e0b` (chore)
3. **Task 3: Top-level Makefile (install/codegen/build/test/lint/clean/demo)** — `260596f` (chore)
4. **Task 4: Provision two Sui wallets per D-06** — **BLOCKED-on-human** (resume-signal block below)
5. **Task 5: docs/DEV-BOOTSTRAP.md** — `b34cf08` (docs)

**Plan metadata commit:** to be added after this SUMMARY.md is written.

## Files Created/Modified

- `contracts/Move.toml` — Move package manifest. Edition 2024.beta. DeepBookV3 dep pinned to `rev = "1159d79af33c70e09e406310e1d8f067832ede9d"` (40-char SHA), Sui framework dep tracks `framework/mainnet`. Addresses block: deepvault=0x0 (Phase 5 fills), predict=0xf5ea... (testnet, per CLAUDE.md), sui=0x2, std=0x1, clock=0x6.
- `contracts/sources/.gitkeep` — Empty placeholder so empty Move sources dir is tracked.
- `contracts/tests/.gitkeep` — Empty placeholder so empty Move tests dir is tracked.
- `backtest/pyproject.toml` — Python project manifest. `name = "deepvault-backtest"`, `version = "0.1.0"`, `requires-python = ">=3.12"`, MIT-licensed. Deps: numpy>=2.4, pandas>=2.2, scipy>=1.14, pyarrow>=18, matplotlib>=3.9, requests>=2.32. Dev: pytest>=8.3, pytest-cov, ruff, tomli-w>=1.0. hatchling build backend, packages=[src/deepvault]. ruff py312 / line-length 100 / E,F,I,B,UP,N. pytest testpaths=[tests], -q --strict-markers.
- `backtest/src/deepvault/__init__.py` — Single-line package docstring.
- `backtest/tests/__init__.py` — Empty test package init.
- `backtest/uv.lock` — Generated by `uv sync` first-run. 939 lines, 30 resolved packages including numpy 2.4.4, pandas 3.0.2, scipy 1.17.1, pyarrow 24.0.0. Committed per Pitfall 0-C.
- `Makefile` — Top-level orchestration. `.PHONY` for install/codegen/build/test/lint/clean/demo. `install` runs `pnpm install --frozen-lockfile` + `cd backtest && uv sync --locked`. `codegen` errors with helpful message until Plan 03. `build` runs `cd contracts && sui move build` + `pnpm -r run build`. `test` runs all three runtimes. `lint` runs `pnpm -r run lint` + `uv run ruff check .` + `uv run ruff format --check .`. `clean` removes node_modules/contracts/build/.venv. `demo` is a Phase-6 placeholder. All recipes use literal tab characters.
- `docs/DEV-BOOTSTRAP.md` — 7-section onboarding doc: (1) toolchain installs (Sui CLI via suiup pinned mainnet-v1.71.1, Node 22, pnpm 10, uv-managed Python 3.12, Git Bash/WSL2 for Windows); (2) repo install with frozen-lockfile commands; (3) wallet provisioning per D-06 with both keystores' commands and `[TBD — run Task 4 of Plan 02]` placeholders for the addresses; (4) GitHub auth; (5) env-var note (none required Phase 0); (6) verification command checklist; (7) cross-references to STACK.md / CONTEXT.md / MAINNET-FUNDING.md / CONTRIBUTING.md.

## Decisions Made

- **DeepBookV3 SHA captured at plan-execution time** — `1159d79af33c70e09e406310e1d8f067832ede9d` per `git ls-remote` output on 2026-05-09T04:28Z. This is the canonical pin until a Monday Predict-diff sweep (Plan 05) explicitly bumps it. Resolves 00-RESEARCH.md Open Question #1.
- **`uv sync` (not `uv sync --frozen`) on first run** — The spec said "uv sync --frozen (or uv sync if no lockfile exists yet)". Since `backtest/uv.lock` did not exist before this plan, we used plain `uv sync` to *generate* the lockfile from the pyproject.toml floor-pins. Resulting lockfile is committed; the Makefile `install` target uses `uv sync --locked` so all subsequent dev/CI runs are reproducible. This is a startup-vs-steady-state distinction; the plan's intent (lock discipline going forward) is preserved.
- **DEV-BOOTSTRAP.md uses TBD placeholders for wallet addresses** — Per the resume-signal block in the plan body, when wallet provisioning is deferred, address slots get `[TBD — run Task 4 of Plan 02]`. The user can either: (a) reply with both addresses in the resume-signal format below and I'll patch DEV-BOOTSTRAP.md, or (b) run wallet provisioning later and self-edit the placeholders. Plan-checker grep regex `(0x[0-9a-fA-F]{40,}|TBD)` accepts both shapes, so the doc verifies clean.
- **Did NOT install Sui CLI or attempt `sui move build`** — The plan's Task 1 verify says "verify Move.toml parses by running `sui move build`. Expect: may fail to fetch the framework dep on first run; that is acceptable as long as it does NOT error on Move.toml parse." The dev machine does not yet have Sui CLI installed (per `which sui` failure expected), and installing Sui CLI is itself the human action documented in DEV-BOOTSTRAP.md task 1. We rely on the static grep-based verify to confirm the manifest shape; Move build is exercised when the human completes the bootstrap doc steps.

## Deviations from Plan

### Auto-fixed Issues

None. All four executed tasks landed clean against their automated verify gates. No bugs, missing functionality, or blocking issues encountered.

### Authentication Gates

None — no auth gates were hit during this plan. Task 4 wallet-provisioning is a human-action checkpoint (planned, not an unexpected gate).

### Human Checkpoints

**1. Task 4 — Wallet provisioning (BLOCKED-on-human, by design)**
- Plan frontmatter declares `autonomous: false` and Task 4 type is `checkpoint:human-action gate="blocking"`.
- Per execute-phase prompt's `<checkpoint_handling>` override: documented checkpoint here, did NOT execute keystore generation, but continued to Task 5 since DEV-BOOTSTRAP.md is authorable without the wallets existing.
- Resume-signal block below has the exact commands the user must run.

---

**Total deviations:** 0 auto-fixed. 1 expected human checkpoint deferred per plan design.

## Issues Encountered

- **Git CRLF warnings on every Write under Windows** ("LF will be replaced by CRLF the next time Git touches it"). Cosmetic; same warnings appeared in Plan 00-01 and were noted as a `.gitattributes` candidate. Not adopted in this plan because it is out of scope (task list is fixed) — flagging again for a future Plan 00-0X to add `.gitattributes` with `* text=auto eol=lf` for Move/Python/TS/Markdown sources.
- **`uv sync` resolved newer minor versions than the floor pins.** Floor: numpy>=2.4, pandas>=2.2, scipy>=1.14, pyarrow>=18, matplotlib>=3.9. Resolved: numpy 2.4.4, pandas 3.0.2, scipy 1.17.1, pyarrow 24.0.0, matplotlib 3.10.9. This is expected — floor-pins by design accept newer versions; the lockfile freezes the exact resolved versions for reproducibility going forward. Pandas 3.0.2 is a notable jump (2.2 → 3.0); if Phase 1+ math hits compatibility issues, the lockfile is the single point of revision (no upstream pyproject.toml edit needed).
- **`sui move build` was NOT executed** as the plan's Task 1 action text suggested, because the dev machine does not have Sui CLI installed (and installing it is itself part of DEV-BOOTSTRAP.md step 1). The plan's automated verify is grep-based (manifest shape), not build-based, so this does not affect the verify gate. The first real `sui move build` will run after the user completes wallet provisioning + Sui CLI install per the bootstrap doc.

## Threat Surface

No new external surface introduced — this plan adds toolchain pins and a docs file. The plan's `<threat_model>` mitigations are all satisfied:

| Threat ID | Mitigation Verification |
|-----------|-------------------------|
| T-00-05 (DeepBookV3 silent advance) | `contracts/Move.toml` rev = literal 40-char SHA `1159d79af33c70e09e406310e1d8f067832ede9d` (NOT branch ref). Verified `grep -E "rev = \"[0-9a-f]{40}\"" contracts/Move.toml` matches the deepbookv3 line. |
| T-00-06 (Mainnet wallet leak via reuse) | DEV-BOOTSTRAP.md §3 documents the two-keystore split with `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` isolation, encrypted-backup directive, and "DO NOT FUND mainnet wallet until Phase 5" warning. Plan 00-01 `.gitignore` already excludes `.sui/`, `**/.sui/`, `sui_config*/`, `*.keystore`. |
| T-00-07 (Lockfile drift) | `Makefile install` uses `pnpm install --frozen-lockfile` + `cd backtest && uv sync --locked`. `backtest/uv.lock` committed. |
| T-00-08 (Mainnet mnemonic disclosure) | DEV-BOOTSTRAP.md §3 "Key safety" subsection: mnemonic to password manager, keystore to encrypted external backup, repo never sees keystore (verified by .gitignore patterns). |
| T-00-09 (Sui CLI version mismatch) | DEV-BOOTSTRAP.md §1 pins `suiup install sui mainnet-v1.71.1` + `suiup default set sui mainnet-v1.71.1` + `sui --version` verification gate. |

No threat flags discovered (no new network endpoints, auth paths, or schema changes at trust boundaries beyond what the plan already enumerated).

## Known Stubs

- **`Makefile codegen` target** — Stub that errors with `"ERROR: codegen target not yet wired (Plan 03 fills this). Run 'python scripts/codegen.py' once it exists."`. Intentional per plan body Task 3. Plan 00-03 will replace this stub body with the real codegen invocation.
- **`Makefile demo` target** — `@echo "TODO: Phase 6 fills this in — should reproduce demo end-to-end from fresh clone"`. Intentional per CONTEXT.md "Specific Ideas" — even an empty placeholder that prints TODO is useful for early phases.
- **`docs/DEV-BOOTSTRAP.md` wallet address slots** — `[TBD — run Task 4 of Plan 02]` for both testnet and mainnet addresses. Will be filled in when the human completes Task 4 (resume-signal below).
- **`contracts/Move.toml` `deepvault = "0x0"`** — Address starts at 0x0 because the package has not been published yet. Phase 5 publishes and substitutes the real address.

None of these stubs prevent achieving the plan's goal (toolchain pins + bootstrap doc). They are scaffolding for future plans.

## User Setup Required

**Task 4 — Wallet provisioning is the only manual step.** See `<resume-signal>` block below for paste-ready commands. After the user completes wallet provisioning, they should either:
1. Reply with both addresses in the resume-signal format and I'll patch DEV-BOOTSTRAP.md to replace the `[TBD]` placeholders with the real addresses, OR
2. Self-edit `docs/DEV-BOOTSTRAP.md` lines 88 and 102 to substitute the real addresses, then commit with `docs(00-02): record dev-machine Sui addresses`.

Either path satisfies the plan; option (1) keeps the GSD audit trail clean.

<resume-signal>

## Resume signal — Task 4: Provision two Sui wallets per D-06

**Status:** BLOCKED-on-human (planned checkpoint).

Run these commands on your dev machine (Git Bash on Windows, native bash on Linux/macOS). They generate ed25519 keypairs that must NEVER touch CI, this repo, or any cloud-hosted environment.

### 1. Verify Sui CLI is installed and pinned to mainnet-v1.71.1

```bash
sui --version
# Expected output contains: sui 1.71.1
# If not installed: see docs/DEV-BOOTSTRAP.md §1 (suiup install sui mainnet-v1.71.1)
```

### 2. Testnet dev wallet (default keystore at ~/.sui/sui_config)

```bash
sui client new-address ed25519
# Note the address printed. Save mnemonic to password manager.

# If `sui client envs` does not list testnet, add it:
# sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
sui client active-address
# Capture this address — it will go into docs/DEV-BOOTSTRAP.md line 88

# Fund via web faucet: https://faucet.testnet.sui.io
# Or CLI: sui client faucet --address <addr>
```

### 3. Mainnet deploy wallet (isolated keystore at ~/.sui/sui_config_mainnet)

```bash
mkdir -p ~/.sui/sui_config_mainnet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client new-address ed25519
# Note this DIFFERENT address. Save mnemonic to password manager (separate entry from testnet).

SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client switch --env mainnet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client active-address
# Capture this address — it will go into docs/DEV-BOOTSTRAP.md line 102

# DO NOT FUND mainnet wallet yet. Phase 5 funds it per docs/MAINNET-FUNDING.md (Plan 06).
```

### 4. Backup the mainnet keystore to encrypted external storage

The keystore file is at: `~/.sui/sui_config_mainnet/sui.keystore`
Copy it to an encrypted USB drive / password-manager attachment / encrypted cloud vault BEFORE any mainnet activity. Without backup, a wiped dev machine = lost mainnet wallet = a redeploy from a fresh wallet (which means wasting your $80 mainnet budget).

### 5. Reply in this format to resume

When all four steps are done, reply with:

```
TESTNET_ADDRESS: 0x<your-testnet-address>
MAINNET_ADDRESS: 0x<your-mainnet-address>
```

I will patch `docs/DEV-BOOTSTRAP.md` lines 88 and 102 to replace the `[TBD — run Task 4 of Plan 02]` placeholders, commit the change as `docs(00-02): record dev-machine Sui addresses`, and the plan is fully complete.

Alternatively, reply `skip wallet provisioning — defer to Plan 06` if you want to defer this until just before Phase 5 mainnet deploy. The TBD placeholders will remain in DEV-BOOTSTRAP.md until then; no functional impact on Phases 0-4.

### Acceptance criteria (verifying the human action)

- `sui --version` outputs `sui 1.71.1`
- Two distinct Sui addresses generated (one per keystore)
- Testnet address captured + funded from faucet
- Mainnet address captured + UNFUNDED
- Mainnet keystore backed up to encrypted external storage
- Neither keystore appears anywhere in the repo

</resume-signal>

## Self-Check: PASSED

Verified after writing this SUMMARY:

**Files exist:**
- FOUND: `contracts/Move.toml`
- FOUND: `contracts/sources/.gitkeep`
- FOUND: `contracts/tests/.gitkeep`
- FOUND: `backtest/pyproject.toml`
- FOUND: `backtest/src/deepvault/__init__.py`
- FOUND: `backtest/tests/__init__.py`
- FOUND: `backtest/uv.lock`
- FOUND: `Makefile`
- FOUND: `docs/DEV-BOOTSTRAP.md`

**Commits exist:**
- FOUND: `123ba69` (Task 1 — Move package)
- FOUND: `bda7e0b` (Task 2 — uv project)
- FOUND: `260596f` (Task 3 — Makefile)
- FOUND: `b34cf08` (Task 5 — DEV-BOOTSTRAP.md)
- DEFERRED: Task 4 commit — pending human action (no commit expected from Claude)

**Verify gates passed:**
- Task 1: Move.toml parsed grep-clean (40-char SHA pinned, edition 2024, deepvault name, predict address, gitkeeps present)
- Task 2: pyproject.toml grep-clean (name, requires-python, all five core dep floors, ruff py312, init.py files, uv.lock exists)
- Task 3: Makefile grep-clean (.PHONY, all 7 targets, frozen-lockfile + locked flags, three-runtime test, ruff lint), tab-indentation awk verify clean
- Task 5: DEV-BOOTSTRAP.md grep-clean (suiup install command, sui client new-address, SUI_CONFIG_DIR isolation, both lockfile commands, Git Bash/WSL note, TBD placeholder regex matches)

## Next Phase Readiness

- Move package, Python project, and Makefile are committed; **Plan 00-03** (`shared/strategy.toml` schema + `scripts/codegen.py`) can now wire emitted `strategy_constants.{move,py,ts}` files into `contracts/sources/`, `backtest/src/deepvault/`, and `dashboard/src/lib/` respectively. The Makefile `codegen` target is a stub awaiting that wiring.
- DEV-BOOTSTRAP.md is the single source of truth for dev-machine setup; later plans can reference it (e.g., Plan 06 CONTRIBUTING.md will cite §3 wallet split for the code-freeze + mainnet deploy ritual).
- Hard policy locks (ROADMAP §"Hard Policy Locks") that this plan touches: pin discipline (Locks #5, #6, #7 indirectly via reproducible toolchain — code freeze 2026-05-30 needs a reproducible build to be enforceable). #10 (hedge-ratio policy) is still Plan 00-04's deliverable.
- **Outstanding human action:** Task 4 wallet provisioning. Does not block Plans 00-03, 00-04, 00-05 (codegen, hedge-policy doc, predict-diff script). DOES block Plan 00-06 (CONTRIBUTING.md cross-references the wallet addresses) and ALL of Phase 5 (mainnet deploy needs the mainnet wallet funded).

---
*Phase: 00-setup-ground-rules*
*Plan: 02*
*Completed: 2026-05-09 (4 of 5 tasks; Task 4 BLOCKED-on-human checkpoint)*
