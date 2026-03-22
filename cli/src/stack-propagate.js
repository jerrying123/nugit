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
 * @param {string} root
 */
export function assertCleanWorkingTree(root) {
  const out = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
  if (out.trim()) {
    throw new Error("Working tree is not clean; commit or stash before nugit stack propagate");
  }
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
  execGit(root, ["checkout", ref], dryRun);
}

/**
 * @param {string} root
 * @param {string} fileRel path relative to root
 */
function fileContentAtHead(root, fileRel) {
  try {
    return execSync(`git show HEAD:${fileRel}`, { cwd: root, encoding: "utf8" });
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
 */
export async function runStackPropagate(opts) {
  const root = opts.root;
  const message = opts.message || "nugit: propagate stack metadata";
  const push = Boolean(opts.push);
  const dryRun = Boolean(opts.dryRun);
  const remote = opts.remote || "origin";

  const raw = JSON.parse(fs.readFileSync(stackJsonPath(root), "utf8"));
  validateStackDoc(raw);
  /** @type {Record<string, unknown>} */
  const doc = raw;
  const sorted = sortStackPrs(doc.prs);
  if (sorted.length === 0) {
    throw new Error("Stack has no PRs; nothing to propagate");
  }

  if (!dryRun) {
    assertCleanWorkingTree(root);
  }

  const start = getCurrentHead(root);
  const stackRel = path.join(".nugit", "stack.json").replace(/\\/g, "/");

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
        console.error(
          `[dry-run] checkout ${headBranch}, write ${stackRel} (${pos + 1} prs prefix of ${sorted.length}, layer position ${pos})`
        );
        continue;
      }

      checkoutStackHead(root, remote, headBranch, false);

      const existing = fileContentAtHead(root, stackRel);
      if (existing === json) {
        console.error(`Skip ${headBranch}: .nugit/stack.json already matches`);
        continue;
      }

      const dir = path.join(root, ".nugit");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(stackJsonPath(root), json);
      execGit(root, ["add", stackRel], false);
      execGit(root, ["commit", "-m", message], false);
      console.error(`Committed ${stackRel} on ${headBranch}`);

      if (push) {
        execGit(root, ["push", remote, headBranch], false);
        console.error(`Pushed ${remote}/${headBranch}`);
      }
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
