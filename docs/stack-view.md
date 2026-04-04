# `nugit stack view` / `nugit view` — interactive stack viewer

**`nugit view`** is a shorthand for **`nugit stack view`** (same flags).

Terminal UI (or `--no-tui` text mode) for a nugit stack: PR chain, conversation comments, line-linked review comments, opening PRs/lines in the browser, posting issue comments, replying in review threads, and requesting reviewers.

## Token and public repos

- **Posting** (issue comments, review replies, request reviewers) **requires** `NUGIT_USER_TOKEN` (or `STACKPR_USER_TOKEN` / saved device-flow token) with the scopes described below.
- **Read-only browsing** of **public** repositories can work **without** a token: the CLI sends **unauthenticated `GET`** requests to the GitHub API (same data you can see on github.com). Rate limits are **much lower** (~60 requests/hour per IP). For everyday use, set a PAT anyway.
- To **force** a token for every request (disable unauthenticated GETs), set **`NUGIT_GITHUB_UNAUTHENTICATED=0`**.

## Usage

```bash
# Optional — recommended for rate limits and any write actions
export NUGIT_USER_TOKEN=ghp_...   # or fine-grained PAT

# From a repo with .nugit/stack.json (prefix files auto-expand via layer.tip when possible)
nugit stack view
# same:
nugit view

# Static output (CI / scripts)
nugit view --no-tui

# No clone needed: load .nugit/stack.json from GitHub (public repo OK without token for reads)
nugit view --repo owner/repo --ref my-branch

# Arbitrary stack.json path
nugit view --file /path/to/stack.json
```

## TUI keys

| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection (PR on Overview tab; comment line on other tabs) |
| `k` / `↑` | Move up |
| `Tab` / `]` | Next tab (overview → conversation → review) |
| `[` | Previous tab |
| `o` | Open selected PR in browser |
| `l` | Open selected **review** comment `html_url` (line on GitHub) |
| `r` | New **issue** comment on selected PR (prompt after UI exits briefly) |
| `t` | **Reply** in review thread for selected review comment |
| `R` | **Request reviewers** (comma-separated GitHub usernames) |
| `S` | **Split** the selected PR (**overview** tab): runs **`nugit split`** (new layered PRs + local **`stack.json`** update when applicable) |
| `u` | Refresh PR rows from GitHub |
| `q` / Esc | Quit |

## PAT permissions

### Classic personal access token (github.com)

| Need | Scope |
|------|--------|
| Private repos | **`repo`** |
| Public repos only | **`public_repo`** (verify org policies) |

Posting comments or requesting reviewers needs **write** access → typically **`repo`** on private repositories.

### Fine-grained PAT

| Repository permission | Why |
|------------------------|-----|
| **Pull requests: Read and write** | PR metadata, list/post review comments & replies, requested reviewers |
| **Issues: Read and write** | Issue (conversation) comments on the PR |
| **Metadata: Read** | Always on |

**Contents: Read** is optional for this viewer (links use `html_url`; no file blob fetch in MVP).

### Org / teams

- Requesting **users** as reviewers works when those users can access the repo.
- Requesting **teams** (`team_reviewers`) may require org permissions your token can see; if API errors, check team visibility and fine-grained token repository access.

## GitHub Enterprise Server

Set **`GITHUB_API_URL`** to your instance API root (same as other `nugit` direct calls), e.g. `https://github.mycompany.com/api/v3`.
