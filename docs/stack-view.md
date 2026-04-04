# `nugit view` — interactive stack viewer

Terminal UI (or `--no-tui` text mode) for a nugit stack: PR chain, conversation comments, line-linked review comments, opening PRs/lines in the browser, posting issue comments, replying in review threads, and requesting reviewers.

There is **no** `nugit stack view` subcommand — use **`nugit view`** only.

## Auth (preferred: `nugit auth login`)

- **Recommended:** run **`nugit auth login`**. The CLI uses a **bundled** GitHub OAuth App (device flow, browser) and stores the token in **`~/.config/nugit/github-token`**. Set **`GITHUB_OAUTH_CLIENT_ID`** only to use your own OAuth App instead. You do **not** need to create a fine-grained PAT by hand.
- **Alternative:** **`nugit auth pat --token ghp_…`** or **`export NUGIT_USER_TOKEN=…`** (classic PAT with the scopes below).
- **Posting** (issue comments, review replies, request reviewers) **requires** a token with write access (OAuth or PAT).
- **Read-only** browsing of **public** repos can use **unauthenticated `GET`**s (very low rate limits). Set **`NUGIT_GITHUB_UNAUTHENTICATED=0`** to disable that and require a token for every request.

## Usage

```bash
# Preferred sign-in (bundled OAuth App — no env required)
nugit auth login

# From a repo with .nugit/stack.json (prefix files auto-expand via layer.tip when possible)
nugit view

# TTY with no local stack: search GitHub or [c] open this directory’s github.com remote
nugit view

# Positional args: ref defaults to the repo’s GitHub default branch
nugit view owner/repo
nugit view owner/repo my-feature-branch

# Flags (same as positionals; useful in scripts)
nugit view --repo owner/repo --ref my-branch

# Static output (CI / scripts)
nugit view --no-tui

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

## PAT permissions (if you use a classic PAT instead of OAuth)

| Need | Scope |
|------|--------|
| Private repos | **`repo`** |
| Public repos only | **`public_repo`** (verify org policies) |

### Fine-grained PAT (optional)

| Repository permission | Why |
|------------------------|-----|
| **Pull requests: Read and write** | PR metadata, list/post review comments & replies, requested reviewers |
| **Issues: Read and write** | Issue (conversation) comments on the PR |
| **Metadata: Read** | Always on |

### Org / teams

- Requesting **users** as reviewers works when those users can access the repo.
- Requesting **teams** may require org permissions your token can see.

## GitHub Enterprise Server

Set **`GITHUB_API_URL`** to your instance API root, e.g. `https://github.mycompany.com/api/v3`.
