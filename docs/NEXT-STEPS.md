# Nugit — next steps & remaining work

Living checklist for **manual verification**, **workflow scope**, and **follow-up work**. Update this file as you complete items or change priorities.

---

## 1. Manual testing (not done yet)

Use **`jerrying123/test-repo`** or your own fork; see [test-repo README](https://github.com/jerrying123/test-repo) and [stack-view.md](./stack-view.md).

| # | Task | Notes |
|---|------|--------|
| ☐ | **`nugit split`** end-to-end | Clean working tree, same-repo PR (no fork v1). TUI → branches → push → new PRs → comment on old PR → local `stack.json` + history. Try **`--dry-run`** first. |
| ☐ | **Stack discovery** | **`nugit stack list`**, **`stack index`**, **`stack graph`** (with/without **`--live`**); config **`stackDiscovery`** modes (**eager** / **lazy** / **manual**). |
| ☐ | **`nugit stack propagate --push`** | On a small test stack; confirm **`layer`** / prefix **`prs`** on each head. |
| ☐ | **`nugit start`** hub (TTY) | Menu: stack view / split / shell; **`--shell`** and **`-c`** skip menu. |
| ☐ | **Stack view on a public repo** that actually uses nugit | e.g. **`nugit view --repo jerrying123/test-repo --ref demo/todo-2-nicegui`** (or tip branch with real **`prs[]`** once PRs exist). Confirm discovery + TUI with **no clone**; try **with** and **without** **`NUGIT_USER_TOKEN`** (rate limits without token). |
| ☐ | **`nugit view` alias** | Same flags as **`nugit stack view`**; smoke-test **`--no-tui`**, **`--file`**, **`--repo`/`--ref`**. |
| ☐ | **GitHub Actions publish** | Release tag → npm (trusted publisher + optional **`NPM_TOKEN`** fallback); prerelease **`--tag next`** if applicable. |

---

## 2. Decide supported workflows (before pruning)

**Goal:** List the **user journeys** you commit to supporting so unused code paths can be removed safely.

Fill in below (edit this file). Examples of “workflow” = one bullet each:

- [ ] **Example:** “Solo dev: local `stack.json`, `stack add`, `propagate`, no `stack list` discovery”
- [ ] **Example:** “Open-source observer: `view --repo public/repo --ref` only, no writes”
- [ ] **Example:** “Full stack: discovery + `stack view` + `split` + `start` hub + npm-installed CLI”
- [ ] **Example:** “CI-only: JSON output, no Ink TUI”

**Workflows we explicitly do *not* support (candidates for removal later):**

- [ ] e.g. device-flow auth only / no PAT
- [ ] e.g. fork-PR split
- [ ] (add yours)

**Out of scope for now (keep code but don’t document as primary):**

- (optional section)

---

## 3. Prune the codebase (after §2 is agreed)

Only after supported workflows are written down:

| # | Task |
|---|------|
| ☐ | Map CLI commands / modules to each supported workflow; mark orphans. |
| ☐ | Remove or gate dead code (feature flags, smaller entrypoints, or delete modules). |
| ☐ | Trim docs that describe removed paths; keep one “supported workflows” page. |
| ☐ | Run **`cd cli && npm test`** and a manual smoke pass on **each** remaining workflow. |

---

## 4. After testing + pruning

| # | Task |
|---|------|
| ☐ | Bump **`nugit-cli`** version and publish if behavior is stable. |
| ☐ | Align **test-repo** README with what you actually verified. |
| ☐ | Optional: tighten **npm “Publishing access”** (tokens disallowed) once trusted publishing is proven. |
| ☐ | Optional: issue templates / **CONTRIBUTING.md** pointing at **`docs/NEXT-STEPS.md`** for maintainers. |

---

## Quick command reference (for §1)

```bash
# Public read-only view (no clone; token optional)
nugit view --repo jerrying123/test-repo --ref demo/todo-2-nicegui

# Split (needs clone + clean tree + token)
nugit split --pr <N>              # or from stack view: S on a PR
nugit split --pr <N> --dry-run

# Alias check
nugit view --help
nugit stack view --help   # same options
```

---

*Last created as a maintainer checklist; reorder or split into GitHub Issues when ready.*
