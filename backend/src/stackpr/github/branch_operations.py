"""Branch/ref operations. Use per-user token client for pushes."""

import httpx


def create_branch(
    client: httpx.Client,
    owner: str,
    repo: str,
    name: str,
    sha: str,
) -> None:
    """Create a branch (ref) at the given sha."""
    ref = f"refs/heads/{name}"
    resp = client.post(
        f"/repos/{owner}/{repo}/git/refs",
        json={"ref": ref, "sha": sha},
    )
    resp.raise_for_status()


def update_branch_ref(
    client: httpx.Client,
    owner: str,
    repo: str,
    name: str,
    sha: str,
    force: bool = False,
) -> None:
    """Update branch ref to new sha (force push if force=True)."""
    resp = client.patch(
        f"/repos/{owner}/{repo}/git/refs/heads/{name}",
        json={"sha": sha, "force": force},
    )
    resp.raise_for_status()


def delete_branch(
    client: httpx.Client,
    owner: str,
    repo: str,
    name: str,
) -> None:
    """Delete a branch (ref)."""
    resp = client.delete(
        f"/repos/{owner}/{repo}/git/refs/heads/{name}",
    )
    resp.raise_for_status()


def get_branch_sha(
    client: httpx.Client,
    owner: str,
    repo: str,
    name: str,
) -> str:
    """Get the current SHA of a branch."""
    resp = client.get(
        f"/repos/{owner}/{repo}/branches/{name}",
    )
    resp.raise_for_status()
    return resp.json()["commit"]["sha"]
