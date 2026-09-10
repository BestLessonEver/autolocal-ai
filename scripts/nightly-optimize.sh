#!/bin/bash
# AutoLocal Nightly Optimization
# Runs overnight to refresh Google data, refresh listing signals and queue reviewed publishing
# Usage: bash scripts/nightly-optimize.sh [--dry-run]
#
# Requires explicit NEXT_PUBLIC_SITE_URL and INTERNAL_API_KEY configuration

set -euo pipefail

BASE_URL="${NEXT_PUBLIC_SITE_URL:?Set NEXT_PUBLIC_SITE_URL for the intended environment}"
API_KEY="${INTERNAL_API_KEY:?Set INTERNAL_API_KEY}"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

echo "🌙 AutoLocal Nightly Optimization"
echo "   Time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "   Dry run: $DRY_RUN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BODY="{\"dryRun\": $DRY_RUN}"

response=$(curl -sS --max-time 120 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$BODY" \
  "$BASE_URL/api/optimize" 2>&1)

echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"

# Check for errors. The API returns a message-only success when there are no
# active sites, so accept either the normal summary payload or that empty-work
# response.
response_state=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('summary' if 'summary' in d else 'empty' if d.get('message') == 'No active sites to optimize' else 'error')" 2>/dev/null || echo "error")

if [[ "$response_state" == "summary" ]]; then
  sites_changed=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['summary']['sitesChanged'])")
  echo ""
  echo "✅ Optimization complete — $sites_changed site(s) refreshed; publishing is queued and verified separately"
elif [[ "$response_state" == "empty" ]]; then
  echo ""
  echo "✅ Optimization complete — no active sites to optimize"
else
  echo ""
  echo "❌ Optimization failed"
  exit 1
fi
