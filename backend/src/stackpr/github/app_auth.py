"""GitHub App JWT and installation access token with caching."""

import time
import httpx
import jwt

from stackpr.config import get_settings

# In-memory cache: installation_id -> (token, expires_at)
_installation_token_cache: dict[int, tuple[str, float]] = {}
_CACHE_BUFFER_SECONDS = 60


def create_app_jwt(app_id: str, private_key_pem: str) -> str:
    """Create a JWT for the GitHub App (valid 10 minutes)."""
    now = int(time.time())
    payload = {
        "iat": now,
        "exp": now + 600,
        "iss": app_id,
    }
    return jwt.encode(
        payload,
        private_key_pem,
        algorithm="RS256",
    )


def get_installation_token(installation_id: int) -> str:
    """Get installation access token, using cache if valid."""
    now = time.time()
    cached = _installation_token_cache.get(installation_id)
    if cached:
        token, expires_at = cached
        if expires_at > now + _CACHE_BUFFER_SECONDS:
            return token
    settings = get_settings()
    app_jwt = create_app_jwt(settings.github_app_id, settings.github_app_private_key)
    with httpx.Client() as client:
        resp = client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={},
        )
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    expires_at = time.time() + 3600  # GitHub tokens typically 1h
    if "expires_at" in data:
        from datetime import datetime
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00")).timestamp()
    _installation_token_cache[installation_id] = (token, expires_at)
    return token


def get_installation_client(installation_id: int) -> httpx.Client:
    """Return an httpx Client configured with the installation token (for comments/checks)."""
    token = get_installation_token(installation_id)
    return httpx.Client(
        base_url="https://api.github.com",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def get_anonymous_github_client() -> httpx.Client:
    """Unauthenticated GitHub API client (strict rate limits for public data)."""
    return httpx.Client(
        base_url="https://api.github.com",
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def get_user_client(user_token: str) -> httpx.Client:
    """Return an httpx Client configured with a per-user GitHub token (for repo ops, fork pushes)."""
    return httpx.Client(
        base_url="https://api.github.com",
        headers={
            "Authorization": f"Bearer {user_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
