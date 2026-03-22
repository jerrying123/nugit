# StackPR Backend API

Python **FastAPI** backend: **stateless** GitHub proxy and helpers to read **`.nugit/stack.json`** from repositories. Optional **Redis + ARQ** for webhook/async jobs. **Postgres is optional** (leave `DATABASE_URL` empty).

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
cp .env.example .env
# GITHUB_OAUTH_CLIENT_ID for device flow
# GITHUB_APP_* for webhook/installation token paths
# REDIS_URL if using ARQ worker
```

## Run API

Use the project virtualenv so you don’t pick up a broken global `uvicorn` (wrong shebang from another machine/project):

```bash
.venv/bin/uvicorn stackpr.main:app --reload --port 3001
# or: python -m uvicorn stackpr.main:app --reload --port 3001
```

No Alembic/migrations required for default operation.

## Run workers (ARQ)

Requires `REDIS_URL`:

```bash
arq stackpr.worker.WorkerSettings
```

## Auth

- **User token**: `Authorization: Bearer <token>` on each request; **not persisted** by the server.
- **Device flow**: `GET /api/auth/device/start`, `POST /api/auth/device/poll` (response includes `access_token`).
- **PAT**: `POST /api/auth/pat` returns `access_token` for the client to store.
- **Installation token**: used server-side for App operations (comments/checks).

## Useful endpoints

- `GET /api/account/pulls` — user’s PRs (search)
- `GET /api/github/user/repos` — GitHub proxy
- `GET /api/github/repos/{owner}/{repo}/contents/{path}` — file metadata/content
- `GET /api/repos/{owner}/{repo}/pr/{number}/stack` — stack from `.nugit/stack.json`
- `GET /api/repos/{owner}/{repo}/pr/{number}/next-mergeable`

See `../docs/api-contract.md` and `../docs/nugit-format.md`.

## Docker

From repo root, `docker compose --profile app up -d` runs API + worker with Redis (no Postgres).

## Tests

```bash
pytest -q
```
