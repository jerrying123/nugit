"""Pass-through proxy to GitHub REST API using the user's bearer token."""

from typing import Any

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query

from stackpr.auth.dependencies import require_user_token
from stackpr.github.app_auth import get_user_client

router = APIRouter()


def _github_get(path: str, token: str, params: dict[str, Any] | None) -> tuple[int, Any]:
    with get_user_client(token) as client:
        r = client.get(path, params=params)
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text}
        return r.status_code, body


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
