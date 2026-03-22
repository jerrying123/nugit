#!/usr/bin/env python3
"""Example: call StackPR API with per-user token (repo operations).
Usage: STACKPR_USER_TOKEN=<token> python -m scripts.call_api
"""
import os
import sys

import httpx

API_BASE = os.environ.get("API_BASE_URL", "http://localhost:3001")
USER_TOKEN = os.environ.get("STACKPR_USER_TOKEN", "")


def main() -> None:
    if not USER_TOKEN:
        print("Set STACKPR_USER_TOKEN for write operations.", file=sys.stderr)
        sys.exit(1)
    with httpx.Client(
        base_url=API_BASE,
        headers={"Authorization": f"Bearer {USER_TOKEN}"},
    ) as client:
        r = client.get("/health")
        print("Health:", r.json())
        # Example: create stack (requires token)
        # r = client.post(f"{API_BASE}/api/stacks", json={"repo_full_name": "owner/repo", "created_by": "me"})
        # print("Create stack:", r.status_code, r.json())


if __name__ == "__main__":
    main()
