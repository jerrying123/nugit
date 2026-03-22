"""Account routes for user-scoped GitHub data."""

from fastapi import APIRouter, Depends, HTTPException, Query

from stackpr.auth.dependencies import require_user_token
from stackpr.github.app_auth import get_user_client

router = APIRouter()


@router.get("/pulls")
async def list_my_pulls(
    state: str = Query("open"),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    user_token: str = Depends(require_user_token),
):
    """List PRs authored by the authenticated user across repositories."""
    with get_user_client(user_token) as client:
        me = client.get("/user")
        if me.status_code >= 400:
            raise HTTPException(status_code=401, detail="Invalid token")
        login = me.json().get("login")
        search = client.get(
            "/search/issues",
            params={
                "q": f"type:pr author:{login} state:{state}",
                "sort": "updated",
                "order": "desc",
                "page": page,
                "per_page": per_page,
            },
        )
    if search.status_code >= 400:
        raise HTTPException(status_code=502, detail="Failed to fetch pull requests")
    data = search.json()
    items = data.get("items", [])
    return {
        "total_count": data.get("total_count", 0),
        "items": [
            {
                "number": item.get("number"),
                "title": item.get("title"),
                "state": item.get("state"),
                "html_url": item.get("html_url"),
                "repository_url": item.get("repository_url"),
                "updated_at": item.get("updated_at"),
            }
            for item in items
        ],
    }
