import fs from "fs";
import { getRepoMetadata } from "../api-client.js";
import { findGitRoot, parseRepoFullName, stackJsonPath } from "../nugit-stack.js";
import { runStackViewCommand } from "./run-stack-view.js";
import { renderViewRepoPicker } from "./view-repo-picker-ink.js";

/**
 * Resolve CLI args and open the stack viewer (local file, remote repo, or picker TUI).
 * @param {string | undefined} repoPos
 * @param {string | undefined} refPos
 * @param {{ noTui?: boolean, repo?: string, ref?: string, file?: string }} opts
 */
export async function runNugitViewEntry(repoPos, refPos, opts) {
  if (opts.file) {
    await runStackViewCommand({ file: opts.file, noTui: opts.noTui });
    return;
  }

  const explicitRepo = (repoPos && String(repoPos).trim()) || (opts.repo && String(opts.repo).trim()) || "";
  let ref = (refPos && String(refPos).trim()) || (opts.ref && String(opts.ref).trim()) || "";

  if (explicitRepo) {
    const { owner, repo: rname } = parseRepoFullName(explicitRepo);
    if (!ref) {
      const meta = await getRepoMetadata(owner, rname);
      ref = meta.default_branch || "main";
    }
    await runStackViewCommand({ repo: explicitRepo, ref, noTui: opts.noTui });
    return;
  }

  const root = findGitRoot();
  if (root && fs.existsSync(stackJsonPath(root))) {
    await runStackViewCommand({ noTui: opts.noTui });
    return;
  }

  const tty = process.stdin.isTTY && process.stdout.isTTY;
  if (tty && !opts.noTui) {
    const picked = await renderViewRepoPicker();
    await runStackViewCommand({ repo: picked.repo, ref: picked.ref, noTui: opts.noTui });
    return;
  }

  throw new Error(
    "nugit view: pass owner/repo and optional ref, use --file, run inside a repo with .nugit/stack.json, or use a TTY for the repo picker. " +
      "Sign in with `nugit auth login` or set NUGIT_USER_TOKEN when GitHub returns 401."
  );
}
