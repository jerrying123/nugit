import React from "react";
import { render } from "ink";
import { useDirectGithub } from "../github-rest.js";
import {
  githubPostIssueComment,
  githubPostPullReviewCommentReply,
  githubPostRequestedReviewers
} from "../github-pr-social.js";
import { findGitRoot, parseRepoFullName } from "../nugit-stack.js";
import { fetchStackPrDetails } from "./fetch-pr-data.js";
import { loadStackDocForView } from "./loader.js";
import { StackInkApp, createExitPayload } from "./ink-app.js";
import { renderStaticStackView } from "./static-render.js";
import { questionLine } from "./prompt-line.js";

/**
 * @param {object} opts
 * @param {boolean} [opts.noTui]
 * @param {string} [opts.repo]
 * @param {string} [opts.ref]
 * @param {string} [opts.file]
 */
export async function runStackViewCommand(opts) {
  if (!useDirectGithub()) {
    throw new Error(
      "nugit stack view uses the GitHub API directly. Unset NUGIT_GITHUB_VIA_STACKPR_API (and NUGIT_USE_STACKPR_API)."
    );
  }

  const { doc } = await loadStackDocForView({
    root: findGitRoot(),
    repo: opts.repo,
    ref: opts.ref,
    file: opts.file
  });

  const { owner, repo } = parseRepoFullName(doc.repo_full_name);
  let rows = await fetchStackPrDetails(owner, repo, doc.prs);

  if (opts.noTui) {
    renderStaticStackView(rows);
    return;
  }

  let running = true;
  while (running) {
    const exitPayload = createExitPayload();
    const { waitUntilExit } = render(
      React.createElement(StackInkApp, { rows, exitPayload })
    );
    await waitUntilExit();

    const next = exitPayload.next;
    if (!next || next.type === "quit") {
      running = false;
      break;
    }

    if (next.type === "issue_comment") {
      const body = await questionLine(`New issue comment on PR #${next.prNumber} (empty=cancel): `);
      if (body.trim()) {
        await githubPostIssueComment(owner, repo, /** @type {number} */ (next.prNumber), body.trim());
      }
      rows = await fetchStackPrDetails(owner, repo, doc.prs);
      continue;
    }

    if (next.type === "review_reply") {
      const body = await questionLine(`Reply in review thread (empty=cancel): `);
      if (body.trim()) {
        await githubPostPullReviewCommentReply(
          owner,
          repo,
          /** @type {number} */ (next.commentId),
          body.trim()
        );
      }
      rows = await fetchStackPrDetails(owner, repo, doc.prs);
      continue;
    }

    if (next.type === "request_reviewers") {
      const raw = await questionLine(
        `GitHub usernames for PR #${next.prNumber} (comma-separated, empty=cancel): `
      );
      const logins = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (logins.length) {
        await githubPostRequestedReviewers(owner, repo, /** @type {number} */ (next.prNumber), {
          reviewers: logins
        });
      }
      rows = await fetchStackPrDetails(owner, repo, doc.prs);
      continue;
    }
  }
}
