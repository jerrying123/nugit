import fs from "fs";
import path from "path";
import chalk from "chalk";
import { getPull, authMe } from "./api-client.js";
import {
  githubGetPullReviewComment,
  githubListIssueComments,
  githubListPullReviewComments,
  githubPostIssueComment,
  githubPostPullReviewCommentReply
} from "./github-pr-social.js";
import { githubGetBlobText } from "./github-rest.js";
import { printJson } from "./cli-output.js";
import { writeStackFile, validateStackDoc, stackJsonPath } from "./nugit-stack.js";
import {
  loadStackContext,
  assertFromBelowTo,
  defaultFixPr
} from "./stack-helpers.js";

const REVIEW_STATE_FILE = "review-state.json";

function reviewStatePath(root) {
  return path.join(root, ".nugit", REVIEW_STATE_FILE);
}

function readReviewState(root) {
  const p = reviewStatePath(root);
  if (!fs.existsSync(p)) {
    return { version: 1, threads: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") {
      return { version: 1, threads: [] };
    }
    return {
      version: 1,
      threads: Array.isArray(raw.threads) ? raw.threads : []
    };
  } catch {
    return { version: 1, threads: [] };
  }
}

function writeReviewState(root, state) {
  const dir = path.join(root, ".nugit");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(reviewStatePath(root), JSON.stringify(state, null, 2) + "\n");
}

