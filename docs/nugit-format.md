# `.nugit` stack file format

Stack definitions live in the repository under **`.nugit/`** so the **CLI** and **VS Code extension** can read or update them without a server.

## Primary file

- **Path**: `.nugit/stack.json`
- **Encoding**: UTF-8 JSON
- **Committing**: Authors commit and push changes like any other config; merge conflicts are resolved in git.

**Discovering stacks in a repo:** **`nugit stack list`** loads open PRs, fetches **`.nugit/stack.json`** from each PR’s **head ref** when present, and merges duplicates using the stack **tip** (`layer.tip.pr_number` when set, else the top `prs[]` entry). Use it to see which stacked chains exist for review; then **`nugit view --repo owner/repo --ref <tip-branch>`** (or **`stack fetch`**) for a specific stack.

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
| `cross_pr_links` | array | no | Optional entries written by **`nugit stack link`**: `{ from_pr, to_pr, review_comment_id?, role, created_at }` for cross-PR reviewer/author notes. |
| `layer` | object | no | Per-branch view: where this copy sits in the stack (see below). Written by **`nugit stack propagate`**, which merges each lower stacked head into the next before committing so PR chains stay consistent (see **github-app-and-test-repo.md**). |

### `.nugit/review-state.json` (optional, local)

Not part of the committed stack contract by default. **`nugit stack review done`** appends **review thread ids** you have marked reviewed:

- **`version`**: `1`
- **`threads`**: `{ review_comment_id, marked_at, user_github_login }[]`

Add this file to **`.gitignore`** in your app repo if you do not want to share review progress.

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

## Sidecar files (CLI)

These are optional and **not** read by the VS Code extension today. They help the CLI cache discovery and record stack edits.

### `.nugit/stack-history.jsonl`

Append-only JSON lines. Each line is one record with at least:

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | int | Currently `1` (added by the writer). |
| `id` | string | Unique id for the record. |
| `at` | string | ISO timestamp. |
| `action` | string | e.g. `init`, `split`, `manual`. |
| `repo_full_name` | string | `owner/repo`. |
| `snapshot` | object | optional full `stack.json` document after an action. |
| `parent_record_id` | string | optional link to a previous history line. |
| `tip_pr_number` / `head_branch` | optional | Tip metadata after operations like split. |

**`nugit split`** appends a line with `action: "split"`, `from_pr`, `new_prs`, and `snapshot` when the local stack file was updated.

### `.nugit/stack-index.json`

Regeneratable cache written by **`nugit stack index`** or after a full discovery in **`nugit view`** (depending on **`stackDiscovery.mode`**). Holds merged discovery output (`stacks`, `repo_full_name`, etc.) for the repo. **`stackDiscovery.mode: manual`** expects this file to exist (run **`nugit stack index`** first) unless you pass **`--repo` / `--ref`**.

### `nugit stack graph`

Prints a compiled **node/edge** graph from the last index plus history (`nugit stack graph`; add **`--live`** to refresh discovery first). Used for tooling and debugging stack relationships.

### Stack discovery settings (`~/.config/nugit/config.json`)

| Key | Values | Meaning |
|-----|--------|---------|
| `stackDiscovery.mode` | `eager` \| `lazy` \| `manual` | How **`stack list`** / **`nugit view`** load remote stacks. |
| `stackDiscovery.maxOpenPrs` | number | Cap on open PRs scanned. |
| `stackDiscovery.fetchConcurrency` | number | Parallel fetches for `stack.json` on PR heads. |
| `stackDiscovery.background` | bool | Reserved for future background refresh behavior. |
| `stackDiscovery.lazyFirstPassMaxPrs` | number | In **lazy** mode, first-pass cap unless **`NUGIT_STACK_DISCOVERY_FULL=1`** or **`nugit stack list --full`**. |

Env overrides: `NUGIT_STACK_DISCOVERY_MODE`, `NUGIT_STACK_DISCOVERY_MAX_OPEN_PRS`, `NUGIT_STACK_DISCOVERY_CONCURRENCY`, `NUGIT_STACK_DISCOVERY_BACKGROUND`.

### `nugit split`

Splits **one** PR (same-repo heads only in v1) into **K** layers: each layer is a new branch with a subset of changed files (one commit per layer), pushed and opened as a new PR chained on the previous base. The original PR gets an issue comment listing the new PRs; you close it manually. If the PR appears in **`.nugit/stack.json`**, that entry is replaced by the new PR chain. From **`nugit view`**, select the PR on the overview tab and press **`S`**.

## Validation rules

- `prs` must have unique `pr_number` and unique `position` values.
- Positions should be contiguous `0..n-1` after reorder (clients may normalize).
- `repo_full_name` should match the repository where the file lives (warning only if mismatch).
- If `layer` is present: `layer.position` must match the highest `prs[].position` in the file.
- With **`layer.tip`**: `prs.length === layer.position + 1`, `layer.stack_size` is the full stack depth, and positions must be `0..layer.position` contiguous.
- Without **`layer.tip`** (legacy): `layer.stack_size === prs.length`.

## JSON Schema

Machine-readable schema: [`nugit-stack.schema.json`](./nugit-stack.schema.json).
