import { execFileSync } from "child_process";

/**
 * @param {string} root
 * @param {string[]} args
 * @param {{ stdio?: string }} [io]
 */
export function gitExec(root, args, io) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: io?.stdio || "pipe",
      maxBuffer: 20 * 1024 * 1024
    }).trim();
  } catch (e) {
    const err = /** @type {{ stderr?: Buffer, stdout?: Buffer, message?: string }} */ (e);
    const msg =
      (err.stderr && err.stderr.toString()) ||
      (err.stdout && err.stdout.toString()) ||
      err.message ||
      String(e);
    throw new Error(msg.trim().slice(0, 800));
  }
}

/**
 * @param {string} root
 * @param {string} remote
 * @param {string} baseBranch
 * @param {string} headBranch
 */
export function gitFetchRefs(root, remote, baseBranch, headBranch) {
  gitExec(root, ["fetch", remote, baseBranch, headBranch], { stdio: "pipe" });
}

/**
 * @param {string} root
 * @param {string} baseRef e.g. origin/main
 * @param {string} headRef e.g. origin/feat
 */
export function listChangedFilesBetween(root, baseRef, headRef) {
  const out = gitExec(root, ["diff", "--name-only", `${baseRef}...${headRef}`]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {string} root
 */
export function assertCleanWorkingTree(root) {
  const st = gitExec(root, ["status", "--porcelain"]);
  if (st) {
    throw new Error("Working tree is not clean; commit or stash before nugit split.");
  }
}

/**
 * @param {string} root
 * @param {string} remote
 * @param {string} branchName local branch to create
 * @param {string} startRef branch or commit to start from
 * @param {string} headRef where to checkout paths from (e.g. origin/feat)
 * @param {string[]} paths
 * @param {string} message
 */
export function commitLayerFromPaths(root, remote, branchName, startRef, headRef, paths, message) {
  const uniq = [...new Set(paths)].filter(Boolean);
  gitExec(root, ["checkout", "-B", branchName, startRef]);
  if (uniq.length) {
    gitExec(root, ["checkout", headRef, "--", ...uniq]);
  }
  gitExec(root, ["add", "-A"]);
  const st = gitExec(root, ["status", "--porcelain"]);
  if (!st) {
    return false;
  }
  gitExec(root, ["commit", "-m", message]);
  return true;
}

/**
 * @param {string} root
 * @param {string} remote
 * @param {string} branchName
 */
export function gitPushBranch(root, remote, branchName) {
  gitExec(root, ["push", "-u", remote, branchName], { stdio: "inherit" });
}
