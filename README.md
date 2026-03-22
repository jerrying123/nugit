# StackPR (nugit)

Monorepo for stacked PR workflows with a **local-first** stack file:

- **`.nugit/stack.json`** is the source of truth: while you’re editing on the tip you keep the **full** `prs[]`; **`nugit stack propagate`** writes a **prefix** of `prs` on each stacked head plus **`layer`** (including **`layer.tip`** pointing at the tip branch) so lower branches don’t list PRs above them.
- **API stack resolution** does not require the file on the default branch: it tries `main` (or default), then the PR’s head/base, then **all open PR head branches** — so **protected `main` is fine** if stacked branches contain the file (use **`nugit stack propagate`** to copy it to each head).
- **Backend** (FastAPI) is **stateless**: GitHub proxy + reading `.nugit` from GitHub; optional Redis/ARQ for jobs. **No Postgres by default.**
- **Next.js** (`frontend/`) — optional web UI (repo list + stack view).
- **Chrome extension** (`chrome-plugin`) — runs on **github.com**; uses the API for stack/PR data.
- **CLI** (`cli`) — creates/edits `.nugit` locally; calls the API for GitHub operations.
- **VS Code extension** (`vscode-plugin`) — reads `.nugit` from the workspace + API for remote sync.

## Structure

- `backend/` — FastAPI API, optional Redis/ARQ worker
- `frontend/` — Next.js UI (`npm run dev` on port 3000)
- `chrome-plugin/` — MV3 extension + Playwright tests
- `cli/` — `nugit` CLI (see below for **PATH**)
- `vscode-plugin/` — VS Code extension
- `docs/api-contract.md` — HTTP contract
- `docs/nugit-format.md` — `.nugit/stack.json` schema
- `docs/stack-view.md` — `nugit stack view` (interactive TUI + PAT scopes)
- `docs/github-app-and-test-repo.md` — GitHub OAuth App + GitHub App, webhooks, and `test-repo/` walkthrough
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
# Optional: GitHub App + webhook secret — see docs/github-app-and-test-repo.md
# User token for CLI/clients: NUGIT_USER_TOKEN (or legacy STACKPR_USER_TOKEN)

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
3. `POST /api/auth/device/poll` with `device_code` → save `access_token` as `NUGIT_USER_TOKEN` (or `STACKPR_USER_TOKEN`)

### PAT

- `POST /api/auth/pat` with `{ "token" }` → `{ "access_token" }` (validate only).

```bash
export NUGIT_USER_TOKEN=<github_pat_or_oauth_token>
# legacy alias: STACKPR_USER_TOKEN
```

## GitHub App and `test-repo/` sandbox

To register a **GitHub OAuth App** (device flow), optional **GitHub App** (webhooks + installation token), and run through a **separate GitHub repository** using the ignored folder `test-repo/`, see **[docs/github-app-and-test-repo.md](docs/github-app-and-test-repo.md)**.

## Client usage

### CLI (`nugit`)

**Run `nugit` on your PATH** (pick one):

1. **Repo wrapper (no `npm link`, no sudo)** — after `cd cli && npm install`, add the scripts dir to `PATH`:
   ```bash
   export PATH="/path/to/nugit/scripts:$PATH"   # put this in ~/.bashrc if you want it permanent
   ```
   Then `nugit` runs [`scripts/nugit`](scripts/nugit), which calls `node …/cli/src/nugit.js`.

2. **`npm link`** — only if your npm **global prefix** is user-writable. If you see `EACCES` under `/usr/lib/node_modules`, either:
   - Set a user prefix, then link:
     ```bash
     mkdir -p ~/.npm-global/bin
     npm config set prefix ~/.npm-global
     export PATH="$HOME/.npm-global/bin:$PATH"
     cd /path/to/nugit && npm link
     ```
   - Or use option **1** above instead of `sudo npm link`.

3. **One-off**: `node /path/to/nugit/cli/src/nugit.js …` (from anywhere), or `node ../cli/src/nugit.js …` from `test-repo/`.

```bash
cd cli && npm install   # required for all options

NUGIT_USER_TOKEN=<token> nugit prs list
# or without PATH:
NUGIT_USER_TOKEN=<token> node cli/src/nugit.js prs list
NUGIT_USER_TOKEN=<token> nugit init
NUGIT_USER_TOKEN=<token> nugit prs create --head my-branch --title "My PR"
NUGIT_USER_TOKEN=<token> nugit stack add --pr 1
NUGIT_USER_TOKEN=<token> nugit stack show
NUGIT_USER_TOKEN=<token> nugit stack fetch --repo owner/repo
NUGIT_USER_TOKEN=<token> nugit stack enrich
NUGIT_USER_TOKEN=<token> nugit stack propagate              # prefix prs + layer on each stacked head
NUGIT_USER_TOKEN=<token> nugit stack propagate --push       # same, then git push each branch
NUGIT_USER_TOKEN=<token> nugit stack view                   # Ink TUI: PRs, comments, reply, reviewers
NUGIT_USER_TOKEN=<token> nugit stack view --no-tui          # static tree + links
```

`STACKPR_USER_TOKEN` still works if `NUGIT_USER_TOKEN` is unset.

**You do not need the FastAPI backend** for most git/stack work: with a PAT, the CLI talks to **api.github.com** for `init` (whoami), `prs create`, **`stack add` / `fetch` / `enrich`**, **`stack view`**, repo metadata, etc. **`stack show`** and **`stack propagate`** only use the filesystem + git. The backend is still used for **device flow**, **`nugit auth pat`** validation, **`nugit prs list`**, and anything else that only exists on StackPR. To route GitHub through the proxy instead: **`NUGIT_GITHUB_VIA_STACKPR_API=1`** (not supported for **`stack view`**). GitHub Enterprise: set **`GITHUB_API_URL`**. PAT scopes for the viewer: **[docs/stack-view.md](docs/stack-view.md)**.

After **`nugit stack add`**, run **`nugit stack propagate`** (or **`nugit stack commit`**) so every stacked head branch has `.nugit/stack.json`; use **`--push`** to publish. You can still commit once on the tip only, but propagate keeps each PR’s branch self-describing on GitHub.

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
NUGIT_USER_TOKEN=<token> ./scripts/e2e-local.sh
# or: STACKPR_USER_TOKEN=<token> ./scripts/e2e-local.sh
```

See `docs/real-repo-runbook.md` for Chrome + VS Code + CLI against a real repo, and `docs/github-app-and-test-repo.md` for GitHub App setup and the `test-repo/` flow.
