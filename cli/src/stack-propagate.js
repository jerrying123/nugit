import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { stackJsonPath, validateStackDoc } from "./nugit-stack.js";

/** @param {unknown[]} prs */
export function sortStackPrs(prs) {
  if (!Array.isArray(prs)) {
    return [];
  }
  return [...prs].sort((a, b) => {
    const pa = a && typeof a === "object" ? /** @type {{ position?: number }} */ (a).position : 0;
    const pb = b && typeof b === "object" ? /** @type {{ position?: number }} */ (b).position : 0;
    return (pa ?? 0) - (pb ?? 0);
  });
}

/**
 * Build layer metadata for the PR at `position` in an ordered stack.
 * @param {Array<{ position: number, pr_number: number, head_branch?: string, base_branch?: string }>} sortedPrs
 * @param {number} position
 */
export function buildLayer(sortedPrs, position) {
  const idx = sortedPrs.findIndex((p) => p.position === position);
  if (idx < 0) {
    throw new Error(`No PR with position ${position} in stack`);
  }
  const self = sortedPrs[idx];
  const stack_size = sortedPrs.length;

  /** @type {{ type: 'branch', ref: string } | { type: 'stack_pr', pr_number: number, head_branch: string }} */
  let below;
  if (idx === 0) {
    below = { type: "branch", ref: self.base_branch || "" };
  } else {
    const low = sortedPrs[idx - 1];
    below = {
      type: "stack_pr",
      pr_number: low.pr_number,
      head_branch: low.head_branch || ""
    };
  }

  /** @type {{ type: 'stack_pr', pr_number: number, head_branch: string } | null} */
  let above = null;
  if (idx + 1 < sortedPrs.length) {
    const high = sortedPrs[idx + 1];
    above = {
      type: "stack_pr",
      pr_number: high.pr_number,
      head_branch: high.head_branch || ""
    };
  }

  const tipPr = sortedPrs[sortedPrs.length - 1];
  const tip = {
    pr_number: tipPr.pr_number,
    head_branch: tipPr.head_branch || ""
  };

  return { position, stack_size, below, above, tip };
}

/**
 * @param {Record<string, unknown>} doc validated stack doc
 * @param {ReturnType<typeof sortStackPrs>} sortedPrs
 * @param {number} position
 */
export function documentForHeadBranch(doc, sortedPrs, position) {
  const idx = sortedPrs.findIndex((p) => p.position === position);
  if (idx < 0) {
    throw new Error(`No PR with position ${position} in stack`);
  }
  /** Prefix: this branch only includes PRs from bottom through this layer. */
  const prsCopy = sortedPrs.slice(0, idx + 1).map((p) => ({ ...p }));
  const layer = buildLayer(sortedPrs, position);
  const { layer: _drop, ...rest } = doc;
  return {
    ...rest,
    prs: prsCopy,
    layer
  };
}

