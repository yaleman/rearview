#!/bin/bash
set -euo pipefail

project_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
metro_url="http://127.0.0.1:8081/status"
metro_pid=""

metro_is_ready() {
  [[ "$(curl --fail --silent --show-error "$metro_url" 2>/dev/null || true)" == "packager-status:running" ]]
}

cleanup() {
  if [[ -n "$metro_pid" ]]; then
    kill "$metro_pid" 2>/dev/null || true
    wait "$metro_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM
cd "$project_root"

if metro_is_ready; then
  echo "Using Metro already running on port 8081"
else
  echo "Starting Metro on port 8081"
  pnpm exec react-native start --port 8081 &
  metro_pid="$!"

  for _ in {1..60}; do
    if metro_is_ready; then
      break
    fi

    if ! kill -0 "$metro_pid" 2>/dev/null; then
      wait "$metro_pid"
    fi

    sleep 0.5
  done

  if ! metro_is_ready; then
    echo "Metro did not become ready on port 8081" >&2
    exit 1
  fi
fi

pnpm exec react-native run-ios \
  --simulator "iPhone 17 Pro" \
  --no-packager

if [[ -n "$metro_pid" ]]; then
  echo "Metro is running; press Ctrl-C to stop it"
  wait "$metro_pid"
fi
