# Supported workflows (CLI product scope)

**Canonical reference** for what nugit **commits to supporting** in this repo. When changing behavior or pruning code, keep this document accurate.

**Related:** [NEXT-STEPS.md](./NEXT-STEPS.md) — ordered checklist for verification, pruning, and release.

---

## Product shape

- **CLI-only.** No `docker-compose`, no bundled HTTP API or web UI in this monorepo.
- **GitHub REST** (`api.github.com` by default; **`GITHUB_API_URL`** for GitHub Enterprise Server).
- **Local-first stack file:** **`.nugit/stack.json`** is the source of truth in a clone; **`nugit stack propagate`** keeps stacked heads self-describing.

---

## Authentication (supported paths)

| Path | Role |
|------|------|
| **`nugit auth login`** | Default. GitHub **device flow** with **bundled OAuth App** client id; token saved to **`~/.config/nugit/github-token`**. |
| **`GITHUB_OAUTH_CLIENT_ID`** | Optional override (custom OAuth App, fork, or policy). |
| **`NUGIT_USER_TOKEN`** / **`STACKPR_USER_TOKEN`** / **`nugit auth pat`** | Alternative: classic or fine-grained PAT. Env overrides saved file. |
| **Unauthenticated reads** | **Public** repos only, **low** rate limits; disable with **`NUGIT_GITHUB_UNAUTHENTICATED=0`** if desired. |

We **do not** require users to create a fine-grained PAT by hand for the happy path.

---

## User journeys we support

### 1. Sign in and configure CLI

- **`nugit auth login`** (no env required for default app).
- **`nugit config init`** where applicable (e.g. shell / start hub).
- **`nugit env`** for exporting config-derived env in shells.

### 2. Create and maintain a stack in a clone

- **`nugit init`** → **`nugit prs list`** / **`nugit prs create`** → **`nugit stack add`** → **`nugit stack propagate`** (with **`--push`** when publishing metadata to branches).
- **`nugit stack show`**, **`fetch`**, **`enrich`**, **`comment`**, **`reply`**, **`comments`**, **`link`**, **`review`** subcommands as documented in **`nugit stack --help`** and **`docs/nugit-format.md`**.

### 3. Browse and act on a stack from the terminal (`nugit view`)

- **Local:** repo with **`.nugit/stack.json`** — **`nugit view`** loads it.
- **Remote by coordinates:** **`nugit view owner/repo`** with optional **`ref`**; if **`ref`** is omitted, use GitHub’s **default branch**.
- **Flags:** **`--repo`**, **`--ref`**, **`--file`**, **`--no-tui`** (script/CI friendly).
- **TTY, no local stack, no args:** **Ink picker** — current directory’s **github.com** remote (**`[c]`**), **repository search**, pick repo; then open viewer (default branch resolved via API).
- **From viewer:** keys documented in **`docs/stack-view.md`** (e.g. **`S`** → split selected PR).

### 4. Entry hub (`nugit start`)

- **TTY:** menu oriented toward **`nugit view`** (repo discovery / search), **split a PR**, and **shell** (where **`nugit config init`** has been run).
- **Non-TTY / flags:** **`--shell`**, **`-c`** — skip menu as today.

### 5. Split one PR into layered PRs (`nugit split`)

- **Same-repo PR** in a clean working tree (current supported v1; fork workflows not primary).
- **TUI** assigns files to layers → materialize branches, push, open/update GitHub PRs.
- If **`.nugit/stack.json`** was **missing**, **create** it after a successful split with the **new** PRs (stack initialized from split outcome).
- **`--dry-run`** for local-only validation.

### 6. Discover stacks across open PRs (review / triage)

- **`nugit stack list`**, **`nugit stack index`**, **`nugit stack graph`** with **`stackDiscovery`** modes in user config (**`docs/nugit-format.md`**).
- **`--live`** / index + history where implemented.

### 7. Scripting and CI

- Commands that expose **`--json`** for machine-readable output.
- **`nugit view --no-tui`** for non-interactive summary where supported.

---

## Explicitly out of scope (this repo)

| Item | Notes |
|------|--------|
| VS Code / Chrome / Next.js / FastAPI stacks | Removed from this monorepo; not shipped here. |
| Bundled Redis / compose stacks | Not part of the CLI product. |
| **`nugit stack view`** | Removed; use **`nugit view`** only. |

---

## Supported-but-secondary / caveats

- **Fork-based split** or multi-remote flows: **not** the primary documented path; same-repo split is the default story.
- **GitHub Enterprise:** supported via **`GITHUB_API_URL`**; OAuth app registration may differ from github.com — **`GITHUB_OAUTH_CLIENT_ID`** override when needed.

---

## When editing the CLI

- Prefer changes that **fit a row** in **User journeys** above.
- If adding a major journey, **update this file** and add verification steps to **NEXT-STEPS.md**.
- If removing code, confirm it is **not** required by any **supported** journey (or demote the journey here first).

---

*Maintainers: keep in sync with the root **README.md** quick start and **docs/stack-view.md** / **docs/nugit-format.md**.*
