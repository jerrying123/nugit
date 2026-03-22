# Real Repo Runbook (Chrome + VS Code + CLI + Web)

This runbook is for using StackPR against a real GitHub repository with **`.nugit/stack.json`** on the default branch (or a ref you pass to the API).

For **GitHub OAuth App + GitHub App** registration, webhook URL (`/api/webhooks/github`), and a **`test-repo/`** sandbox (ignored in the monorepo), see **[github-app-and-test-repo.md](./github-app-and-test-repo.md)**.

## Prerequisites

- A GitHub token with repo access (`NUGIT_USER_TOKEN` or `STACKPR_USER_TOKEN`)
- Local backend on `http://localhost:3001` (see root `README.md`)
- For Chrome against a **local** API: use `manifest.development.json` as your loaded manifest (see `chrome-plugin/README.md`)

## 1) Run end-to-end local API checks

From repo root:

```bash
NUGIT_USER_TOKEN=<token> ./scripts/e2e-local.sh
```

This starts Redis, runs the API without Postgres/migrations, and checks health, `/auth/me`, `/account/pulls`, and `/github/user/repos`.

## 2) Create and push `.nugit/stack.json`

In a clone of your target repository:

```bash
cd cli && npm install
NUGIT_USER_TOKEN=<token> node src/nugit.js init
# Optional overrides: --repo owner/repo --user login (defaults: git origin + /auth/me)
NUGIT_USER_TOKEN=<token> node src/nugit.js prs create --head my-branch --title "PR title"
NUGIT_USER_TOKEN=<token> node src/nugit.js stack add --pr 1
# Edit .nugit/stack.json to add PRs (or use your editor)
git add .nugit/stack.json && git commit -m "Add nugit stack" && git push
```

## 3) Chrome plugin on a real GitHub PR

1. `cd chrome-plugin && npm install`
2. Chrome → `chrome://extensions` → Load unpacked → `chrome-plugin/`  
   - For local API: copy `manifest.development.json` to `manifest.json` before loading (restores `localhost` host permission).
3. Open a PR page in a repo that contains `.nugit/stack.json` with that PR listed.
4. Extension popup: set **API base** (`http://localhost:3001/api`), **Save PAT**, enable **opt-in**.

Expected: content script (on `https://github.com/*`) fetches stack via background → API.

## 4) VS Code plugin

1. Open `vscode-plugin/` → F5 (Extension Host).
2. Open the repository folder that contains `.nugit/stack.json`.
3. Run `StackPR: Save PAT to Secret Storage` (or set `STACKPR_USER_TOKEN`).
4. `StackPR: Load Local .nugit Stack` to populate the sidebar.  
   Or `StackPR: Fetch Stack From API (by PR)` with owner/repo/PR number.

## 5) CLI

```bash
cd cli && npm install
NUGIT_USER_TOKEN=<token> node src/nugit.js prs list
NUGIT_USER_TOKEN=<token> node src/nugit.js stack show
NUGIT_USER_TOKEN=<token> node src/nugit.js stack enrich
```

## 6) Next.js web UI

```bash
cd frontend && npm install && npm run dev
```

Set token on `/login`, then browse repos and open a repo page to view `.nugit/stack.json` from GitHub.

## 7) Troubleshooting

- API logs: `/tmp/stackpr-api.log`
- Verify token:
  ```bash
  curl -H "Authorization: Bearer $NUGIT_USER_TOKEN" http://localhost:3001/api/auth/me
  ```
- `GET .../pr/N/stack` returns 404 if `.nugit/stack.json` is missing, invalid, or does not include PR `N`.
