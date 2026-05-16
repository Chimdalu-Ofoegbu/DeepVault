# DeepVault Makefile — orchestrates pnpm, uv, and sui move across the monorepo.
# Targets:
#   install   — install all language deps (frozen lockfiles)
#   codegen   — regenerate strategy_constants from shared/strategy.toml (Plan 03 wires this up)
#   build     — codegen + pnpm -r build + sui move build
#   test      — sui move test + pnpm -r test + uv run pytest
#   lint      — pnpm -r lint + ruff check + ruff format --check
#   clean     — remove node_modules, .venv, contracts/build
#   demo      — judge-facing testnet smoke test (scripts/testnet-smoke-test.sh)

.PHONY: install codegen build test lint clean demo

install:
	pnpm install --frozen-lockfile
	cd backtest && uv sync --locked

codegen:
	cd backtest && uv run --no-project python ../scripts/codegen.py
	@echo "Generated constants files. Don't edit them directly."

build: codegen
	cd contracts && sui move build
	pnpm -r run build

test:
	cd contracts && sui move test
	pnpm -r run test
	cd backtest && uv run pytest

lint:
	pnpm -r run lint
	cd backtest && uv run ruff check . && uv run ruff format --check .

clean:
	rm -rf node_modules
	rm -rf indexer/node_modules dashboard/node_modules
	rm -rf contracts/build
	rm -rf backtest/.venv

demo:
	@echo "==> Running testnet smoke test (judge-facing demo cycle)."
	@echo "    Requires SUI_PRIVATE_KEY + ORACLE_SVI_ID env vars."
	@echo "    See docs/DEV-BOOTSTRAP.md for ephemeral testnet keypair setup."
	@echo "    Wall-clock duration: ~1 hour (REDEMPTION_COOLDOWN_MS + RPC latency)."
	bash scripts/testnet-smoke-test.sh
