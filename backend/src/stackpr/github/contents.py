"""Fetch repository file contents from the GitHub API."""

from __future__ import annotations

import base64
import json
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


def _prefix_docs_match(prefix: NugitStackDocument, full: NugitStackDocument) -> bool:
    """True if full stack starts with the same PR rows as prefix (by number + position)."""
    if prefix.repo_full_name != full.repo_full_name:
        return False
    pre = sorted(prefix.prs, key=lambda p: p.position)
    ful = sorted(full.prs, key=lambda p: p.position)
    if len(pre) > len(ful):
        return False
    for a, b in zip(pre, ful):
        if a.pr_number != b.pr_number or a.position != b.position:
            return False
    return True


def _expand_stack_document_from_layer_tip(
    client: httpx.Client,
    owner: str,
    repo: str,
    doc: NugitStackDocument,
    layer: dict[str, Any] | None,
) -> NugitStackDocument:
    """
    If `layer.tip` points at the stack tip branch and this file only has a prefix of PRs,
    load the canonical full document from that branch.
    """
    if not layer:
        return doc
    tip = layer.get("tip")
    if not isinstance(tip, dict):
        return doc
    tip_branch = tip.get("head_branch")
    if not isinstance(tip_branch, str) or not tip_branch.strip():
        return doc
    stack_size = layer.get("stack_size")
    if not isinstance(stack_size, int) or stack_size < 1:
        return doc
    if len(doc.prs) >= stack_size:
        return doc
    full_raw = fetch_raw_file(
        client, owner, repo, ".nugit/stack.json", ref=tip_branch.strip()
    )
    if full_raw is None:
        return doc
    try:
        full_data: Any = json.loads(full_raw.decode("utf-8"))
        if not isinstance(full_data, dict):
            return doc
        full_doc = parse_nugit_stack_dict(full_data)
    except (json.JSONDecodeError, UnicodeDecodeError, NugitValidationError):
        return doc
    if not _prefix_docs_match(doc, full_doc):
        return doc
    return full_doc


def _load_stack_document_from_bytes(
    client: httpx.Client,
    owner: str,
    repo: str,
    raw: bytes,
) -> Optional[NugitStackDocument]:
    try:
        data: Any = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    layer_raw = data.get("layer")
    layer_dict = layer_raw if isinstance(layer_raw, dict) else None
    try:
        doc = parse_nugit_stack_dict(data)
    except NugitValidationError:
        return None
    return _expand_stack_document_from_layer_tip(client, owner, repo, doc, layer_dict)


def fetch_nugit_stack_document(
    client: httpx.Client,
    owner: str,
    repo: str,
    ref: Optional[str] = None,
) -> Optional[NugitStackDocument]:
    """Download and parse `.nugit/stack.json` (expands prefix files via `layer.tip` when set)."""
    raw = fetch_raw_file(client, owner, repo, ".nugit/stack.json", ref=ref)
    if raw is None:
        return None
    return _load_stack_document_from_bytes(client, owner, repo, raw)


def fetch_nugit_stack_document_for_pr(
    client: httpx.Client,
    owner: str,
    repo: str,
    pr_number: int,
    explicit_ref: Optional[str] = None,
) -> tuple[Optional[NugitStackDocument], Optional[str]]:
    """
    Load `.nugit/stack.json`, trying several refs when `explicit_ref` is unset.

    Order: explicit_ref; else default branch; else this PR's head; base; then each
    open PR's head ref (so a file committed only on e.g. test-stack2 is still found
    when asking about PR 6).
    Returns (document, ref_used) where ref_used is None if default branch worked.
    """
    if explicit_ref:
        doc = fetch_nugit_stack_document(client, owner, repo, ref=explicit_ref)
        return (doc, explicit_ref if doc else None)

    doc = fetch_nugit_stack_document(client, owner, repo, ref=None)
    if doc:
        return doc, None

    pr_resp = client.get(f"/repos/{owner}/{repo}/pulls/{pr_number}")
    if pr_resp.status_code != 200:
        return None, None
    pr_data = pr_resp.json()
    head = pr_data.get("head") or {}
    base = pr_data.get("base") or {}
    head_ref = head.get("ref")
    base_ref = base.get("ref")
    seen: set[str] = set()

    for ref in (head_ref, base_ref):
        if not ref or ref in seen:
            continue
        seen.add(ref)
        doc = fetch_nugit_stack_document(client, owner, repo, ref=ref)
        if doc:
            return doc, ref

    pulls = client.get(
        f"/repos/{owner}/{repo}/pulls",
        params={"state": "open", "per_page": 100},
    )
    if pulls.status_code != 200:
        return None, None
    for item in pulls.json():
        href = (item.get("head") or {}).get("ref")
        if not href or href in seen:
            continue
        seen.add(href)
        doc = fetch_nugit_stack_document(client, owner, repo, ref=href)
        if doc:
            return doc, href

    return None, None


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
