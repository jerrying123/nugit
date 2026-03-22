"""Parse and validate `.nugit/stack.json` documents (no I/O)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional


class NugitValidationError(ValueError):
    pass


@dataclass
class NugitStackedPr:
    pr_number: int
    position: int
    head_branch: str = ""
    base_branch: str = ""
    head_sha: str = ""
    base_sha: str = ""
    status: str = "open"
    has_unabsorbed_changes: bool = False
    author_github_login: Optional[str] = None
    is_fork: bool = False
    head_repo_full_name: Optional[str] = None
    base_repo_full_name: Optional[str] = None


@dataclass
class NugitResolutionContext:
    user_github_login: str
    resolution_pr_number: int


@dataclass
class NugitStackDocument:
    version: int
    repo_full_name: str
    created_by: str
    prs: list[NugitStackedPr] = field(default_factory=list)
    resolution_contexts: list[NugitResolutionContext] = field(default_factory=list)


def parse_nugit_stack_json(raw: str | bytes) -> NugitStackDocument:
    """Parse JSON string/bytes into a validated document."""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as e:
        raise NugitValidationError(f"Invalid JSON: {e}") from e
    return parse_nugit_stack_dict(data)


def parse_nugit_stack_dict(data: dict[str, Any]) -> NugitStackDocument:
    if not isinstance(data, dict):
        raise NugitValidationError("Root must be an object")
    version = data.get("version")
    if version != 1:
        raise NugitValidationError("version must be 1")
    repo = data.get("repo_full_name")
    created_by = data.get("created_by")
    if not isinstance(repo, str) or not repo.strip():
        raise NugitValidationError("repo_full_name is required")
    if not isinstance(created_by, str) or not created_by.strip():
        raise NugitValidationError("created_by is required")
    prs_raw = data.get("prs")
    if not isinstance(prs_raw, list):
        raise NugitValidationError("prs must be an array")
    prs: list[NugitStackedPr] = []
    seen_numbers: set[int] = set()
    seen_positions: set[int] = set()
    for i, item in enumerate(prs_raw):
        if not isinstance(item, dict):
            raise NugitValidationError(f"prs[{i}] must be an object")
        try:
            pn = int(item["pr_number"])
            pos = int(item["position"])
        except (KeyError, TypeError, ValueError) as e:
            raise NugitValidationError(f"prs[{i}]: pr_number and position required") from e
        if pn in seen_numbers:
            raise NugitValidationError(f"duplicate pr_number {pn}")
        if pos in seen_positions:
            raise NugitValidationError(f"duplicate position {pos}")
        seen_numbers.add(pn)
        seen_positions.add(pos)
        prs.append(
            NugitStackedPr(
                pr_number=pn,
                position=pos,
                head_branch=str(item.get("head_branch") or ""),
                base_branch=str(item.get("base_branch") or ""),
                head_sha=str(item.get("head_sha") or ""),
                base_sha=str(item.get("base_sha") or ""),
                status=str(item.get("status") or "open"),
                has_unabsorbed_changes=bool(item.get("has_unabsorbed_changes", False)),
                author_github_login=item.get("author_github_login"),
                is_fork=bool(item.get("is_fork", False)),
                head_repo_full_name=item.get("head_repo_full_name"),
                base_repo_full_name=item.get("base_repo_full_name"),
            )
        )
    contexts: list[NugitResolutionContext] = []
    ctx_raw = data.get("resolution_contexts")
    if ctx_raw is not None:
        if not isinstance(ctx_raw, list):
            raise NugitValidationError("resolution_contexts must be an array")
        for j, c in enumerate(ctx_raw):
            if not isinstance(c, dict):
                raise NugitValidationError(f"resolution_contexts[{j}] must be an object")
            login = c.get("user_github_login")
            rpn = c.get("resolution_pr_number")
            if not isinstance(login, str) or not login:
                raise NugitValidationError(f"resolution_contexts[{j}]: user_github_login required")
            try:
                rpn_i = int(rpn)
            except (TypeError, ValueError) as e:
                raise NugitValidationError(
                    f"resolution_contexts[{j}]: resolution_pr_number invalid"
                ) from e
            contexts.append(
                NugitResolutionContext(user_github_login=login, resolution_pr_number=rpn_i)
            )
    return NugitStackDocument(
        version=1,
        repo_full_name=repo.strip(),
        created_by=created_by.strip(),
        prs=sorted(prs, key=lambda p: p.position),
        resolution_contexts=contexts,
    )


def document_to_json_dict(doc: NugitStackDocument) -> dict[str, Any]:
    """Serialize document to a JSON-compatible dict."""
    return {
        "version": doc.version,
        "repo_full_name": doc.repo_full_name,
        "created_by": doc.created_by,
        "prs": [
            {
                "pr_number": p.pr_number,
                "position": p.position,
                "head_branch": p.head_branch,
                "base_branch": p.base_branch,
                "head_sha": p.head_sha,
                "base_sha": p.base_sha,
                "status": p.status,
                "has_unabsorbed_changes": p.has_unabsorbed_changes,
                "author_github_login": p.author_github_login,
                "is_fork": p.is_fork,
                "head_repo_full_name": p.head_repo_full_name,
                "base_repo_full_name": p.base_repo_full_name,
            }
            for p in sorted(doc.prs, key=lambda x: x.position)
        ],
        "resolution_contexts": [
            {
                "user_github_login": c.user_github_login,
                "resolution_pr_number": c.resolution_pr_number,
            }
            for c in doc.resolution_contexts
        ],
    }


def document_to_json(doc: NugitStackDocument, indent: int = 2) -> str:
    return json.dumps(document_to_json_dict(doc), indent=indent) + "\n"
