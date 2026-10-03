#!/usr/bin/env bash
# Records fixtures for extensions (through public DNS) and prints one result line each.
#   scripts/record.sh src/id/foo src/id/bar ...   (KEEP=1: only record requests without a fixture)
root=$(cd "$(dirname "$0")/.." && pwd)
for dir in "$@"; do
  (
    cd "$dir" || exit
    [ "$KEEP" = 1 ] || rm -rf test/fixtures
    out=$(NODE_OPTIONS="--import $root/scripts/public-dns.mjs" MR_RECORD=1 timeout 300 pnpm test 2>&1)
    summary=$(echo "$out" | grep -E '^\s+Tests ' | sed 's/^ *//')
    failed=$(echo "$out" | grep -E '^\s+× ' | sed 's/^ *× //; s/ [0-9]*ms$//' | tr '\n' ';')
    error=$(echo "$out" | grep -m1 -E '(Error|Expected|expected).*' | sed 's/^ *//' | cut -c1-160)
    echo "$(basename "$dir"): ${summary:-error} ${failed:+| $failed}${failed:+ | $error}"
  ) &
  while [ "$(jobs -r | wc -l)" -ge 6 ]; do sleep 1; done
done
wait
