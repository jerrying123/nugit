#!/usr/bin/env bash
set -euo pipefail

# End-to-end local runner (stateless API + Redis optional for workers).
# Usage:
#   NUGIT_USER_TOKEN=... ./scripts/e2e-local.sh
#   (or STACKPR_USER_TOKEN for backward compatibility)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${API_BASE:-http://localhost:3001/api}"
TOKEN="${NUGIT_USER_TOKEN:-${STACKPR_USER_TOKEN:-}}"

if [[ -z "${TOKEN}" ]]; then
  echo "ERROR: NUGIT_USER_TOKEN or STACKPR_USER_TOKEN is required."
  exit 1
fi

echo "==> Starting Redis (optional for ARQ; API runs without Postgres)"
cd "${ROOT_DIR}"
docker compose up -d redis

echo "==> Ensuring backend venv + deps"
cd "${ROOT_DIR}/backend"
if [[ ! -d ".venv" ]]; then
  python -m venv .venv
fi
.venv/bin/pip install -e ".[dev]" >/dev/null

echo "==> Starting API (background; no database migrations)"
pkill -f "uvicorn stackpr.main:app" || true
export DATABASE_URL="${DATABASE_URL:-}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
nohup env DATABASE_URL="${DATABASE_URL}" REDIS_URL="${REDIS_URL}" \
  .venv/bin/uvicorn stackpr.main:app --host 0.0.0.0 --port 3001 >/tmp/stackpr-api.log 2>&1 &
sleep 2

echo "==> Health check"
curl -fsS "http://localhost:3001/health" >/dev/null

echo "==> Validating token"
curl -fsS -H "Authorization: Bearer ${TOKEN}" \
  "${API_BASE}/auth/me" >/dev/null

echo "==> Listing my PRs"
curl -fsS -H "Authorization: Bearer ${TOKEN}" \
  "${API_BASE}/account/pulls" >/tmp/stackpr-pulls.json

echo "==> Listing a page of repos (GitHub proxy)"
curl -fsS -H "Authorization: Bearer ${TOKEN}" \
  "${API_BASE}/github/user/repos?per_page=5&page=1" >/tmp/stackpr-repos.json

echo
echo "E2E completed successfully."
echo "Artifacts:"
echo "  /tmp/stackpr-pulls.json"
echo "  /tmp/stackpr-repos.json"
echo "  /tmp/stackpr-api.log"
echo
echo "Stack data: create .nugit/stack.json with the CLI (nugit init), commit, and push."
echo "Then: GET ${API_BASE}/repos/{owner}/{repo}/pr/{number}/stack"
echo
echo "Chrome: for local API use manifest.development.json as manifest.json (see chrome-plugin/README.md)."
echo "Web UI: cd frontend && npm install && npm run dev"