function execGit(root, args, dryRun) {
  if (dryRun) {
    console.error(`[dry-run] git ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
    return "";
  }
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

/**
 * Clear stuck merge/rebase state so a later `git checkout` can run.
 * @param {string} root
 */
export function abortStaleGitOperations(root) {
  for (const args of /** @type {const} */ ([["merge", "--abort"], ["rebase", "--abort"]])) {
    try {
      execFileSync("git", args, { cwd: root, stdio: "ignore" });
    } catch {
      /* not in merge/rebase */
    }
  }
}

/** Relative path always with `/` for git and comparisons */
export const STACK_JSON_REL = path.join(".nugit", "stack.json").replace(/\\/g, "/");

/**
 * @param {string} root
 */
function listUnmergedPaths(root) {
  const out = execSync("git diff --name-only --diff-filter=U", { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
  return out;
}

/**
 * When merging the lower head into the upper, `.nugit/stack.json` often conflicts (different prefixes).
 * We take the incoming branch's version and complete the merge; propagate immediately overwrites the file.
 * @param {string} root
 * @param {string} lowerHeadBranch
 * @returns {boolean} true if merge was completed
 */
function resolveStackJsonMergeWithTheirs(root, lowerHeadBranch) {
  const um = listUnmergedPaths(root);
  if (um.length !== 1 || um[0] !== STACK_JSON_REL) {
    return false;
  }
  execGit(root, ["checkout", "--theirs", STACK_JSON_REL], false);
  execGit(root, ["add", STACK_JSON_REL], false);
  execGit(root, ["commit", "--no-edit"], false);
  console.error(
    `Auto-resolved ${STACK_JSON_REL} merge (used ${lowerHeadBranch}); replacing with propagated metadata next.`
  );
  return true;
}

/**
 * Merge the stacked branch below into the current branch so upper heads include
 * the latest `.nugit/stack.json` (and any other commits) from the layer under them.
 * Without this, committing on test0 first leaves test1/test2 missing that commit → GitHub PR conflicts.
 * @param {string} root
 * @param {string} lowerHeadBranch local branch name (e.g. test-stack0)
 * @param {boolean} dryRun
 */
export function mergeLowerStackHead(root, lowerHeadBranch, dryRun) {
  if (!lowerHeadBranch) {
    return;
  }
  if (dryRun) {
    console.error(`[dry-run] git merge --no-edit ${lowerHeadBranch}  # absorb lower stacked head`);
    return;
  }
  try {
    const out = execGit(root, ["merge", "--no-edit", lowerHeadBranch], false);
    if (out) {
      console.error(out);
    }
  } catch (err) {
    if (resolveStackJsonMergeWithTheirs(root, lowerHeadBranch)) {
      return;
    }
    const msg = err && typeof err === "object" && "stderr" in err ? String(/** @type {{ stderr?: Buffer }} */ (err).stderr) : String(err);
    throw new Error(
      `git merge ${lowerHeadBranch} failed while propagating (upper branch must include the lower head). ` +
        `Resolve conflicts, commit the merge, then re-run \`nugit stack propagate\`. Underlying: ${msg.trim() || err}`
    );
  }
}

/**
 * @param {string} root
 */
export function assertCleanWorkingTree(root) {
  const out = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
  if (out.trim()) {
    throw new Error("Working tree is not clean; commit or stash before nugit stack propagate");
  }
}

const BOOTSTRAP_COMMIT_MESSAGE = "Nugit stack creation";

/**
 * If the only dirty path is `.nugit/stack.json`, commit it so propagate can run.
 * @param {string} root
 * @param {boolean} dryRun
 * @param {string} [message]
 * @returns {boolean} whether a commit was made (or would be made in dry-run)
 */
export function tryBootstrapCommitStackJson(root, dryRun, message = BOOTSTRAP_COMMIT_MESSAGE) {
  const full = execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim();
  if (!full) {
    return false;
  }

  const besidesStack = execFileSync(
    "git",
    ["status", "--porcelain", "--", ".", ":(exclude).nugit/stack.json"],
    { cwd: root, encoding: "utf8" }
  ).trim();

  if (besidesStack) {
    throw new Error(
      "Working tree has changes outside `.nugit/stack.json`; commit or stash them before propagate.\n" + besidesStack
    );
  }

  const stackDirty = execFileSync("git", ["status", "--porcelain", "--", ".nugit/stack.json"], {
    cwd: root,
    encoding: "utf8"
  }).trim();

  if (!stackDirty) {
    throw new Error(
      "Working tree is not clean but `.nugit/stack.json` is not among the changes; commit or stash manually.\n" + full
    );
  }

  if (dryRun) {
    console.error(`[dry-run] git add ${STACK_JSON_REL} && git commit -m ${JSON.stringify(message)}`);
    return true;
  }

  execGit(root, ["add", STACK_JSON_REL], false);
  execGit(root, ["commit", "-m", message], false);
  console.error(`Committed ${STACK_JSON_REL} (${message})`);
  return true;
}

/**
 * @param {string} root
 * @returns {{ kind: 'branch' | 'detached', ref: string }}
 */
export function getCurrentHead(root) {
  try {
    const sym = execSync("git symbolic-ref -q --short HEAD", {
      cwd: root,
      encoding: "utf8"
    }).trim();
    if (sym) {
      return { kind: "branch", ref: sym };
    }
  } catch {
    /* detached */
  }
  const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  return { kind: "detached", ref: sha };
}

/**
 * @param {string} root
 * @param {string} remote
 * @param {string} branch
 * @param {boolean} dryRun
 */
export function checkoutStackHead(root, remote, branch, dryRun) {
  execGit(root, ["fetch", remote, branch], dryRun);
  if (dryRun) {
    return;
  }
  // After `git merge`, the index can still block `git checkout` to the next head ("resolve your
  // index first"). Sync to HEAD before switching branches.
  abortStaleGitOperations(root);
  execGit(root, ["reset", "--hard", "HEAD"], false);
  try {
    execGit(root, ["checkout", branch], false);
  } catch {
    execGit(root, ["checkout", "-B", branch, `${remote}/${branch}`], false);
  }
}

/**
 * @param {string} root
 * @param {string} ref
 * @param {boolean} dryRun
 */
export function checkoutRef(root, ref, dryRun) {
  if (dryRun) {
    execGit(root, ["checkout", ref], dryRun);
    return;
  }
  try {
    execGit(root, ["checkout", ref], false);
  } catch {
    abortStaleGitOperations(root);
    execGit(root, ["reset", "--hard", "HEAD"], false);
    execGit(root, ["checkout", ref], false);
  }
}

/**
 * @param {string} root
 * @param {string} fileRel path relative to root
 */
function fileContentAtHead(root, fileRel) {
  try {
    return execFileSync("git", ["show", `HEAD:${fileRel}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.root
 * @param {string} [opts.message]
 * @param {boolean} [opts.push]
 * @param {boolean} [opts.dryRun]
 * @param {string} [opts.remote]
 * @param {boolean} [opts.noMergeLower] if true, skip merging the branch below into each upper head (not recommended)
 * @param {boolean} [opts.bootstrapCommit] if false, skip auto-commit of dirty `.nugit/stack.json` before propagating
 */
export async function runStackPropagate(opts) {
  const root = opts.root;
  const message = opts.message || "nugit: propagate stack metadata";
  const push = Boolean(opts.push);
  const dryRun = Boolean(opts.dryRun);
  const remote = opts.remote || "origin";
  const noMergeLower = Boolean(opts.noMergeLower);
  const bootstrapCommit = opts.bootstrapCommit !== false;

  const raw = JSON.parse(fs.readFileSync(stackJsonPath(root), "utf8"));
  validateStackDoc(raw);
  /** @type {Record<string, unknown>} */
  const doc = raw;
  const sorted = sortStackPrs(doc.prs);
  if (sorted.length === 0) {
    throw new Error("Stack has no PRs; nothing to propagate");
  }

  /** @type {boolean} */
  let bootstrappedDry = false;
  if (!dryRun && bootstrapCommit) {
    tryBootstrapCommitStackJson(root, false);
  }
  if (dryRun && bootstrapCommit) {
    bootstrappedDry = tryBootstrapCommitStackJson(root, true);
  }

  if (!dryRun) {
    assertCleanWorkingTree(root);
  } else if (!bootstrappedDry) {
    assertCleanWorkingTree(root);
  }

  const start = getCurrentHead(root);

  /** @type {string | null} */
  let prevHeadBranch = null;

  try {
    for (const entry of sorted) {
      const headBranch =
        entry && typeof entry === "object" ? String(/** @type {{ head_branch?: string }} */ (entry).head_branch || "").trim() : "";
      if (!headBranch) {
        console.error(`Skipping position ${entry?.position}: missing head_branch`);
        continue;
      }
      const pos = /** @type {{ position: number }} */ (entry).position;
      const toWrite = documentForHeadBranch(doc, sorted, pos);
      validateStackDoc(toWrite);
      const json = JSON.stringify(toWrite, null, 2) + "\n";

      if (dryRun) {
        console.error(`[dry-run] checkout ${headBranch}`);
        if (!noMergeLower && prevHeadBranch) {
          mergeLowerStackHead(root, prevHeadBranch, true);
        }
        console.error(
          `[dry-run] write ${STACK_JSON_REL} (${pos + 1} prs prefix of ${sorted.length}, layer position ${pos})`
        );
        prevHeadBranch = headBranch;
        continue;
      }

      checkoutStackHead(root, remote, headBranch, false);

      if (!noMergeLower && prevHeadBranch) {
        mergeLowerStackHead(root, prevHeadBranch, false);
        console.error(`Merged ${prevHeadBranch} into ${headBranch} before writing stack metadata`);
      }

      const existing = fileContentAtHead(root, STACK_JSON_REL);
      if (existing === json) {
        console.error(`Skip ${headBranch}: .nugit/stack.json already matches`);
        prevHeadBranch = headBranch;
        continue;
      }

      const dir = path.join(root, ".nugit");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(stackJsonPath(root), json);
      execGit(root, ["add", STACK_JSON_REL], false);
      execGit(root, ["commit", "-m", message], false);
      console.error(`Committed ${STACK_JSON_REL} on ${headBranch}`);

      if (push) {
        execGit(root, ["push", remote, headBranch], false);
        console.error(`Pushed ${remote}/${headBranch}`);
      }

      prevHeadBranch = headBranch;
    }
  } finally {
    if (!dryRun) {
      checkoutRef(root, start.ref, false);
    }
  }

  if (dryRun) {
    console.error(`[dry-run] would restore checkout ${start.ref}`);
  }
}
