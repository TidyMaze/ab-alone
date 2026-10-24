#!/bin/sh
# Fails when an e2e run leaves a change under client/e2e/ (a tracked file rewritten by a spec).
# Run from anywhere: sh client/scripts/check-e2e-clean.sh. Set E2E_PORT to avoid 5173.
set -u
cd "$(dirname "$0")/.." || exit 1

bun run e2e
echo "e2e exit status: $?"

changes=$(git status --porcelain -- e2e)
if [ -n "$changes" ]; then
  echo "FAIL: e2e run changed files under client/e2e/:"
  echo "$changes"
  exit 1
fi
echo "OK: git status is clean under client/e2e/"
