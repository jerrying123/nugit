"""API routes."""

from fastapi import APIRouter

from stackpr.api.auth import router as auth_router
from stackpr.api.account import router as account_router
from stackpr.api.github_proxy import router as github_proxy_router
from stackpr.api.repos import router as repos_router
from stackpr.api.webhooks import router as webhooks_router
from stackpr.api.ws import router as ws_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(account_router, prefix="/account", tags=["account"])
router.include_router(github_proxy_router, prefix="/github", tags=["github"])
router.include_router(repos_router, prefix="/repos", tags=["repos"])
router.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
router.include_router(ws_router, prefix="", tags=["ws"])
