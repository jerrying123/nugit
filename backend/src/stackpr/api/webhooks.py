"""GitHub App webhook receiver."""

import json

from fastapi import APIRouter, Request, Header, HTTPException

from stackpr.github.webhook_router import verify_webhook_signature, route_webhook_event
from stackpr.queue import (
    enqueue_rebase_cascade,
    enqueue_absorb_to_tip,
    enqueue_speculative_merge,
)

router = APIRouter()


def _repo_full_name(payload: dict) -> str | None:
    repo = payload.get("repository") or {}
    full = repo.get("full_name")
    return full


def _pr_number(payload: dict) -> int | None:
    pr = payload.get("pull_request") or {}
    return pr.get("number")


def _installation_id(payload: dict) -> int | None:
    inst = payload.get("installation") or {}
    return inst.get("id")


@router.post("/github")
async def github_webhook(
    request: Request,
    x_github_event: str | None = Header(None, alias="X-GitHub-Event"),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
):
    """Receive GitHub App webhooks. Verify signature and route by event."""
    body = await request.body()
    if x_hub_signature_256 and not verify_webhook_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    event = x_github_event or "unknown"
    await route_webhook_event(event, payload)

    pool = getattr(request.app.state, "arq_pool", None)
    if pool and event == "pull_request":
        action = payload.get("action")
        repo = _repo_full_name(payload)
        pr_num = _pr_number(payload)
        if repo and pr_num is not None:
            if action == "closed" and (payload.get("pull_request") or {}).get("merged"):
                await enqueue_rebase_cascade(pool, repo, pr_num)
                await enqueue_speculative_merge(
                    pool, repo, pr_num, _installation_id(payload)
                )
            elif action == "synchronize":
                await enqueue_absorb_to_tip(pool, repo, pr_num)

    return {"received": True, "event": event}
