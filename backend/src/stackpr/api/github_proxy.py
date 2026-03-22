"""Pass-through proxy to GitHub REST API using the user's bearer token."""

from typing import Any

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from stackpr.auth.dependencies import require_user_token
from stackpr.github.app_auth import get_user_client

router = APIRouter()


class CreatePullRequestBody(BaseModel):
    title: str = Field(..., min_length=1)
    head: str = Field(..., min_length=1, description="Branch name or user:branch for forks")
    base: str = Field(..., min_length=1)
    body: str | None = None
    draft: bool = False


def _github_get(path: str, token: str, params: dict[str, Any] | None) -> tuple[int, Any]:
    with get_user_client(token) as client:
        r = client.get(path, params=params)
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text}
        return r.status_code, body


def _github_post(path: str, token: str, json_body: dict[str, Any]) -> tuple[int, Any]:
    with get_user_client(token) as client:
        r = client.post(path, json=json_body)
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text}
        return r.status_code, body


@router.get("/repos/{owner}/{repo}")
async def get_repo(
    owner: str,
    repo: str,
    user_token: str = Depends(require_user_token),
):
    """GET /repos/{owner}/{repo} (default_branch, etc.)."""
    status, body = await anyio.to_thread.run_sync(
        _github_get,
        f"/repos/{owner}/{repo}",
        user_token,
        None,
    )
    if status == 404:
        raise HTTPException(status_code=404, detail="Repository not found")
    if status >= 400:
        raise HTTPException(status_code=502, detail=str(body))
    return body


@router.post("/repos/{owner}/{repo}/pulls")
async def create_pull(
    owner: str,
    repo: str,
    body: CreatePullRequestBody,
    user_token: str = Depends(require_user_token),
):
    """POST /repos/{owner}/{repo}/pulls — open a PR (head branch must exist on GitHub)."""
    payload = body.model_dump(exclude_none=True)
    status, resp = await anyio.to_thread.run_sync(
        _github_post,
        f"/repos/{owner}/{repo}/pulls",
        user_token,
        payload,
    )
    if status == 422:
        raise HTTPException(status_code=422, detail=resp)
    if status >= 400:
        raise HTTPException(status_code=502, detail=str(resp))
    return resp


@router.get("/repos/{owner}/{repo}/contents/{file_path:path}")
async def get_contents(
    owner: str,
    repo: str,
    file_path: str,
    ref: str | None = Query(None),
    user_token: str = Depends(require_user_token),
):
    """GET /repos/{owner}/{repo}/contents/{path} on GitHub (same response shape)."""
    params: dict[str, str] = {}
    if ref:
        params["ref"] = ref
    path = f"/repos/{owner}/{repo}/contents/{file_path}"
    status, body = await anyio.to_thread.run_sync(
        _github_get, path, user_token, params or None
    )
    if status == 404:
        raise HTTPException(status_code=404, detail="Not found")
    if status >= 400:
        raise HTTPException(status_code=502, detail=body if isinstance(body, str) else str(body))
    return body


@router.get("/repos/{owner}/{repo}/pulls/{pull_number}")
async def get_pull(
    owner: str,
    repo: str,
    pull_number: int,
    user_token: str = Depends(require_user_token),
):
    status, body = await anyio.to_thread.run_sync(
        _github_get,
        f"/repos/{owner}/{repo}/pulls/{pull_number}",
        user_token,
        None,
    )
    if status == 404:
        raise HTTPException(status_code=404, detail="Pull request not found")
    if status >= 400:
        raise HTTPException(status_code=502, detail=str(body))
    return body


@router.get("/repos/{owner}/{repo}/pulls")
async def list_pulls(
    owner: str,
    repo: str,
    state: str = Query("open"),
    per_page: int = Query(30, ge=1, le=100),
    page: int = Query(1, ge=1),
    user_token: str = Depends(require_user_token),
):
    params = {"state": state, "per_page": per_page, "page": page}
    status, body = await anyio.to_thread.run_sync(
        _github_get,
        f"/repos/{owner}/{repo}/pulls",
        user_token,
        params,
    )
    if status >= 400:
        raise HTTPException(status_code=502, detail=str(body))
    return body


@router.get("/user/repos")
async def list_user_repos(
    per_page: int = Query(30, ge=1, le=100),
    page: int = Query(1, ge=1),
    affiliation: str = Query("owner,collaborator,organization_member"),
    user_token: str = Depends(require_user_token),
):
    params = {"per_page": per_page, "page": page, "affiliation": affiliation}
    status, body = await anyio.to_thread.run_sync(
        _github_get,
        "/user/repos",
        user_token,
        params,
    )
    if status >= 400:
        raise HTTPException(status_code=502, detail=str(body))
    return body
