# Real repository checklist (CLI + VS Code)

1. **Auth:** **`nugit auth login`** (bundled device flow), or `export NUGIT_USER_TOKEN=…` (see [stack-view.md](./stack-view.md)).
2. **Clone** your app repo; ensure **stacked branches** are linear (`feat/1` → `feat/2` → `feat/3`).
3. **CLI:**
   ```bash
   nugit init
   nugit prs create …   # or use GitHub UI
   nugit stack add --pr … … …
   nugit stack propagate --push
   ```
4. **VS Code:** open the repo → **Nugit: Load Local .nugit Stack** (or fetch `stack.json` from GitHub via the command palette).

Cross-link stacked PRs for reviewers/authors:

```bash
nugit stack link --from-pr LOWER --to-pr UPPER --role both
```

Inspect a review comment vs the fix on an upper PR:

```bash
nugit stack review pick --pr LOWER
nugit stack review show --from-pr LOWER --comment REVIEW_COMMENT_ID
```
