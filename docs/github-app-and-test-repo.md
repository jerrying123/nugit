# GitHub App setup, `test-repo/`, and local test flow

This guide explains how to register **GitHub** credentials for the nugit monorepo and how to use a local **`test-repo/`** folder (ignored by git) against a **second repository on GitHub**.

## How this repo uses GitHub (two pieces)

| Piece | Env vars | Purpose |
|--------|-----------|---------|
| **GitHub OAuth App** | `GITHUB_OAUTH_CLIENT_ID` | Device flow in `backend/src/stackpr/api/auth.py` (optional if you only use a PAT). |
| **GitHub App** | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | JWT → installation access token (`github/app_auth.py`); webhooks → `POST /api/webhooks/github` (`api/webhooks.py`). |

**User token** (PAT or device flow) drives CLI, VS Code, Chrome, and Next.js for listing PRs and reading `.nugit/stack.json` via the API proxy.

**GitHub App** is for **installation-token** server calls and **webhooks** (e.g. `pull_request` events enqueue ARQ jobs when Redis is running). You can use an initial setup with **only OAuth + PAT**; add the GitHub App when you want webhooks and worker jobs against real GitHub.

---

## A) GitHub OAuth App (device flow)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** (or your organization’s Developer settings).
2. **Application name**: e.g. `Nugit local`.
3. **Homepage URL**: `http://localhost:3001` (or your deployed API URL).
4. **Authorization callback URL**: `http://localhost:3001` is sufficient for device flow (GitHub does not redirect the browser to your server the same way as authorization-code web OAuth).
5. If GitHub shows a **Device flow** option for the OAuth app, enable it per GitHub’s current UI.
6. Copy the **Client ID** into `GITHUB_OAUTH_CLIENT_ID` in `backend/.env` (see `backend/.env.example`).

The current backend device-flow implementation uses `client_id` and `device_code` only; no client secret is stored on the server for that path.

---

