# GitHub auth (OAuth preferred), PAT alternative, and `test-repo/` sandbox

The **nugit CLI** uses **GitHub’s REST API** directly. There is **no** bundled HTTP API in this repo.

## Recommended: `nugit auth login` (bundled OAuth App)

The published CLI ships with a **public OAuth App client id** so you can run **`nugit auth login`** immediately after **`npm install`**—no env vars required.

1. Run **`nugit auth login`**:
   - Opens your browser (GitHub device page with the code pre-filled when possible).
   - Waits until you approve in the browser.
   - Saves the token to **`~/.config/nugit/github-token`** (mode `0600`). Next `nugit` commands use it automatically unless env vars override.

Split flow (e.g. SSH without a browser on the same machine): **`nugit auth login --no-wait`**, then **`nugit auth poll --device-code …`** on a machine that can reach GitHub.

Remove the saved file: **`nugit auth logout`** (does not unset env vars).

**Own OAuth App:** set **`GITHUB_OAUTH_CLIENT_ID`** to your app’s client id before `nugit auth login` if you do not want to use the bundled app (forks, policy, or GitHub Enterprise with a different registration).

## Alternative: personal access token (PAT)

If you prefer not to use OAuth:

1. GitHub → **Settings → Developer settings → Personal access tokens** (classic or fine-grained).
2. Scopes for stack workflows: see **[stack-view.md](./stack-view.md)** (repo, read/write PRs, issues, etc.).
3. Point nugit at the token (pick one):
   ```bash
   export NUGIT_USER_TOKEN=ghp_...
   # legacy alias:
   export STACKPR_USER_TOKEN=ghp_...
   ```
   Or **`nugit auth pat --token ghp_…`**. You can also copy the token into **`~/.config/nugit/github-token`** yourself (same as `nugit auth login` writes). If **`NUGIT_USER_TOKEN`** / **`STACKPR_USER_TOKEN`** is set, it **overrides** that file.

## `test-repo/` (local sandbox)

The monorepo root **`.gitignore`** includes **`test-repo/`**. Use it as a **separate git working tree** for a real GitHub repository:

```bash
mkdir -p test-repo && cd test-repo
git init
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
```

Then use **`nugit init`**, **`nugit prs create`**, **`nugit stack add`**, **`nugit stack propagate --push`** from that directory after **`nugit auth login`** (or with **`NUGIT_USER_TOKEN`** set).

Stack branching should be **linear** (each branch from the previous). See the root **README.md** and **`docs/nugit-format.md`**.

Example linear branches in this monorepo’s ignored **`test-repo/`** sandbox (when populated): **`demo/todo-0-postgres`** → **`demo/todo-1-api`** → **`demo/todo-2-nicegui`** (Postgres + FastAPI todo API + NiceGUI UI). See **`test-repo/README.md`** on those branches.

## VS Code extension

The extension reads **`.nugit/stack.json`** from the workspace and calls **api.github.com** with a PAT from **secret storage** or **`NUGIT_USER_TOKEN`**. Optional **`GITHUB_OAUTH_CLIENT_ID`** in the environment enables **Nugit: Login** (device code instructions only; polling is still easiest from a terminal).