function clip(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * @param {import("commander").Command} stack
 */
export function registerStackExtraCommands(stack) {
  const comment = stack.command("comment").description("Post an issue (conversation) comment on a stack PR");
  comment
    .requiredOption("--pr <n>", "Pull request number")
    .option("--body <markdown>", "Comment body")
    .option("--body-file <path>", "Read body from file")
    .option("--repo <owner/repo>", "Override repository")
    .option("--json", "Print API response as JSON", false)
    .action(async (opts) => {
      const { owner, repo } = loadStackContext(opts.repo || null);
      let body = opts.body || "";
      if (opts.bodyFile) {
        body = fs.readFileSync(opts.bodyFile, "utf8");
      }
      if (!body.trim()) {
        throw new Error("Provide --body or --body-file");
      }
      const prNum = Number.parseInt(String(opts.pr), 10);
      const out = await githubPostIssueComment(owner, repo, prNum, body.trim());
      if (opts.json) {
        printJson(out);
      } else {
        console.log(chalk.green("Posted issue comment on PR #" + prNum));
        if (out.html_url) {
          console.log(chalk.blue.underline(String(out.html_url)));
        }
      }
    });

  const reply = stack.command("reply").description("Reply to a pull review (line) comment thread");
  reply
    .requiredOption("--review-comment <id>", "Review comment id (from stack comments list)")
    .option("--body <markdown>", "Reply body")
    .option("--body-file <path>", "Read body from file")
    .option("--repo <owner/repo>", "Override repository")
    .option("--json", "Print API response as JSON", false)
    .action(async (opts) => {
      const { owner, repo } = loadStackContext(opts.repo || null);
      let body = opts.body || "";
      if (opts.bodyFile) {
        body = fs.readFileSync(opts.bodyFile, "utf8");
      }
      if (!body.trim()) {
        throw new Error("Provide --body or --body-file");
      }
      const id = Number.parseInt(String(opts.reviewComment), 10);
      const out = await githubPostPullReviewCommentReply(owner, repo, id, body.trim());
      if (opts.json) {
        printJson(out);
      } else {
        console.log(chalk.green("Posted reply in review thread"));
        if (out.html_url) {
          console.log(chalk.blue.underline(String(out.html_url)));
        }
      }
    });

  const comments = stack.command("comments").description("List comments on stack PRs");
  const commentsList = comments
    .command("list")
    .description("List issue + review comments for a PR")
    .requiredOption("--pr <n>", "Pull request number")
    .option("--repo <owner/repo>", "Override repository")
    .option("--json", "JSON output", false)
    .action(async (opts) => {
      const { owner, repo } = loadStackContext(opts.repo || null);
      const prNum = Number.parseInt(String(opts.pr), 10);
      const [issueComments, reviewComments] = await Promise.all([
        githubListIssueComments(owner, repo, prNum),
        githubListPullReviewComments(owner, repo, prNum)
      ]);
      const payload = { issue_comments: issueComments, review_comments: reviewComments };
      if (opts.json) {
        printJson(payload);
        return;
      }
      console.log(chalk.bold.cyan(`PR #${prNum} — conversation`));
      for (const c of issueComments) {
        const u = c.user?.login || "?";
        console.log(`  ${chalk.dim("issue")} ${chalk.bold("#" + c.id)} ${chalk.dim(u)}: ${clip(c.body, 100)}`);
      }
      console.log(chalk.bold.cyan(`PR #${prNum} — review (line)`));
      for (const c of reviewComments) {
        const u = c.user?.login || "?";
        console.log(
          `  ${chalk.dim("review")} ${chalk.bold(c.id)} ${chalk.dim(c.path + ":" + (c.line ?? "?"))} ${chalk.dim(u)}: ${clip(c.body, 80)}`
        );
      }
    });

  const link = stack.command("link").description("Cross-link stacked PRs for reviewers and/or authors (issue comments)");
  link
    .requiredOption("--from-pr <a>", "Lower PR (where review was raised)")
    .requiredOption("--to-pr <b>", "Upper PR (where fix lives)")
    .option("--role <who>", "reviewer | author | both", "both")
    .option("--review-comment <id>", "Include permalink to this review comment on --from-pr")
    .option("--repo <owner/repo>", "Override repository")
    .option("--no-save", "Do not append to stack.json cross_pr_links", false)
    .option("--json", "Print created comments", false)
    .action(async (opts) => {
      const { root, doc, owner, repo, sorted } = loadStackContext(opts.repo || null);
      const fromPr = Number.parseInt(String(opts.fromPr), 10);
      const toPr = Number.parseInt(String(opts.toPr), 10);
      assertFromBelowTo(sorted, fromPr, toPr);
      const role = String(opts.role || "both").toLowerCase();
      if (!["reviewer", "author", "both"].includes(role)) {
        throw new Error("--role must be reviewer, author, or both");
      }

      const pullFrom = await getPull(owner, repo, fromPr);
      const pullTo = await getPull(owner, repo, toPr);
      const urlFrom = pullFrom.html_url || "";
      const urlTo = pullTo.html_url || "";

      let threadUrl = "";
      if (opts.reviewComment) {
        const rc = await githubGetPullReviewComment(
          owner,
          repo,
          Number.parseInt(String(opts.reviewComment), 10)
        );
        threadUrl = rc.html_url ? String(rc.html_url) : "";
      }

      const created = [];

      if (role === "reviewer" || role === "both") {
        const body =
          `**For reviewers:** the stacked PR #${toPr} contains the follow-up work${threadUrl ? ` (thread: ${threadUrl})` : ""}.\n\n` +
          (urlTo ? `Upper PR: ${urlTo}` : "");
        const r = await githubPostIssueComment(owner, repo, fromPr, body);
        created.push({ target: fromPr, audience: "reviewer", response: r });
      }

      if (role === "author" || role === "both") {
        const body =
          `**Stack note:** addresses review feedback from PR #${fromPr}${threadUrl ? ` (${threadUrl})` : ""}.\n\n` +
          (urlFrom ? `Lower PR: ${urlFrom}` : "");
        const a = await githubPostIssueComment(owner, repo, toPr, body);
        created.push({ target: toPr, audience: "author", response: a });
      }

      if (!opts.noSave) {
        if (!Array.isArray(doc.cross_pr_links)) {
          doc.cross_pr_links = [];
        }
        doc.cross_pr_links.push({
          from_pr: fromPr,
          to_pr: toPr,
          review_comment_id: opts.reviewComment ? Number.parseInt(String(opts.reviewComment), 10) : undefined,
          role,
          created_at: new Date().toISOString()
        });
        validateStackDoc(doc);
        writeStackFile(root, doc);
      }

      if (opts.json) {
        printJson(created);
      } else {
        console.log(chalk.green("Posted cross-link comments."));
        for (const c of created) {
          const url = c.response?.html_url;
          if (url) {
            console.log(chalk.dim(c.audience) + " " + chalk.blue.underline(String(url)));
          }
        }
      }
    });

  const review = stack.command("review").description("Cross-PR review helpers (see fix on upper PR)");

  review
    .command("pick")
    .description("List review (line) comments for a PR (pick an id for review show)")
    .requiredOption("--pr <n>", "Pull request number")
    .option("--repo <owner/repo>", "Override repository")
    .option("--json", "JSON output", false)
    .action(async (opts) => {
      const { owner, repo } = loadStackContext(opts.repo || null);
      const prNum = Number.parseInt(String(opts.pr), 10);
      const reviewComments = await githubListPullReviewComments(owner, repo, prNum);
      if (opts.json) {
        printJson(reviewComments);
        return;
      }
      console.log(chalk.bold.cyan(`Review comments on PR #${prNum}`));
      for (const c of reviewComments) {
        console.log(
          `${chalk.bold(c.id)}  ${chalk.dim(c.path + ":" + (c.line ?? "?"))}  ${clip(c.body, 60)}`
        );
      }
    });

  review
    .command("show")
    .description("Show review context (lower PR) vs file on upper PR head (fix)")
    .requiredOption("--from-pr <n>", "PR where the review comment lives")
    .requiredOption("--comment <id>", "Pull review comment id")
    .option("--fix-pr <n>", "Upper PR containing fix (default: next in stack)")
    .option("--repo <owner/repo>", "Override repository")
    .option("--json", "Raw payloads", false)
    .action(async (opts) => {
      const { owner, repo, sorted } = loadStackContext(opts.repo || null);
      const fromPr = Number.parseInt(String(opts.fromPr), 10);
      const commentId = Number.parseInt(String(opts.comment), 10);
      const fixPr = opts.fixPr
        ? Number.parseInt(String(opts.fixPr), 10)
        : defaultFixPr(sorted, fromPr);

      const c = await githubGetPullReviewComment(owner, repo, commentId);
      const path = c.path || "";
      if (!path) {
        throw new Error("Review comment has no path");
      }

      const pullFix = await getPull(owner, repo, fixPr);
      const headSha = pullFix.head?.sha || "";
      if (!headSha) {
        throw new Error("Could not resolve head sha for fix PR");
      }

      const fixText = await githubGetBlobText(owner, repo, path, headSha);
      const leftBlock = [
        chalk.bold.yellow(`Review on PR #${fromPr}`),
        chalk.dim(c.html_url || ""),
        "",
        chalk.bold(path + ":" + (c.line ?? "")),
        "",
        chalk.dim("diff_hunk:"),
        String(c.diff_hunk || "(none)").slice(0, 4000)
      ].join("\n");

      const rightBlock = [
        chalk.bold.green(`Same file @ PR #${fixPr} head (${headSha.slice(0, 7)})`),
        chalk.dim(pullFix.html_url || ""),
        "",
        fixText
          ? clip(fixText, 12000)
          : chalk.red("(file missing on upper head — renamed or new path?)")
      ].join("\n");

      if (opts.json) {
        printJson({ comment: c, fix_pr: pullFix, fix_snippet: fixText });
        return;
      }

      const cols = Math.max(40, Math.floor((process.stdout.columns || 100) / 2) - 4);
      const leftLines = leftBlock.split("\n").map((l) => clip(l, cols));
      const rightLines = rightBlock.split("\n").map((l) => clip(l, cols));
      const maxL = Math.max(leftLines.length, rightLines.length, 1);
      console.log(chalk.bold.cyan("Cross-PR review trace"));
      for (let i = 0; i < maxL; i++) {
        const L = leftLines[i] || "";
        const R = rightLines[i] || "";
        console.log(L.padEnd(cols + 2) + " │ " + R);
      }
    });

  review
    .command("done")
    .description("Mark a review comment id as reviewed locally (.nugit/review-state.json)")
    .requiredOption("--comment <id>", "Pull review comment id")
    .option("--reply <markdown>", "Also post this reply on the thread")
    .option("--repo <owner/repo>", "Override repository (for optional reply)")
    .option("--json", "Print state JSON", false)
    .action(async (opts) => {
      const { root, owner, repo } = loadStackContext(opts.repo || null);
      const me = await authMe();
      const login = me.login || "unknown";
      const commentId = Number.parseInt(String(opts.comment), 10);

      if (opts.reply) {
        await githubPostPullReviewCommentReply(owner, repo, commentId, String(opts.reply));
      }

      const state = readReviewState(root);
      if (!state.threads.some((t) => t.review_comment_id === commentId)) {
        state.threads.push({
          review_comment_id: commentId,
          marked_at: new Date().toISOString(),
          user_github_login: login
        });
      }
      writeReviewState(root, state);

      if (opts.json) {
        printJson(state);
      } else {
        console.log(chalk.green(`Marked review comment ${commentId} as reviewed (local)`));
        console.log(chalk.dim(reviewStatePath(root)));
      }
    });
}
