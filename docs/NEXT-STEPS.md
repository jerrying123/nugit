# Nugit — next steps & tracking

**Source of truth for product scope:** [supported-workflows.md](./supported-workflows.md) — what the CLI supports, out-of-scope items, and auth paths.

This file is the **ordered tracker**: what to verify next, what to prune after that, and release follow-ups. Update checkboxes and **Current focus** as you go.

---

## Current focus

*Edit this block to the single next thing you’re doing (owner + optional date).*

| | |
|--|--|
| **Now** | *(e.g. Manual pass: `nugit split` e2e on test-repo)* |
| **Then** | *(e.g. Stack discovery modes + `stack graph --live`)* |
| **Blocked on** | *(optional)* |

---

## Phase 1 — Verify supported workflows

Goal: each **user journey** in [supported-workflows.md](./supported-workflows.md) has been exercised at least once on a real or sandbox repo (**[jerrying123/test-repo](https://github.com/jerrying123/test-repo)** or your fork). See [stack-view.md](./stack-view.md) and [github-app-and-test-repo.md](./github-app-and-test-repo.md) for auth.

| Step | Journey (see supported doc) | Task | Done |
|------|----------------------------|------|:----:|
| 1.1 | §2 Stack in clone | **`nugit split`** end-to-end: clean tree, **same-repo** PR, TUI → branches → push → new PRs → local **`stack.json`** + history. Try **`--dry-run`** first. | ☐ |
| 1.2 | §6 Discovery | **`nugit stack list`**, **`stack index`**, **`stack graph`** (with/without **`--live`**); **`stackDiscovery`** **eager** / **lazy** / **manual**. | ☐ |
| 1.3 | §2 Propagate | **`nugit stack propagate --push`** on a small stack; confirm **`layer`** and prefix **`prs`** on each head. | ☐ |
| 1.4 | §4 Start hub | **`nugit start`** (TTY): **`nugit view`** path, split, shell; **`--shell`** / **`-c`** skip menu. | ☐ |
| 1.5 | §3 View (remote) | **`nugit view`** on a **public** repo that uses nugit, e.g. **`nugit view --repo jerrying123/test-repo --ref …`**. With and **without** token (rate limits). | ☐ |
| 1.6 | §3 View (CLI + picker) | Smoke: **`--no-tui`**, **`--file`**, **`--repo`/`--ref`**, **`owner/repo`**, bare **`nugit view`** (TTY picker: **`[c]`** / search). | ☐ |
| 1.7 | §1 Auth | Fresh machine: **`npm install -g nugit-cli`** (or local **`cli/`**), **`nugit auth login`** only (no **`GITHUB_OAUTH_CLIENT_ID`**). Optional: PAT path still works. | ☐ |
| 1.8 | §5 Split → init | Split a PR in a repo **without** existing **`.nugit/stack.json`**; confirm **`stack.json`** appears with new PRs after success. | ☐ |
| 1.9 | Publish | **GitHub Release** → npm via [publish-npm.yml](../.github/workflows/publish-npm.yml); trusted publisher + optional **`NPM_TOKEN`**; prerelease **`--tag next`** if needed. | ☐ |

---

## Phase 2 — Prune after verification

Only after Phase 1 is **good enough** for the journeys you care about (or explicitly deferred):

| Step | Task | Done |
|------|------|:----:|
| 2.1 | Map **`cli/src`** modules to [supported-workflows.md](./supported-workflows.md) journeys; list orphans. | ☐ |
| 2.2 | Remove or gate dead code (flags, entrypoints, or delete modules). | ☐ |
| 2.3 | Trim docs that describe removed paths; keep **supported-workflows.md** accurate. | ☐ |
| 2.4 | **`cd cli && npm test`** + one manual smoke per **supported** journey still in the doc. | ☐ |

---

## Phase 3 — After testing + pruning

| Step | Task | Done |
|------|------|:----:|
| 3.1 | Bump **`nugit-cli`** version and publish when behavior is stable. | ☐ |
| 3.2 | Align **[test-repo README](https://github.com/jerrying123/test-repo)** (or your sandbox) with what you verified. | ☐ |
| 3.3 | Optional: npm **Publishing access** / tokens policy once OIDC is proven. | ☐ |
| 3.4 | Optional: issue templates / **CONTRIBUTING.md** linking **supported-workflows.md** + **NEXT-STEPS.md**. | ☐ |

---

## Quick command reference (Phase 1)

```bash
# Public read-only view (token optional; low limits if omitted)
nugit view --repo jerrying123/test-repo --ref demo/todo-2-nicegui

# Split (clone + clean tree + auth)
nugit split --pr <N>              # or from nugit view: S on a PR
nugit split --pr <N> --dry-run

nugit view --help
nugit auth login
```

---

*Reorder rows or split into GitHub Issues when the tracker outgrows this file.*
