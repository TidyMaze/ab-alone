#!/usr/bin/env bash
# Runs the same checks as CI, locally, before every push.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo fmt --all --check
cargo clippy --all-targets --locked -- -D warnings
cargo llvm-cov --workspace --locked --fail-under-lines 100 --fail-under-regions 100
