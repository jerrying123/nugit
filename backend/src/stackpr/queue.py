"""ARQ job enqueue helpers. Pool is set on app state at startup."""

from typing import Any

from arq import create_pool
from arq.connections import RedisSettings

from stackpr.config import get_settings


async def get_arq_pool():
    """Create ARQ pool (call once at startup, store on app.state)."""
    settings = get_settings()
    if not settings.redis_url or not settings.redis_url.strip():
        raise RuntimeError("REDIS_URL is not configured")
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))


async def enqueue_rebase_cascade(
    pool: Any, repo_full_name: str, pr_number: int
) -> None:
    """Enqueue rebase cascade job (worker resolves stack from repo + pr)."""
    await pool.enqueue_job("rebase_cascade_job", repo_full_name, pr_number)


async def enqueue_absorb_to_tip(
    pool: Any, repo_full_name: str, pr_number: int
) -> None:
    """Enqueue absorb-to-tip job."""
    await pool.enqueue_job("absorb_to_tip_job", repo_full_name, pr_number)


async def enqueue_speculative_merge(
    pool: Any,
    repo_full_name: str,
    merged_pr_number: int,
    installation_id: int | None = None,
) -> None:
    """Enqueue speculative merge check for next PR."""
    await pool.enqueue_job(
        "speculative_merge_job", repo_full_name, merged_pr_number, installation_id
    )
