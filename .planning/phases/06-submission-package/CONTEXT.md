# Phase 6 Context — Submission Package

**Provenance:** Decisions captured 2026-06-15 during an **authorized unattended autonomous run**. The
user delegated execution of the remaining phases ("run everything on auto … choose recommended
options during discussions … I won't be available to click them manually") and asked to gate only at
`git push` and other irreversible/out-of-scope actions. Every **LOCKED DECISION** below is the
recommended option chosen on the user's behalf under that delegation — treat as user-confirmed; do
NOT re-ask. (Mirrors how Phase 04.2's CONTEXT was captured in lieu of a formal `/gsd-discuss-phase`.)

## Phase Goal

A polished Devpost submission package for Sui Overflow 2026 (DeepBook track): README + architecture
diagram + strategy whitepaper rendered, backtest report exported, demo-video script and Devpost draft
prepared — all bundled for filing by the submission deadline. **Demo target is TESTNET** (per the
Phase 5 reshape: Predict mainnet did not ship in the submission window; a ~10s mainnet-readiness
sidebar covers post-submission deploy posture).

Phase requirements: **DEPLOY-05, DEPLOY-06, DEPLOY-07, DEPLOY-08, DEPLOY-10** (DEPLOY-09 already
Complete in Phase 5).

## Autonomy Boundary (CRITICAL — drives task `autonomous` flags)

This phase is being executed unattended. Tasks split into two classes:

**AUTONOMOUS (produce now, fully):**
- **DEPLOY-06** — README cold-read polish.
- **DEPLOY-07** — architecture diagram (SVG).
- **DEPLOY-08** — strategy whitepaper.
- Backtest HTML report export (feeds the DEPLOY-10 bundle; renderer already exists from Phase 03-09).
- **DEPLOY-05 (preparatory)** — the shot-by-shot demo-video **script/storyboard** + exact testnet PTB
  commands to film + the mainnet-readiness sidebar narration.
- **DEPLOY-10 (preparatory)** — the complete Devpost **submission draft** (all fields filled).

**HUMAN-ACTION CHECKPOINTS (`autonomous: false` — DO NOT execute; document and hold for the user):**
- **DEPLOY-05 (recording)** — actually recording the demo video (needs a human + a funded testnet
  wallet running live PTBs on camera). The plan delivers the script; the recording is the user's.
- **DEPLOY-10 (filing)** — actually submitting on the Devpost / Sui Overflow portal (external
  publishing; needs the user's account + the recorded video link). The plan delivers the draft; the
  filing is the user's.
- **(Already deferred, out of scope here)** — mainnet redeploy (needs funds + private key; Predict not
  on mainnet; covered by `docs/MAINNET-READINESS.md`, DEPLOY-09).

Each human-action checkpoint task MUST still exist in a plan (so the requirement is tracked and the
coverage gate passes) and MUST produce its preparatory artifact, with a clear `autonomous: false`
checkpoint describing exactly what the user does.

## Locked Decisions

- **LD-1 — Honesty bar (non-negotiable).** The whitepaper, README, and Devpost draft use ONLY real
  numbers from the committed Phase 03 backtest outputs (`reports/full-365d.json` / the rendered
  report). Modest, believable returns with honest drawdown and hedge-cost drag — NO fabricated,
  rounded-up, or implausible figures. If a number isn't in a committed artifact, it is not published.
  Every performance claim cites its source artifact. (Honors the standing "ship no implausible
  numbers" constraint.)
- **LD-2 — Strategy whitepaper** → `docs/WHITEPAPER.md` (Markdown, GitHub-renderable, Gatheral-style,
  target 6–12 "pages" of content). MUST cover, with citations: (a) SSVI / raw-SVI math (cite Gatheral
  & Jacquier 2014, "Arbitrage-free SVI volatility surfaces"); (b) the hedge price formula (binary /
  digital pricing off the SVI surface as implemented in the Predict oracle clone); (c) sizing policy
  bounds (fixed `allocation_bps = 1000` = 10%, `strike_otm_bps = 1500`, `tenor = 14d`,
  `roll_trigger = 2d` — from `shared/strategy.toml` / `docs/HEDGE-POLICY.md`); (d) a
  liquidation-under-worst-case-Predict-outcome section (the −60% compound shock analysis from Phase
  03-07); (e) risk disclosures. Source the math from `shared/svi-spec.md`, the golden vectors, and the
  three-way parity gate; source returns from the backtest report.
- **LD-3 — Architecture diagram** → `docs/architecture.svg`, hand-authored SVG (GitHub-renderable as a
  committed file; no build dependency). Depict the FOUR tiers — (1) Move package (vault + Predict
  adapter + SVI evaluator on Sui), (2) event relay/indexer (Node `queryEvents` → WS), (3) React
  dashboard (Vault + Risk Studio), (4) Python backtest harness — with data-flow arrows, and call out
  the two-protocol single-PTB composability moment (Margin + Predict + vault share atomic open).
  Embed/reference it in the README.
- **LD-4 — README** → polish the EXISTING `README.md` (already advanced in Phase 0/5; do not rewrite
  from scratch). Guarantee the DEPLOY-06 cold-read criteria: one-paragraph laypitch, glossary,
  prerequisites, a reproducible `make demo` (→ `scripts/testnet-smoke-test.sh`) path, testnet contract
  addresses, and links to the whitepaper, the exported backtest report, the architecture diagram, and
  `docs/MAINNET-READINESS.md`. The cold-read test itself (a fresh-eyes pass) is part of acceptance.
- **LD-5 — Demo-video script** → `docs/DEMO-SCRIPT.md`: a shot-by-shot ~3-minute storyboard (timestamps,
  on-screen narration, the exact testnet PTB command(s) to run on camera, where the wallet-diff and the
  pasteable tx digest appear, and the ~10s mainnet-readiness sidebar). This is the autonomous
  deliverable for DEPLOY-05; the recording is a human-action checkpoint.
- **LD-6 — Devpost draft** → `docs/DEVPOST-SUBMISSION.md`: a complete, paste-ready draft with title,
  tagline, the four standard Devpost sections (inspiration / what it does / how we built it /
  challenges / accomplishments / what's next), testnet contract addresses, repo URL, a demo-video-link
  placeholder, the backtest-report link, and the mainnet-readiness pointer. This is the autonomous
  deliverable for DEPLOY-10; filing on the portal is a human-action checkpoint.
- **LD-7 — Backtest report export** → run the existing Phase 03-09 report CLI
  (`python -m deepvault walk_forward --window-days 365 --out reports/full-365d.json` then the HTML
  renderer) to produce/refresh `reports/full-365d-report.html` as the attachable artifact. If the
  committed report already exists and is current, reuse it; otherwise regenerate. Do NOT hand-edit the
  numbers.

## Canonical References (downstream agents MUST read before writing)

- `README.md` (existing — polish, don't replace)
- `docs/MAINNET-READINESS.md` (DEPLOY-09 — referenced by README + demo sidebar + Devpost)
- `docs/HEDGE-POLICY.md` (sizing policy bounds for the whitepaper)
- `shared/svi-spec.md` + `shared/strategy.toml` + `shared/golden-vectors.json` (SVI math + locked params)
- `reports/` (the backtest report + JSON — source of ALL published return numbers)
- `TESTNET-DEPLOY.json` (canonical testnet contract addresses for README + Devpost)
- `scripts/testnet-smoke-test.sh` (the `make demo` target) + `Makefile`
- Phase 03-07 liquidation analysis (worst-case-Predict section) and Phase 01 parity-gate artifacts

## Constraints

- **Submission deadline 2026-06-16** (ROADMAP); the user's working target is 2026-06-19. Keep artifacts
  filing-ready.
- **GitHub-renderable** outputs (Markdown + committed SVG); no exotic build steps for a judge.
- **Honesty bar (LD-1)** overrides any temptation to inflate.
- Route all file creation through GSD execute-phase (no direct edits outside the workflow).

## Out of Scope / Human-Action (held for the user)

- Recording the demo video (DEPLOY-05 recording) — script delivered, recording is the user's.
- Filing on Devpost / Sui Overflow portal (DEPLOY-10 filing) — draft delivered, filing is the user's.
- Mainnet redeploy (deferred to post-submission per DEPLOY-09 / `docs/MAINNET-READINESS.md`).
- `git push` (gated by the user explicitly).

## Open Questions (resolved with recommendation; do not block)

- **Whitepaper format:** Markdown (`docs/WHITEPAPER.md`) vs PDF. Recommendation: Markdown — GitHub-
  renderable, diffable, no toolchain; a judge reads it inline. (PDF export is a trivial post-step the
  user can do from Markdown if the portal wants a file.)
- **Diagram authoring:** hand-authored SVG vs Mermaid-in-README. Recommendation: committed SVG
  (`docs/architecture.svg`) for precise 4-tier layout + crisp render, referenced from the README.
- **Backtest report:** regenerate vs reuse committed. Recommendation: reuse if current; regenerate only
  if stale or missing — never hand-edit numbers (LD-1).
