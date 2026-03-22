"""PR operations using GitHub API. Use installation or user token client."""

from typing import Any

import httpx


def create_pr(
    client: httpx.Client,
    owner: str,
    repo: str,
    title: str,
    head: str,
    base: str,
    body: str = "",
    draft: bool = False,
) -> dict[str, Any]:
    """Create a pull request. Returns PR dict."""
    resp = client.post(
        f"/repos/{owner}/{repo}/pulls",
        json={
            "title": title,
            "head": head,
            "base": base,
            "body": body,
            "draft": draft,
        },
    )
    resp.raise_for_status()
    return resp.json()


def update_pr_base(
    client: httpx.Client,
    owner: str,
    repo: str,
    pr_number: int,
    new_base: str,
) -> None:
    """Update a PR's base branch."""
    resp = client.patch(
        f"/repos/{owner}/{repo}/pulls/{pr_number}",
        json={"base": new_base},
    )
    resp.raise_for_status()


def get_pr_with_files(
    client: httpx.Client,
    owner: str,
    repo: str,
    pr_number: int,
) -> dict[str, Any]:
    """Get PR details. For files, use get_pr_diff or compare API."""
    resp = client.get(f"/repos/{owner}/{repo}/pulls/{pr_number}")
    resp.raise_for_status()
    return resp.json()


def list_prs_for_branch(
    client: httpx.Client,
    owner: str,
    repo: str,
    head_branch: str,
    state: str = "open",
) -> list[dict[str, Any]]:
    """List PRs for the given head branch."""
    resp = client.get(
        f"/repos/{owner}/{repo}/pulls",
        params={"head": f"{owner}:{head_branch}", "state": state},
    )
    resp.raise_for_status()
    return resp.json()
