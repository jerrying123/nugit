"""GitHub API client: app auth, PR/branch/diff operations, webhook routing."""

from stackpr.github.app_auth import (
    create_app_jwt,
    get_installation_token,
    get_installation_client,
    get_user_client,
)
from stackpr.github.webhook_router import verify_webhook_signature, route_webhook_event

__all__ = [
    "create_app_jwt",
    "get_installation_token",
    "get_installation_client",
    "get_user_client",
    "verify_webhook_signature",
    "route_webhook_event",
]