## B) GitHub App (webhooks + installation API)

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **GitHub App name**: e.g. `Nugit StackPR`.
3. **Homepage URL**: same as above.
4. **Webhook**
   - Enable **Active**.
   - **Webhook URL**: must be **publicly reachable** and end with **`/api/webhooks/github`**  
     Example: `https://<your-ngrok-host>/api/webhooks/github`  
     For local dev, forward to `http://localhost:3001/api/webhooks/github` using [smee.io](https://smee.io) or ngrok.
   - **Webhook secret**: use a long random string and set `GITHUB_WEBHOOK_SECRET` in `backend/.env`.  
     If you leave `GITHUB_WEBHOOK_SECRET` **empty**, signature verification is skipped in dev (`github/webhook_router.py`) — convenient but insecure.
5. **Repository permissions** (minimal set for current code paths):
   - **Contents**: Read — read `.nugit/stack.json` with installation token (e.g. worker speculative-merge).
   - **Pull requests**: Read — fetch PR / mergeable state.
   - **Metadata**: Read-only (default).
   - Add write permissions later if you implement comments, checks, or branch updates via the app.
6. **Subscribe to events**: enable **Pull request** (handler uses `pull_request` in `api/webhooks.py`).
7. **Installation**: restrict to **Only on this account** or a single org for testing.
8. After creation, copy **App ID** → `GITHUB_APP_ID`.
9. **Generate a private key** (`.pem`). Put the **full PEM** in `GITHUB_APP_PRIVATE_KEY` inside `backend/.env` (multi-line). Never commit `.env` or the key file.
10. **Install the app** on the user or org that owns your **test GitHub repository** (see below). Prefer installing only on that repo.

---

## C) Wire the running API

In `backend/.env` (template: `backend/.env.example`):

| Variable | Source |
|----------|--------|
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App client ID |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key PEM |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret (optional in dev) |
| `REDIS_URL` | e.g. `redis://localhost:6379` if you want webhook → ARQ jobs |

Without Redis, the API starts without an ARQ pool and webhook handlers will not enqueue jobs (`stackpr/main.py`).

After configuring a tunnel, use the GitHub App’s **Recent Deliveries** to confirm `POST` to `/api/webhooks/github` returns **200**.

---

## D) `test-repo/` in this monorepo

The path **`test-repo/`** at the monorepo root is listed in the root **`.gitignore`**.

- Use it as a **separate git working tree** (clone or `git init` + `git remote add`) for a **different repository on GitHub** (e.g. `youruser/nugit-test-repo`).
- Do **not** commit `test-repo` contents into the nugit monorepo; it is only a local sandbox path.

---

## E) End-to-end test using `test-repo`

1. **Create a repository on GitHub**  
   e.g. `youruser/nugit-test-repo` (empty README is fine).

2. **Create local `test-repo` under the monorepo** (ignored by git):

   ```bash
   cd /path/to/nugit
   mkdir -p test-repo
   cd test-repo
   git init
   git remote add origin git@github.com:youruser/nugit-test-repo.git
   # or https://github.com/youruser/nugit-test-repo.git
   ```

3. **Run the stack** from the monorepo root: Redis (optional), backend with `backend/.env` filled as needed.

4. **Authenticate as a user**  
   Set `NUGIT_USER_TOKEN` (or legacy `STACKPR_USER_TOKEN`) to a PAT, or complete device flow and export the token (`nugit auth poll` prints `export` hints).

5. **Prerequisites in `test-repo`** (example: three branches stacked on `main`)

   You already have **`main`** and branches **`test-stack0`**, **`test-stack1`**, **`test-stack2`** where each branch stacks on the previous (forked from `main` → `test-stack0` → `test-stack1` → `test-stack2`). Ensure all four refs exist **on GitHub**:

   ```bash
   cd /path/to/nugit/test-repo
   git push -u origin main
   git push -u origin test-stack0
   git push -u origin test-stack1
   git push -u origin test-stack2
   ```

   API must be running (`backend` + `NUGIT_USER_TOKEN` or `STACKPR_USER_TOKEN` exported).

6. **Create `.nugit/stack.json` and open stacked PRs** (commands below run from **`test-repo`**)

   **CLI deps** (once): `cd /path/to/nugit/cli && npm install`.

   **So `nugit` works in the shell:** prefer adding the repo **`scripts/`** directory to `PATH` (wrapper script, no `npm link`, avoids `EACCES` on `/usr/lib/node_modules`):
   ```bash
   export PATH="/path/to/nugit/scripts:$PATH"
   ```
   Or use `node /path/to/nugit/cli/src/nugit.js …` everywhere instead of `nugit …`.  
   `npm link` from the monorepo root only works if your npm global prefix is user-writable (see root `README.md` if you hit permission errors).

   ```bash
   cd /path/to/nugit/cli && npm install
   export PATH="/path/to/nugit/scripts:$PATH"
   cd /path/to/nugit/test-repo
   export NUGIT_USER_TOKEN=...   # or STACKPR_USER_TOKEN

   # Empty stack file (repo + login from origin + /auth/me; optional: --repo owner/repo --user login)
   nugit init

   # Open PRs: each head targets the previous branch so GitHub shows a dependency chain
   nugit prs create --head test-stack0 --base main --title "Stack 0"
   nugit prs create --head test-stack1 --base test-stack0 --title "Stack 1"
   nugit prs create --head test-stack2 --base test-stack1 --title "Stack 2"

   # After each create, note the PR number from the JSON (field "number"), then add bottom → top:
   nugit stack add --pr <PR_FOR_test-stack0>
   nugit stack add --pr <PR_FOR_test-stack1>
   nugit stack add --pr <PR_FOR_test-stack2>

   # Write prefix `prs` + `layer`/`tip` on every stacked head (see docs/nugit-format.md).
   # Use --push to push each branch after committing, or push manually.
   nugit stack propagate --push
   ```

   **Protected `main` / default branch:** You do **not** need to merge `.nugit/stack.json` onto `main`. The API resolves the file by trying the default branch, then the requested PR’s head/base, then **every open PR head branch** (`fetch_nugit_stack_document_for_pr` in the backend). As long as at least one stacked branch on GitHub contains a valid file (after `propagate`, each head does), stack endpoints work for **any** PR in the stack.

   **Per-branch file (recommended):** After editing the stack on your tip branch (full `prs[]` in your working copy), run **`nugit stack propagate`** (alias **`nugit stack commit`**) so each stacked head gets a **prefix** of `prs` (only PRs through that branch), plus **`layer`** (below → above) and **`layer.tip`** pointing at the stack tip so the API can still return the full stack. See `docs/nugit-format.md`.

   **GitHub’s PR UI** does not know about nugit stacks by default — membership is in-repo metadata (and the API/extension). To make stacks obvious on every PR, you’d add something like a **bot comment**, **check run**, or **Chrome extension** that calls this API.

   If PRs already exist on GitHub, skip `prs create` and only run **`nugit stack add --pr N`** for each, in stack order (first merged base first).

   **Overrides:** `nugit init --repo owner/repo --user login` if origin or token login is wrong.

7. **Verify the API sees the stack** (use any PR number that appears in `.nugit/stack.json`; replace `OWNER/REPO` — or rely on `origin` and read `repo_full_name` from the file):

   ```bash
   curl -sS -H "Authorization: Bearer ${NUGIT_USER_TOKEN:-$STACKPR_USER_TOKEN}" \
     "http://localhost:3001/api/repos/jerrying123/test-repo/pr/6/stack"
   ```

   Expect JSON with `prs` ordered like your `.nugit/stack.json` when that PR is part of the stack.

   **Interactive stack viewer:** with a PAT that can read/write PRs and issues (see **[stack-view.md](./stack-view.md)**), run `nugit stack view` from `test-repo` for a terminal UI over the stack (comments, review lines, request reviewers). No local FastAPI process required.

8. **Optional: GitHub App + worker**

   - Install the GitHub App on `nugit-test-repo` only.
   - Point the webhook URL (via smee/ngrok) at `/api/webhooks/github`.
   - Run the ARQ worker: `arq stackpr.worker.WorkerSettings` (with `REDIS_URL` set).
   - Open, synchronize, or merge PRs and confirm deliveries in the app settings and worker logs.

---

## Quick checklist

### Done (your setup)

- [x] **GitHub OAuth App** created → set `GITHUB_OAUTH_CLIENT_ID` in **`backend/.env`** (FastAPI reads that file; the repo root `.env` is not loaded by uvicorn).
- [x] **User token** — `NUGIT_USER_TOKEN` (or `STACKPR_USER_TOKEN`) in repo root **`.env`** (or anywhere you export from). The **API does not read this**; only your CLI, `curl`, Chrome, VS Code, or frontend need it. Before terminal commands, load it, e.g. from repo root:
  ```bash
  set -a && source .env && set +a
  ```
  (Adjust if your `.env` format needs filtering; avoid committing real tokens.)
- [x] **`test-repo/`** — local sandbox present and tied to your separate GitHub test repository.

### Next (stack + API smoke test)

- [x] **`backend/.env`** includes `GITHUB_OAUTH_CLIENT_ID` (and leave GitHub App vars empty until you add the App).
- [x] Start **Redis** (optional for webhooks/worker; API runs without it): `docker compose up -d redis`
- [x] Run the **API** from `backend/` using **this repo’s venv** (don’t rely on a global `uvicorn` — it may point at another project’s Python and fail with `bad interpreter`):
  ```bash
  cd backend
  python -m venv .venv
  .venv/bin/pip install -e ".[dev]"
  .venv/bin/uvicorn stackpr.main:app --reload --port 3001
  ```
  Equivalent: activate `.venv` then `python -m uvicorn stackpr.main:app --reload --port 3001`.
- [x] With `NUGIT_USER_TOKEN` (or `STACKPR_USER_TOKEN`) exported, verify:  
  `curl -H "Authorization: Bearer $NUGIT_USER_TOKEN" http://localhost:3001/api/auth/me`
- [ ] In **`test-repo/`**: push **`main`**, **`test-stack0`**, **`test-stack1`**, **`test-stack2`**; **`nugit init`**; three **`nugit prs create`** (bases `main` → `test-stack0` → `test-stack1`); three **`nugit stack add --pr`** in order; **`nugit stack propagate --push`** (or commit on tip then propagate) so each head has `.nugit/stack.json`.
- [ ] **Verify stack endpoint** (replace owner, repo, PR):  
  `curl -sS -H "Authorization: Bearer $NUGIT_USER_TOKEN" "http://localhost:3001/api/repos/OWNER/REPO/pr/PR_NUMBER/stack"`

### Later (GitHub App — optional)

- [ ] GitHub App created → `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`
- [ ] Webhook secret → `GITHUB_WEBHOOK_SECRET` (or empty for insecure local dev)
- [ ] Public webhook URL → `…/api/webhooks/github` (smee/ngrok)
- [ ] App installed on the test GitHub repo
- [ ] **Redis + worker** if you want webhook-triggered ARQ jobs (`arq stackpr.worker.WorkerSettings`)
