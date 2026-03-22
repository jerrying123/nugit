"""Authentication routes: GitHub Device Flow and PAT (tokens returned to client only)."""

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from stackpr.config import get_settings
from stackpr.github.app_auth import get_user_client
from stackpr.auth.dependencies import require_user_token

router = APIRouter()


class PatLoginBody(BaseModel):
    token: str


class DevicePollBody(BaseModel):
    device_code: str


def _github_user_from_token(token: str) -> dict[str, Any]:
    with get_user_client(token) as client:
        resp = client.get("/user")
    if resp.status_code >= 400:
        raise HTTPException(status_code=401, detail="Invalid GitHub user token")
    user = resp.json()
    return {"login": user["login"], "id": user["id"]}


@router.get("/device/start")
async def start_device_flow() -> dict[str, Any]:
    """Start GitHub Device Flow and return user/device codes."""
    settings = get_settings()
    if not settings.github_oauth_client_id:
        raise HTTPException(status_code=400, detail="GITHUB_OAUTH_CLIENT_ID is not configured")
    with httpx.Client() as client:
        response = client.post(
            "https://github.com/login/device/code",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "scope": "repo read:user",
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed to start device flow")
    return response.json()


@router.post("/device/poll")
async def poll_device_flow(body: DevicePollBody) -> dict[str, Any]:
    """Poll GitHub Device Flow; when authorized, returns access_token for the client to store."""
    settings = get_settings()
    if not settings.github_oauth_client_id:
        raise HTTPException(status_code=400, detail="GITHUB_OAUTH_CLIENT_ID is not configured")
    with httpx.Client() as client:
        response = client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "device_code": body.device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Device flow poll failed")
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        return payload
    user = _github_user_from_token(access_token)
    return {
        "ok": True,
        "user": user,
        "access_token": access_token,
        "token_type": payload.get("token_type", "bearer"),
    }


@router.post("/pat")
async def login_with_pat(body: PatLoginBody) -> dict[str, Any]:
    """Validate PAT and return it to the client (store locally; server does not persist)."""
    user = _github_user_from_token(body.token)
    return {"ok": True, "user": user, "access_token": body.token}


@router.get("/me")
async def me(
    user_token: str = Depends(require_user_token),
) -> dict[str, Any]:
    """Return current GitHub user from bearer token."""
    with get_user_client(user_token) as client:
        response = client.get("/user")
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Invalid token")
    data = response.json()
    return {"login": data.get("login"), "id": data.get("id")}
