"""Diff and compare operations."""

from typing import Any

import httpx


def compare_branches(
    client: httpx.Client,
    owner: str,
    repo: str,
    base: str,
    head: str,
) -> dict[str, Any]:
    """Compare two commits/branches. Returns comparison with files, etc."""
    resp = client.get(
        f"/repos/{owner}/{repo}/compare/{base}...{head}",
    )
    resp.raise_for_status()
    return resp.json()


def get_pr_diff(
    client: httpx.Client,
    owner: str,
    repo: str,
    pr_number: int,
) -> str:
    """Get raw unified diff for a PR (Accept: application/vnd.github.diff)."""
    resp = client.get(
        f"/repos/{owner}/{repo}/pulls/{pr_number}",
        headers={"Accept": "application/vnd.github.diff"},
    )
    resp.raise_for_status()
    return resp.text


def get_files_changed_between(
    client: httpx.Client,
    owner: str,
    repo: str,
    base_sha: str,
    head_sha: str,
) -> list[dict[str, Any]]:
    """Get list of files changed between base and head."""
    data = compare_branches(client, owner, repo, base_sha, head_sha)
    return data.get("files", [])
