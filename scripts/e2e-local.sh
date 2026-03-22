#!/usr/bin/env bash
set -euo pipefail

# CLI smoke test against GitHub (no local API).
# Usage: NUGIT_USER_TOKEN=... ./scripts/e2e-local.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN="${NUGIT_USER_TOKEN:-${STACKPR_USER_TOKEN:-}}"

if [[ -z "${TOKEN}" ]]; then
  echo "ERROR: NUGIT_USER_TOKEN or STACKPR_USER_TOKEN is required."
  exit 1
fi

echo "==> nugit auth whoami (via CLI → GitHub)"
cd "${ROOT_DIR}/cli"
npm install --silent
NUGIT_USER_TOKEN="${TOKEN}" node src/nugit.js auth whoami

echo "==> nugit prs list (open PRs, paginated; override with NUGIT_E2E_REPO=owner/repo)"
E2E_REPO="${NUGIT_E2E_REPO:-octocat/Hello-World}"
NUGIT_USER_TOKEN="${TOKEN}" node src/nugit.js prs list --repo "${E2E_REPO}" | head -40

echo
echo "E2E CLI checks completed."
