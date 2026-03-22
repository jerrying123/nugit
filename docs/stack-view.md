# `nugit stack view` — interactive stack viewer

Terminal UI (or `--no-tui` text mode) for a nugit stack: PR chain, conversation comments, line-linked review comments, opening PRs/lines in the browser, posting issue comments, replying in review threads, and requesting reviewers.

**Requires** `NUGIT_USER_TOKEN` (or `STACKPR_USER_TOKEN`) with GitHub API access.

## Usage

```bash
export NUGIT_USER_TOKEN=ghp_...   # or fine-grained PAT

# From a repo with .nugit/stack.json (prefix files auto-expand via layer.tip when possible)
nugit stack view

# Static output (CI / scripts)
nugit stack view --no-tui

# Load stack file from GitHub Contents API
nugit stack view --repo owner/repo --ref my-branch

# Arbitrary stack.json path
nugit stack view --file /path/to/stack.json
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
