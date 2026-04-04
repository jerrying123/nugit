# Nugit (stacked PRs, CLI-first)

Monorepo for **stacked pull requests** using a **local-first** file:

- **`.nugit/stack.json`** — ordered `prs[]`; on each stacked branch, **`nugit stack propagate`** writes a **prefix** plus **`layer`** / **`layer.tip`** so the stack is self-describing on GitHub.
- **`cli/`** — **`nugit`** talks to **api.github.com** only (PAT or OAuth device flow). No bundled server.
- **`vscode-plugin/`** — reads `.nugit/stack.json` and uses the **same GitHub REST** patterns (PAT from env or secret storage).

The **FastAPI backend**, **Chrome extension**, and **Next.js frontend** were removed from this repo; workflows are **CLI + VS Code** only.

## Repo layout

| Path | Purpose |
|------|---------|
| `cli/` | `nugit` CLI (`npm install` in `cli/`) |
| `vscode-plugin/` | VS Code extension |
| `docs/nugit-format.md` | `.nugit/stack.json` schema |
| `docs/stack-view.md` | Interactive `nugit stack view` + PAT scopes |
| `docs/github-app-and-test-repo.md` | PAT, OAuth App client ID, `test-repo/` sandbox |
| `scripts/nugit` | PATH wrapper to run the CLI |
| `docker-compose.yml` | Optional **Redis** only (not required for the CLI) |

## Quick start (CLI)

```bash
cd cli && npm install

# Put nugit on PATH (pick one):
export PATH="/path/to/nugit/scripts:$PATH"
# or: nugit config init && nugit start

export NUGIT_USER_TOKEN=ghp_...   # classic or fine-grained PAT (see docs/stack-view.md)

nugit init
nugit prs list                    # open PRs in repo (from git remote), paginated — pick # for stack
nugit prs list --mine             # only your PRs (search), same --page / --per-page
nugit prs create --head my-branch --title "My PR"
nugit stack add --pr 7 8 9
nugit stack propagate --push
nugit stack view
nugit split --pr 42        # TUI: assign changed files to layers → branches + GitHub PRs
```

**`nugit start`** (TTY, after `nugit config init`): short hub — **stack view**, **split a PR**, or **shell**. Use **`nugit start --shell`** or **`nugit start -c 'cmd'`** to skip the menu. Non-TTY **`nugit start`** still opens the shell directly.

**Stack discovery:** **`nugit stack list`** respects **`stackDiscovery`** in **`~/.config/nugit/config.json`** (or env). **`nugit stack index`** writes **`.nugit/stack-index.json`**; **`nugit stack graph`** merges index + **`.nugit/stack-history.jsonl`**. See **`docs/nugit-format.md`**.

**Auth:** A **PAT** in **`NUGIT_USER_TOKEN`** is enough — **no OAuth App required**. Optional **device flow**: set **`GITHUB_OAUTH_CLIENT_ID`**, run **`nugit auth login`** (opens browser, then saves **`~/.config/nugit/github-token`**). Env vars override that file. **`nugit auth logout`** deletes the file.

**Human vs JSON output:** most commands print formatted text by default; add **`--json`** for machine-readable output.

**Stack + comments without the TUI:**

- `nugit stack comment --pr N --body "…"`
- `nugit stack reply --review-comment ID --body "…"`
- `nugit stack comments list --pr N`
- `nugit stack link --from-pr A --to-pr B [--role reviewer|author|both] [--review-comment ID]`
- `nugit stack review pick --pr N` / `review show --from-pr A --comment ID` / `review done --comment ID`
- `nugit stack list` — scan **open PRs** for `.nugit/stack.json` on each head; lists stacks deduped by tip (for review triage)

Local review progress: **`.nugit/review-state.json`** (optional: add to your project `.gitignore`).

## VS Code

1. Open `vscode-plugin/` → F5  
2. **Nugit: Save PAT** (or set `NUGIT_USER_TOKEN` in the environment)  
3. **Nugit: Load Local .nugit Stack** or **Nugit: Fetch stack.json from GitHub**

## Testing

```bash
cd cli && npm install && npm test
cd vscode-plugin && npm install && npm test
```

**CI:** pushes and pull requests that touch `cli/` run **`CLI tests`** (`.github/workflows/cli-ci.yml`).

## Publishing the CLI to npm

1. Ensure the repository secret **`NPM_TOKEN`** is set (npm automation access token with publish permission).
2. Create a **GitHub Release** and publish it (not a draft). Use a tag named **`vMAJOR.MINOR.PATCH`** (for example **`v0.2.0`**).
3. The workflow **Publish CLI to npm** runs tests, sets `cli/package.json` **`version`** from the tag (without the leading **`v`**), and runs **`npm publish`** for the **`nugit-cli`** package.

## End-to-end (GitHub token)

```bash
NUGIT_USER_TOKEN=<token> ./scripts/e2e-local.sh
```

## Local sandbox

Use an ignored **`test-repo/`** folder as a separate git clone for experiments — see **`docs/github-app-and-test-repo.md`**.
