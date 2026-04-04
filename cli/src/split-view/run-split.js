import React from "react";
import { render } from "ink";
import { authMe, getPull, createPullRequest } from "../api-client.js";
import { githubPostIssueComment } from "../github-pr-social.js";
import {
  createInitialStackDoc,
  readStackFile,
  writeStackFile,
  validateStackDoc,
  stackEntryFromGithubPull
} from "../nugit-stack.js";
import { appendStackHistory } from "../stack-graph.js";
import {
  assertCleanWorkingTree,
  gitExec,
  gitFetchRefs,
  listChangedFilesBetween,
  commitLayerFromPaths,
  gitPushBranch
} from "./split-git.js";
import { SplitInkApp } from "./split-ink.js";

/**
 * @param {object} ctx
 * @param {string} ctx.root
 * @param {string} ctx.owner
 * @param {string} ctx.repo
 * @param {number} ctx.prNumber
 * @param {boolean} [ctx.dryRun]
 * @param {string} [ctx.remote]
 */
export async function runSplitCommand(ctx) {
  const { root, owner, repo, prNumber, dryRun = false, remote = "origin" } = ctx;
  assertCleanWorkingTree(root);
  const pull = await getPull(owner, repo, prNumber);
  const headRepo =
    pull.head && typeof pull.head === "object" && pull.head.repo && typeof pull.head.repo === "object"
      ? String(pull.head.repo.full_name || "")
      : "";
  const here = `${owner}/${repo}`.toLowerCase();
  if (headRepo && headRepo.toLowerCase() !== here) {
    throw new Error(
      `nugit split does not support fork PRs in v1 (head repo ${headRepo}; expected ${owner}/${repo})`
    );
  }
  const baseBranch = pull.base.ref;
  const headBranch = pull.head.ref;
  gitFetchRefs(root, remote, baseBranch, headBranch);
  const baseRef = `${remote}/${baseBranch}`;
  const headRef = `${remote}/${headBranch}`;
  const files = listChangedFilesBetween(root, baseRef, headRef);
  if (!files.length) {
    throw new Error("No file changes between merge-base of base and head");
  }

  const exitPayload = { next: null };
  const { waitUntilExit } = render(React.createElement(SplitInkApp, { files, exitPayload }));
  await waitUntilExit();

  const next = exitPayload.next;
  if (!next || next.type !== "confirm") {
    console.error("Split cancelled.");
    try {
      gitExec(root, ["checkout", baseBranch]);
    } catch {
      /* ignore */
    }
    return;
  }
  const { byLayer, layerCount } = next;
  for (let L = 0; L < layerCount; L++) {
    if (!byLayer[L]?.length) {
      throw new Error(`Layer ${L} has no files — assign every changed file to a layer`);
    }
  }

  const prefix = `nugit-split/pr-${prNumber}`;
  /** @type {string[]} */
  const newBranches = [];
  let startRef = baseRef;
  for (let i = 0; i < layerCount; i++) {
    const b = `${prefix}-L${i}`;
    const did = commitLayerFromPaths(
      root,
      remote,
      b,
      startRef,
      headRef,
      byLayer[i],
      `nugit split: PR #${prNumber} layer ${i + 1}/${layerCount}`
    );
    if (!did) {
      throw new Error(`No commit produced for layer ${i}`);
    }
    newBranches.push(b);
    startRef = b;
  }

  if (dryRun) {
    console.error("Dry-run: branches (not pushed):", newBranches.join(", "));
    gitExec(root, ["checkout", baseBranch]);
    return;
  }

  for (const b of newBranches) {
    gitPushBranch(root, remote, b);
  }

  /** @type {number[]} */
  const newPrNumbers = [];
  let prevBase = baseBranch;
  for (let i = 0; i < newBranches.length; i++) {
    const title =
      pull.title != null
        ? `[split ${i + 1}/${newBranches.length}] ${pull.title}`
        : `Split of #${prNumber} (${i + 1}/${newBranches.length})`;
    const created = await createPullRequest(owner, repo, {
      title,
      head: newBranches[i],
      base: prevBase,
      body: `Split from #${prNumber} (nugit split layer ${i + 1}).\n\nOriginal: ${pull.html_url || ""}`
    });
    const num = /** @type {{ number?: number }} */ (created).number;
    if (typeof num !== "number") {
      throw new Error("GitHub did not return PR number");
    }
    newPrNumbers.push(num);
    prevBase = newBranches[i];
  }

  /** @type {Record<string, unknown> | null} */
  let docForHistory = null;
  let doc = readStackFile(root);
  if (doc) {
    validateStackDoc(doc);
    const idx = doc.prs.findIndex((p) => p.pr_number === prNumber);
    if (idx >= 0) {
      doc.prs.splice(idx, 1);
      const insertAt = idx;
      for (let i = 0; i < newPrNumbers.length; i++) {
        const p2 = await getPull(owner, repo, newPrNumbers[i]);
        doc.prs.splice(insertAt + i, 0, stackEntryFromGithubPull(p2, insertAt + i));
      }
      for (let j = 0; j < doc.prs.length; j++) {
        doc.prs[j].position = j;
      }
      writeStackFile(root, doc);
      docForHistory = doc;
    } else {
      console.error(
        `Warning: PR #${prNumber} not in .nugit/stack.json — local stack file left unchanged.`
      );
    }
  } else {
    const me = await authMe();
    const login = me && typeof me.login === "string" ? me.login : "unknown";
    doc = createInitialStackDoc(`${owner}/${repo}`, login);
    doc.prs = [];
    for (let i = 0; i < newPrNumbers.length; i++) {
      const p2 = await getPull(owner, repo, newPrNumbers[i]);
      doc.prs.push(stackEntryFromGithubPull(p2, i));
    }
    writeStackFile(root, doc);
    docForHistory = doc;
    console.error(
      `Created .nugit/stack.json with ${newPrNumbers.length} PR(s) from this split (repo had no stack file).`
    );
  }

  appendStackHistory(root, {
    action: "split",
    repo_full_name: `${owner}/${repo}`,
    tip_pr_number: newPrNumbers[newPrNumbers.length - 1],
    head_branch: newBranches[newBranches.length - 1],
    ...(docForHistory ? { snapshot: docForHistory } : {}),
    from_pr: prNumber,
    new_prs: newPrNumbers
  });

  await githubPostIssueComment(
    owner,
    repo,
    prNumber,
    `This PR was split into: ${newPrNumbers.map((n) => `#${n}`).join(", ")}. You can close this PR when the new stack is ready.`
  );

  try {
    gitExec(root, ["checkout", baseBranch]);
  } catch {
    /* ignore */
  }

  console.error(`Split complete. New PRs: ${newPrNumbers.join(", ")}`);
}
