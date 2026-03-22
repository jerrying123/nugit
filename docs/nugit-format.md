# `.nugit` stack file format

Stack definitions live in the repository under **`.nugit/`** so any client (CLI, VS Code, Chrome, web) can read or update them without a database.

## Primary file

- **Path**: `.nugit/stack.json`
- **Encoding**: UTF-8 JSON
- **Committing**: Authors commit and push changes like any other config; merge conflicts are resolved in git.

## Schema version

- `version` (integer, required): Currently **`1`**. Bump when making incompatible changes.

## Document shape

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | int | yes | Format version. |
| `repo_full_name` | string | yes | `owner/repo` this stack belongs to. |
| `created_by` | string | yes | GitHub login of the stack creator (metadata). |
| `prs` | array | yes | Ordered list of stacked PRs (see below). |
| `resolution_contexts` | array | no | Per-user “fixing” context (see below). |
| `layer` | object | no | Per-branch view: where this copy sits in the stack (see below). Written by **`nugit stack propagate`**. |

### `layer` (optional)

Present on copies committed to a stacked **head** branch. **`prs`** on that branch is a **prefix** of the stack: from the bottom through **this** layer only (e.g. `test-stack0` lists only the bottom PR; the tip branch lists every PR).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `position` | int | yes | Same as this head’s PR entry (`0` = bottom). |
| `stack_size` | int | yes | **Total** number of PRs in the whole stack (not only `prs.length` on this branch). |
| `below` | object | yes | What this PR stacks **on**. Bottom layer: `{ "type": "branch", "ref": "<base_branch>" }` (e.g. `main`). Upper layers: `{ "type": "stack_pr", "pr_number", "head_branch" }` for the PR directly underneath. |
| `above` | object \| null | yes | PR directly **above** this one, same shape as `below`’s `stack_pr`, or **`null`** at the stack tip. |
| `tip` | object | yes (when using propagate) | Stack tip: `{ "pr_number", "head_branch" }` for the top PR. Lets the API load the **full** stack from the tip branch when reading a prefix-only file. |

**Legacy:** If `layer.tip` is omitted, `layer.stack_size` must equal `prs.length` (one file holds the full stack).

### `prs[]` entry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pr_number` | int | yes | GitHub PR number. |
| `position` | int | yes | Zero-based order in the stack (bottom → top). |
| `head_branch` | string | no | Snapshot for validation / UI. |
| `base_branch` | string | no | Snapshot for validation / UI. |
| `head_sha` | string | no | Snapshot (40-char hex or empty). |
| `base_sha` | string | no | Snapshot. |
| `status` | string | no | `open` \| `merged` \| `closed` (default `open`). |
| `has_unabsorbed_changes` | bool | no | Default `false`. |
| `author_github_login` | string \| null | no | For fork/multi-author flows. |
| `is_fork` | bool | no | Default `false`. |
| `head_repo_full_name` | string \| null | no | Fork head repo if different. |
| `base_repo_full_name` | string \| null | no | Base repo override if needed. |

### `resolution_contexts[]` entry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_github_login` | string | yes | Who is resolving. |
| `resolution_pr_number` | int | yes | PR they are fixing toward (tip context). |

## Example

```json
{
  "version": 1,
  "repo_full_name": "acme/app",
  "created_by": "alice",
  "prs": [
    {
      "pr_number": 101,
      "position": 0,
      "head_branch": "feat/base",
      "base_branch": "main",
      "head_sha": "",
      "base_sha": "",
      "status": "open"
    },
    {
      "pr_number": 102,
      "position": 1,
      "head_branch": "feat/next",
      "base_branch": "feat/base",
      "head_sha": "",
      "base_sha": "",
      "status": "open"
    }
  ],
  "resolution_contexts": [
    { "user_github_login": "bob", "resolution_pr_number": 102 }
  ],
  "layer": {
    "position": 1,
    "stack_size": 2,
    "below": { "type": "stack_pr", "pr_number": 101, "head_branch": "feat/base" },
    "above": null
  }
}
```

The `layer` block matches a copy committed on **`feat/next`** (stack tip): `below` points at PR 101; `above` is `null`. On **`feat/base`**, `layer` would have `position` `0`, `below` `{ "type": "branch", "ref": "main" }`, and `above` `{ "type": "stack_pr", "pr_number": 102, "head_branch": "feat/next" }`.

## Validation rules

- `prs` must have unique `pr_number` and unique `position` values.
- Positions should be contiguous `0..n-1` after reorder (clients may normalize).
- `repo_full_name` should match the repository where the file lives (warning only if mismatch).
- If `layer` is present: `layer.position` must match the highest `prs[].position` in the file.
- With **`layer.tip`**: `prs.length === layer.position + 1`, `layer.stack_size` is the full stack depth, and positions must be `0..layer.position` contiguous.
- Without **`layer.tip`** (legacy): `layer.stack_size === prs.length`.

## JSON Schema

Machine-readable schema: [`nugit-stack.schema.json`](./nugit-stack.schema.json).
