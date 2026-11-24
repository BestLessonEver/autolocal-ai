#!/bin/bash
# AutoLocal Nightly Optimization
# Safely loads local dotenv values into Node without evaluating them in a shell.
# Usage: bash scripts/nightly-optimize.sh [--dry-run]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${AUTOLOCAL_ENV_FILE:-$ROOT/.env.local}"
NODE_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  NODE_ARGS+=("--env-file=$ENV_FILE")
fi

exec node "${NODE_ARGS[@]}" "$ROOT/scripts/operations/nightly-optimize.mjs" "$@"
