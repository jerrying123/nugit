"""Fetch repository file contents from the GitHub API."""

from __future__ import annotations

import base64
from typing import Any, Optional

import httpx

from stackpr.core.nugit_file import (
    NugitStackDocument,
    NugitValidationError,
    parse_nugit_stack_json,
)


def decode_github_content_item(item: dict[str, Any]) -> Optional[bytes]:
    """If item is a single file with base64 content, return decoded bytes."""
    if item.get("type") != "file":
        return None
    enc = item.get("encoding")
    content = item.get("content")
    if enc != "base64" or not isinstance(content, str):
        return None
    # GitHub joins base64 with newlines
    cleaned = "".join(content.split())
    try:
        return base64.b64decode(cleaned)
    except Exception:
        return None


def fetch_raw_file(
    client: httpx.Client,
    owner: str,
    repo: str,
    path: str,
    ref: Optional[str] = None,
) -> Optional[bytes]:
    """
    GET /repos/{owner}/{repo}/contents/{path}
    Returns file bytes or None if missing/not a file.
    """
    params: dict[str, str] = {}
    if ref:
        params["ref"] = ref
    r = client.get(f"/repos/{owner}/{repo}/contents/{path}", params=params or None)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list):
        return None
    if not isinstance(data, dict):
        return None
    return decode_github_content_item(data)


def fetch_nugit_stack_document(
    client: httpx.Client,
    owner: str,
    repo: str,
    ref: Optional[str] = None,
) -> Optional[NugitStackDocument]:
    """Download and parse `.nugit/stack.json`."""
    raw = fetch_raw_file(client, owner, repo, ".nugit/stack.json", ref=ref)
    if raw is None:
        return None
    try:
        return parse_nugit_stack_json(raw)
    except NugitValidationError:
        return None


def stack_for_pr(
    doc: NugitStackDocument, pr_number: int
) -> tuple[NugitStackDocument, list] | None:
    """If pr_number is in the stack, return doc and ordered pr dicts for API response."""
    prs_sorted = sorted(doc.prs, key=lambda p: p.position)
    if not any(p.pr_number == pr_number for p in prs_sorted):
        return None
    payload = [
        {
            "pr_number": p.pr_number,
            "position": p.position,
            "head_branch": p.head_branch,
            "base_branch": p.base_branch,
            "status": p.status,
        }
        for p in prs_sorted
    ]
    return doc, payload
