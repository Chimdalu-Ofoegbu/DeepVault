# DeepVault Makefile — orchestrates pnpm, uv, and sui move across the monorepo.
# Targets:
#   install   — install all language deps (frozen lockfiles)
#   codegen   — regenerate strategy_constants from shared/strategy.toml (Plan 03 wires this up)
#   build     — codegen + pnpm -r build + sui move build
#   test      — sui move test + pnpm -r test + uv run pytest
#   lint      — pnpm -r lint + ruff check + ruff format --check
#   clean     — remove node_modules, .venv, contracts/build
#   demo      — placeholder until Phase 6

.PHONY: install codegen build test lint clean demo

install:
	pnpm install --frozen-lockfile
	cd backtest && uv sync --locked

codegen:
	@echo "ERROR: codegen target not yet wired (Plan 03 fills this). Run 'python scripts/codegen.py' once it exists." >&2
	@exit 1

build:
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
	@echo "TODO: Phase 6 fills this in — should reproduce demo end-to-end from fresh clone"
