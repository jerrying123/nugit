"""FastAPI dependencies for per-user GitHub token (repo operations)."""

from typing import Annotated

from fastapi import Depends, HTTPException, Header

USER_TOKEN_HEADER = "Authorization"


async def _get_bearer_token(authorization: str | None = Header(None)) -> str | None:
    """Extract Bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[7:].strip()


async def optional_user_token(
    token: str | None = Depends(_get_bearer_token),
) -> str | None:
    """Dependency: optional per-user GitHub token for repo operations."""
    return token


async def require_user_token(
    token: str | None = Depends(_get_bearer_token),
) -> str:
    """Dependency: require per-user GitHub token; 401 if missing."""
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Use: Bearer <github-user-token>",
        )
    return token


UserToken = Annotated[str, Depends(require_user_token)]
OptionalUserToken = Annotated[str | None, Depends(optional_user_token)]
