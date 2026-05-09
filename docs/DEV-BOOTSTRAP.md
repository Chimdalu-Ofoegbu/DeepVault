# DeepVault Dev-Machine Bootstrap

One-shot setup guide for a fresh developer machine. Follow these in order.

## 1. Toolchain installation

### Sui CLI (pinned to mainnet-v1.71.1)

```bash
# Install suiup (one-time)
curl -fsSL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh

# Pin Sui CLI version
suiup install sui mainnet-v1.71.1
suiup default set sui mainnet-v1.71.1

# Verify
sui --version
# Expected output contains: sui 1.71.1
```

If suiup is unavailable, fall back to direct release download:
```bash
SUI_VERSION=mainnet-v1.71.1
# Linux:   sui-${SUI_VERSION}-ubuntu-x86_64.tgz
# macOS:   sui-${SUI_VERSION}-macos-arm64.tgz (or x86_64)
# Windows: use WSL Linux binary
curl -fsSL "https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/sui-${SUI_VERSION}-ubuntu-x86_64.tgz" -o /tmp/sui.tgz
mkdir -p ~/.sui/bin
tar -xzf /tmp/sui.tgz -C ~/.sui/bin
echo 'export PATH="$HOME/.sui/bin:$PATH"' >> ~/.bashrc
```

### Node.js + pnpm

```bash
# Node 22 LTS via your version manager (volta, fnm, nvm)
# Example with fnm:
fnm install 22
fnm use 22
node --version  # v22.x.x

# pnpm 10
npm install -g pnpm@10
pnpm --version  # 10.x.x
```

### Python + uv

```bash
# uv (one-time)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Verify
uv --version  # 0.5.x or later

# uv will install Python 3.12 automatically on first `uv sync`
```

### Bash / Git (Windows note)

This repo's shell scripts (`scripts/predict-diff.sh`) and Makefile require bash.

- **Linux/macOS:** Native bash. Done.
- **Windows:** Install [Git for Windows](https://gitforwindows.org) (ships Git Bash) OR use WSL2.
  - Verify: `bash --version` reports Bash >=4.x.
  - Run all `make` commands from Git Bash, NOT cmd.exe or PowerShell.

## 2. Repo install

```bash
git clone https://github.com/<owner>/deepvault.git
cd deepvault
pnpm install --frozen-lockfile     # installs indexer + dashboard workspaces
cd backtest && uv sync --locked && cd ..
make codegen                        # regenerates strategy_constants files (Plan 03)
make test                           # runs Move + TS + Python suites
```

## 3. Wallet provisioning (per CONTEXT.md D-06)

Two separate Sui keystores are required. NEVER reuse the same wallet for testnet churn and mainnet deploy.

### Testnet dev wallet (default keystore at ~/.sui/sui_config)

```bash
sui client new-address ed25519
sui client switch --env testnet
sui client active-address
# Fund via web faucet: https://faucet.testnet.sui.io
# Or CLI: sui client faucet --address <addr>
```

**Recorded testnet address:** `[TBD — run Task 4 of Plan 02]`

### Mainnet deploy wallet (isolated keystore at ~/.sui/sui_config_mainnet)

```bash
mkdir -p ~/.sui/sui_config_mainnet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client new-address ed25519
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client switch --env mainnet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client active-address
```

**Recorded mainnet address:** `[TBD — run Task 4 of Plan 02]`

**Funding:** DO NOT fund the mainnet wallet until Phase 5 (~Day 33). Funding flow is in `docs/MAINNET-FUNDING.md` (Plan 06).

### Key safety

- Both keystores live in `~/.sui/`, NEVER in this repo.
- `.gitignore` excludes `.sui/`, `**/.sui/`, `sui_config*/`, `*.keystore`.
- Backup the mainnet keystore (`~/.sui/sui_config_mainnet/sui.keystore`) to encrypted external storage **before** any mainnet activity.
- Mnemonic for both wallets stored in a password manager.

## 4. GitHub auth

For pushing to the public repo (D-10):

```bash
gh auth login   # GitHub CLI; follow browser prompt
# OR set up SSH keys per https://docs.github.com/en/authentication/connecting-to-github-with-ssh
```

## 5. Environment variables

No `.env` files are required for Phase 0. Phase 4 (indexer + dashboard) will introduce:
- `PREDICT_SERVER_URL` (testnet/mainnet)
- `SUI_RPC_URL`
- `RELAY_URL` (for dashboard → relay)

These will be documented in `indexer/.env.example` and `dashboard/.env.example` when Phase 4 lands. `.env` is `.gitignore`d.

## 6. Verification

After completing the above:

```bash
sui --version           # sui 1.71.1
node --version          # v22.x.x
pnpm --version          # 10.x.x
uv --version            # 0.5+ or later
bash --version          # 4+ (Git Bash on Windows)

cd <repo>
make install            # exits 0
make codegen            # exits 0 (Plan 03 wires this; until then, errors with helpful message)
make test               # exits 0
make lint               # exits 0
```

If any of these fail, the failure points to which tool is misconfigured.

## 7. Reference

- Toolchain pin rationale: `.planning/research/STACK.md`
- Wallet split rationale: `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` D-06
- Mainnet funding playbook: `docs/MAINNET-FUNDING.md` (Plan 06)
- Code-freeze + branch rules: `CONTRIBUTING.md` (Plan 06)
