"""ARQ worker for rebase, absorb, and speculative merge jobs."""

from typing import Any

import arq
from arq.connections import RedisSettings

from stackpr.config import get_settings
from stackpr.github.app_auth import get_installation_client
from stackpr.github.contents import fetch_nugit_stack_document_for_pr


async def rebase_cascade_job(
    ctx: dict, repo_full_name: str, source_pr_number: int
) -> None:
    """Handle rebase cascade. TODO: implement using `.nugit/stack.json` + GitHub API."""
    _ = (ctx, repo_full_name, source_pr_number)


async def absorb_to_tip_job(
    ctx: dict, repo_full_name: str, source_pr_number: int
) -> None:
    """Handle absorb-to-tip. TODO: implement."""
    _ = (ctx, repo_full_name, source_pr_number)


def _next_pr_after_merge(
    installation_id: int, repo_full_name: str, merged_pr_number: int
) -> int | None:
    owner, repo = repo_full_name.split("/", 1)
    with get_installation_client(installation_id) as client:
        doc, _ = fetch_nugit_stack_document_for_pr(
            client, owner, repo, merged_pr_number, explicit_ref=None
        )
    if not doc:
        return None
    prs = sorted(doc.prs, key=lambda p: p.position)
    merged = next((p for p in prs if p.pr_number == merged_pr_number), None)
    if not merged:
        return None
    nxt = next((p for p in prs if p.position == merged.position + 1), None)
    return nxt.pr_number if nxt else None


async def speculative_merge_job(
    ctx: dict,
    repo_full_name: str,
    merged_pr_number: int,
    installation_id: int | None = None,
) -> dict[str, Any]:
    """Check if next PR would conflict after merge using GitHub API + `.nugit/stack.json`."""
    _ = ctx
    if not installation_id:
        return {"would_conflict": False, "next_pr": None, "error": "no_installation"}
    next_num = _next_pr_after_merge(installation_id, repo_full_name, merged_pr_number)
    if not next_num:
        return {"would_conflict": False, "next_pr": None}

    owner, repo = repo_full_name.split("/", 1)
    with get_installation_client(installation_id) as client:
        r = client.get(f"/repos/{owner}/{repo}/pulls/{next_num}")
        if r.status_code != 200:
            return {
                "would_conflict": False,
                "error": "fetch_failed",
                "next_pr_number": next_num,
            }
        data = r.json()
        mergeable = data.get("mergeable")
    would_conflict = mergeable is False
    return {
        "would_conflict": would_conflict,
        "next_pr_number": next_num,
        "mergeable": mergeable,
    }


async def on_startup(ctx: dict) -> None:
    """Worker startup (no database)."""
    _ = ctx


async def on_shutdown(ctx: dict) -> None:
    """Worker shutdown."""
    _ = ctx


class WorkerSettings:
    functions = [rebase_cascade_job, absorb_to_tip_job, speculative_merge_job]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    on_startup = on_startup
    on_shutdown = on_shutdown
