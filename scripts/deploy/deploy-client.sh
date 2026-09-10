#!/bin/bash
# Queue a website through the verified publishing lifecycle. No direct CLI deploy.
set -euo pipefail
SLUG="${1:?Usage: deploy-client.sh <slug>}"
if [[ ! "$SLUG" =~ ^[a-z0-9-]{1,100}$ ]]; then
  echo "Invalid website slug" >&2
  exit 1
fi
BASE_URL="${NEXT_PUBLIC_SITE_URL:?Set the intended application origin}"
API_KEY="${INTERNAL_API_KEY:?Set the internal worker credential}"
curl --fail-with-body --silent --show-error --max-time 30 \
  -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" \
  -d "{\"slug\":\"$SLUG\"}" "$BASE_URL/api/deploy"
echo ""
echo "Publishing is queued; check the dashboard for verified completion."
