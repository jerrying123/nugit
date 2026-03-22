"""Repo-scoped PR/stack routes backed by `.nugit/stack.json` on GitHub."""

from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from stackpr.auth.dependencies import optional_user_token, require_user_token
from stackpr.github.app_auth import get_anonymous_github_client, get_user_client
from stackpr.github.contents import fetch_nugit_stack_document, stack_for_pr
from stackpr.queue import enqueue_absorb_to_tip, enqueue_rebase_cascade

router = APIRouter()


@contextmanager
def _github_client(user_token: str | None):
    if user_token:
        client = get_user_client(user_token)
    else:
        client = get_anonymous_github_client()
    try:
        yield client
    finally:
        client.close()


@router.get("/{owner}/{repo}/pr/{number}/stack")
async def get_stack_for_pr(
    owner: str,
    repo: str,
    number: int,
    ref: str | None = Query(None, description="Git ref (branch/sha) for .nugit/stack.json"),
    user_token: str | None = Depends(optional_user_token),
):
    """Resolve stack from `.nugit/stack.json` containing this PR."""
    with _github_client(user_token) as client:
        doc = fetch_nugit_stack_document(client, owner, repo, ref=ref)
    if doc is None:
        raise HTTPException(
            status_code=404,
            detail="No valid .nugit/stack.json found for this repository/ref",
        )
    result = stack_for_pr(doc, number)
    if result is None:
        raise HTTPException(status_code=404, detail="Stack not found for PR")
    _doc, prs = result
    return {
        "repo_full_name": _doc.repo_full_name,
        "pr": number,
        "prs": prs,
        "resolution_contexts": [
            {
                "user_github_login": c.user_github_login,
                "resolution_pr_number": c.resolution_pr_number,
            }
            for c in _doc.resolution_contexts
        ],
    }


@router.post("/{owner}/{repo}/pr/{number}/absorb")
async def trigger_absorb(
    request: Request,
    owner: str,
    repo: str,
    number: int,
    _user_token: str = Depends(require_user_token),
):
    """Trigger absorb-to-tip for a PR in a repo (ARQ job when Redis configured)."""
    pool = getattr(request.app.state, "arq_pool", None)
    if pool:
        await enqueue_absorb_to_tip(pool, f"{owner}/{repo}", number)
    return {
        "accepted": True,
        "owner": owner,
        "repo": repo,
        "pr_number": number,
        "strategy": "absorb-to-tip",
    }


@router.post("/{owner}/{repo}/pr/{number}/sync")
async def force_sync_pr(
    request: Request,
    owner: str,
    repo: str,
    number: int,
    _user_token: str = Depends(require_user_token),
):
    """Force full-stack sync job when Redis is configured."""
    pool = getattr(request.app.state, "arq_pool", None)
    if pool:
        await enqueue_rebase_cascade(pool, f"{owner}/{repo}", number)
    return {
        "accepted": True,
        "owner": owner,
        "repo": repo,
        "pr_number": number,
        "strategy": "full-stack-sync",
    }


@router.get("/{owner}/{repo}/pr/{number}/next-mergeable")
async def get_next_mergeable(
    owner: str,
    repo: str,
    number: int,
    ref: str | None = Query(None),
    user_token: str | None = Depends(optional_user_token),
):
    """Whether the next PR in `.nugit` order is mergeable (GitHub mergeable_state)."""
    with _github_client(user_token) as client:
        doc = fetch_nugit_stack_document(client, owner, repo, ref=ref)
    if doc is None:
        raise HTTPException(status_code=404, detail="Stack not found for PR")
    prs = sorted(doc.prs, key=lambda item: item.position)
    current_idx = next((idx for idx, item in enumerate(prs) if item.pr_number == number), None)
    if current_idx is None or current_idx + 1 >= len(prs):
        return {"next_pr_number": None, "mergeable": True, "would_conflict": False}
    next_pr = prs[current_idx + 1]
    with _github_client(user_token) as client:
        r = client.get(f"/repos/{owner}/{repo}/pulls/{next_pr.pr_number}")
    if r.status_code != 200:
        return {
            "next_pr_number": next_pr.pr_number,
            "mergeable": None,
            "would_conflict": None,
        }
    data = r.json()
    mergeable = data.get("mergeable")
    would_conflict = mergeable is False
    return {
        "next_pr_number": next_pr.pr_number,
        "mergeable": mergeable,
        "would_conflict": would_conflict,
    }
