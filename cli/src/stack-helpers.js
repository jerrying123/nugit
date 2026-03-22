import { readStackFile, parseRepoFullName, validateStackDoc, findGitRoot } from "./nugit-stack.js";
import { sortStackPrs } from "./stack-propagate.js";

/**
 * @param {string | null} repoOpt owner/repo override
 */
export function loadStackContext(repoOpt) {
  const root = findGitRoot();
  if (!root) {
    throw new Error("Not inside a git repository");
  }
  const doc = readStackFile(root);
  if (!doc) {
    throw new Error("No .nugit/stack.json — run nugit init first");
  }
  validateStackDoc(doc);
  const repoFull = repoOpt || doc.repo_full_name;
  if (!repoFull) {
    throw new Error("Missing repo_full_name in stack file; pass --repo owner/repo");
  }
  const { owner, repo } = parseRepoFullName(repoFull);
  const sorted = sortStackPrs(doc.prs);
  return { root, doc, owner, repo, sorted };
}

/**
 * @param {ReturnType<typeof sortStackPrs>} sorted
 * @param {number} fromPr
 * @param {number} toPr
 */
export function assertFromBelowTo(sorted, fromPr, toPr) {
  const idxFrom = sorted.findIndex((p) => p.pr_number === fromPr);
  const idxTo = sorted.findIndex((p) => p.pr_number === toPr);
  if (idxFrom < 0) {
    throw new Error(`PR #${fromPr} is not in the stack`);
  }
  if (idxTo < 0) {
    throw new Error(`PR #${toPr} is not in the stack`);
  }
  if (idxFrom >= idxTo) {
    throw new Error(`--from-pr (#${fromPr}) must be below --to-pr (#${toPr}) in stack order`);
  }
}

/**
 * @param {ReturnType<typeof sortStackPrs>} sorted
 * @param {number} fromPr
 */
export function defaultFixPr(sorted, fromPr) {
  const idx = sorted.findIndex((p) => p.pr_number === fromPr);
  if (idx < 0) {
    throw new Error(`PR #${fromPr} is not in the stack`);
  }
  if (idx + 1 >= sorted.length) {
    throw new Error(`PR #${fromPr} is the stack tip; there is no upper PR for the fix`);
  }
  return sorted[idx + 1].pr_number;
}
