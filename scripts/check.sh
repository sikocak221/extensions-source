#!/usr/bin/env bash
# Everything CI checks, failing on the first problem:  scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/sync-multisrc.mjs --check
pnpm format:check >/dev/null
pnpm typecheck >/dev/null 2>&1 || { pnpm typecheck 2>&1 | grep "error TS" | head -20; exit 1; }
tests=$(pnpm -r --no-bail test 2>&1 || true)
if echo "$tests" | grep -E "FAIL |ERR_PNPM" | sort -u | grep .; then exit 1; fi
pnpm repo:build:unsigned | tail -1
echo "All checks passed"
