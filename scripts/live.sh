#!/usr/bin/env bash
# Runs `mr-ext test` against the real sites (through public DNS); one result line per extension.
#   scripts/live.sh src/id/foo src/id/bar ...
root=$(cd "$(dirname "$0")/.." && pwd)
for dir in "$@"; do
  (
    out=$(NODE_OPTIONS="--import $root/scripts/public-dns.mjs" timeout 300 pnpm exec mr-ext test "$dir" 2>&1)
    status=$(echo "$out" | grep -E '^(✔|✘|✖) ' | tail -1)
    bad=$(echo "$out" | grep -E '^\s+(✘|✖) ' | sed 's/^ *//' | cut -c1-150 | tr '\n' ';')
    echo "$(basename "$dir"): ${status:-error $(echo "$out" | tail -2 | tr '\n' ' ')} ${bad}"
  ) &
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 1; done
done
wait
