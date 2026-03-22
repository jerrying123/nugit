"""GitHub webhook signature verification and event routing."""

import hashlib
import hmac
import json
from typing import Any, Callable, Awaitable

from stackpr.config import get_settings

EventName = str
Payload = dict[str, Any]
Handler = Callable[[Payload], Awaitable[None]]

_handlers: dict[EventName, list[Handler]] = {}


def verify_webhook_signature(body: bytes, signature_header: str | None) -> bool:
    """Verify X-Hub-Signature-256 against body. If secret is unset, skip (dev)."""
    if not signature_header or not body:
        return False
    secret = get_settings().github_webhook_secret
    if not secret:
        return True
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)


def register_handler(event: EventName, handler: Handler) -> None:
    """Register an async handler for a GitHub webhook event (e.g. pull_request, push)."""
    _handlers.setdefault(event, []).append(handler)


async def route_webhook_event(event: EventName, payload: Payload) -> None:
    """Dispatch payload to all handlers for the given event."""
    for h in _handlers.get(event, []):
        await h(payload)


def get_installation_id_from_payload(payload: Payload) -> int | None:
    """Extract installation id from webhook payload."""
    return payload.get("installation", {}).get("id")


def get_action(payload: Payload) -> str | None:
    """Extract action from webhook payload (e.g. closed, opened, synchronize)."""
    return payload.get("action")