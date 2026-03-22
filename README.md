# StackPR (nugit)

Monorepo for stacked PR workflows with a **local-first** stack file:

- **`.nugit/stack.json`** in the repository is the source of truth for stack order.
- **Backend** (FastAPI) is **stateless**: GitHub proxy + reading `.nugit` from GitHub; optional Redis/ARQ for jobs. **No Postgres by default.**
- **Next.js** (`frontend/`) — optional web UI (repo list + stack view).
- **Chrome extension** (`chrome-plugin`) — runs on **github.com**; uses the API for stack/PR data.
- **CLI** (`cli`) — creates/edits `.nugit` locally; calls the API for GitHub operations.
- **VS Code extension** (`vscode-plugin`) — reads `.nugit` from the workspace + API for remote sync.

## Structure

- `backend/` — FastAPI API, optional Redis/ARQ worker
- `frontend/` — Next.js UI (`npm run dev` on port 3000)
- `chrome-plugin/` — MV3 extension + Playwright tests
- `cli/` — Node CLI
- `vscode-plugin/` — VS Code extension
- `docs/api-contract.md` — HTTP contract
- `docs/nugit-format.md` — `.nugit/stack.json` schema
- `docker-compose.yml` — Redis (and optional Postgres for legacy experiments)

## Quick start (local API)

```bash
# 1) Redis only (optional if you skip ARQ/webhook jobs)
docker compose up -d redis

# 2) Backend
cd backend
python -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env
# Leave DATABASE_URL empty for default stateless mode.
# GITHUB_OAUTH_CLIENT_ID=<your-oauth-app-client-id>  # for device flow

# 3) Run API (no Alembic)
.venv/bin/uvicorn stackpr.main:app --reload --port 3001
```

- API: `http://localhost:3001/api`
- Docs: `http://localhost:3001/docs`
- Health: `http://localhost:3001/health`

## Web UI (optional)

```bash
cd frontend && npm install && npm run dev
```

Open `http://localhost:3000`, set a PAT on **Token** (stored in the browser only). CORS allows `localhost:3000` → API.

## Docker Compose

```bash
# Redis only (enough for API + worker profile)
docker compose up -d redis

# Backend + worker (no Postgres)
docker compose --profile app up -d
```

Postgres service remains in `docker-compose.yml` for optional legacy use but is **not** required for the app profile.

## Auth

Tokens are **returned to clients** and **not stored** on the server.

### Device flow

1. `GET /api/auth/device/start`
2. Open `verification_uri` and enter `user_code`
3. `POST /api/auth/device/poll` with `device_code` → save `access_token` as `STACKPR_USER_TOKEN`

### PAT

- `POST /api/auth/pat` with `{ "token" }` → `{ "access_token" }` (validate only).

```bash
export STACKPR_USER_TOKEN=<github_pat_or_oauth_token>
```

## Client usage

### CLI

```bash
cd cli && npm install
STACKPR_USER_TOKEN=<token> node src/stackpr.js prs:list
STACKPR_USER_TOKEN=<token> node src/stackpr.js stack:init --repo owner/repo --user your_login
STACKPR_USER_TOKEN=<token> node src/stackpr.js stack:show
STACKPR_USER_TOKEN=<token> node src/stackpr.js stack:fetch-remote --repo owner/repo
```

Commit and push `.nugit/stack.json` after `stack:init`.

### Chrome extension

1. `cd chrome-plugin && npm install`
2. Load unpacked from `chrome-plugin/`
3. For **local API**, copy `manifest.development.json` over `manifest.json` (adds `http://localhost:3001/*`), or add your API host to `host_permissions` in `manifest.json`.
4. Popup: set API base URL if needed, opt-in, save PAT.

### VS Code

1. Open `vscode-plugin/` → F5
2. `StackPR: Save PAT to Secret Storage` (or `STACKPR_USER_TOKEN` in env)
3. `StackPR: Load Local .nugit Stack` or `StackPR: Fetch Stack From API (by PR)`

## Testing

```bash
cd backend && .venv/bin/pytest -q
cd chrome-plugin && npm install && npx playwright test
cd cli && npm install && npm test
cd vscode-plugin && npm install && npm test
cd frontend && npm install && npm run build
```

## End-to-end script

```bash
STACKPR_USER_TOKEN=<token> ./scripts/e2e-local.sh
```

See `docs/real-repo-runbook.md` for Chrome + VS Code + CLI against a real repo.
