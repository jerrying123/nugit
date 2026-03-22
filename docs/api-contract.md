# StackPR / Nugit API contract

Base URL: `http://localhost:3001/api`

The backend is **stateless**: it does **not** persist user GitHub tokens or stack rows. Stack order lives in **`.nugit/stack.json`** in each repository.

## Auth

- `GET /auth/device/start`  
  Starts GitHub Device Flow. Returns `device_code`, `user_code`, `verification_uri`, etc.

- `POST /auth/device/poll`  
  Body: `{ "device_code": string }`  
  When authorized: `{ "ok": true, "user": { "login", "id" }, "access_token": string, "token_type" }`  
  **Clients must store `access_token`** (e.g. env `STACKPR_USER_TOKEN`, extension storage, VS Code secrets).

- `POST /auth/pat`  
  Body: `{ "token": string }`  
  Validates the PAT; returns `{ "ok": true, "user": {...}, "access_token": string }` (same token). **Not stored on the server.**

- `GET /auth/me`  
  Requires `Authorization: Bearer <github-user-token>`  
  Returns `{ "login", "id" }`.

## Account

- `GET /account/pulls`  
  Requires bearer token.  
  Query: `state`, `page`, `per_page`  
  Returns GitHub search results for the user’s PRs.

## GitHub proxy (user token)

All require `Authorization: Bearer <token>` unless you only use anonymous GitHub (not supported for these routes — token required).

- `GET /github/user/repos`  
  Query: `page`, `per_page`, `affiliation`  
  Pass-through to GitHub `GET /user/repos`.

- `GET /github/repos/{owner}/{repo}/contents/{path}`  
  Query: optional `ref`  
  Pass-through to GitHub Contents API (files or metadata).

- `GET /github/repos/{owner}/{repo}/pulls`  
  Query: `state`, `page`, `per_page`

- `GET /github/repos/{owner}/{repo}/pulls/{pull_number}`  
  Single PR JSON.

## Repo-scoped stack (reads `.nugit/stack.json` on GitHub)

- `GET /repos/{owner}/{repo}/pr/{number}/stack`  
  Optional bearer (recommended for private repos). Query: optional `ref`.  
  Loads `.nugit/stack.json` from the repo and returns the stack that contains the given PR:

  ```json
  {
    "repo_full_name": "owner/repo",
    "pr": 123,
    "prs": [
      { "pr_number", "position", "head_branch", "base_branch", "status" }
    ],
    "resolution_contexts": []
  }
  ```

- `POST /repos/{owner}/{repo}/pr/{number}/absorb` — requires bearer; enqueues job if Redis/ARQ configured.

- `POST /repos/{owner}/{repo}/pr/{number}/sync` — requires bearer; enqueues job if Redis/ARQ configured.

- `GET /repos/{owner}/{repo}/pr/{number}/next-mergeable`  
  Optional bearer. Uses `.nugit` order + GitHub `mergeable` for the next PR.

## Webhooks

- `POST /webhooks/github` — GitHub App deliveries (signature verification when secret configured).

## WebSocket

- `GET /api/ws` — WebSocket endpoint (echo/MVP).

## Token semantics

- **User token**: sent by clients on each request; used for GitHub REST proxy and reading `.nugit/stack.json` from GitHub.
- **Installation token**: server-side only (comments/checks); not the same as user OAuth/PAT.

## Stack file format

See [nugit-format.md](./nugit-format.md).
