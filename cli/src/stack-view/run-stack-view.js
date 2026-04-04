import React from "react";
import { render } from "ink";
import chalk from "chalk";
import { resolveGithubToken } from "../auth-token.js";
import {
  githubListAssignableUsers,
  githubPostIssueComment,
  githubPostPullReviewCommentReply,
  githubPostRequestedReviewers
} from "../github-pr-social.js";
import { findGitRoot, parseRepoFullName, readStackFile } from "../nugit-stack.js";
import { getRepoFullNameFromGitRoot } from "../git-info.js";
import { discoverStacksInRepo } from "../stack-discover.js";
import { getStackDiscoveryOpts, effectiveMaxOpenPrs } from "../stack-discovery-config.js";
import { tryLoadStackIndex, writeStackIndex } from "../stack-graph.js";
import { formatStacksListHuman } from "../cli-output.js";
import { fetchStackPrDetails } from "./fetch-pr-data.js";
import { loadStackDocForView } from "./loader.js";
import { StackInkApp, createExitPayload } from "./ink-app.js";
import { renderStaticStackView } from "./static-render.js";
import { questionLine } from "./prompt-line.js";

function createSpinner(prefix) {
  const frames = [chalk.cyan("⠋"), chalk.cyan("⠙"), chalk.cyan("⠹"), chalk.cyan("⠸"), chalk.cyan("⠼"), chalk.cyan("⠴")];
  let i = 0;
  let msg = "starting...";
  let timer = null;
  return {
    update(nextMsg) {
      msg = nextMsg || msg;
    },
    start() {
      if (!process.stderr.isTTY) {
        return;
      }
      timer = setInterval(() => {
        const frame = frames[i % frames.length];
        i += 1;
        process.stderr.write(`\r${chalk.bold(prefix)} ${frame} ${chalk.dim(msg)}`);
      }, 100);
    },
    stop(finalMsg) {
      if (!process.stderr.isTTY) {
        if (finalMsg) {
          console.error(`${prefix} ${finalMsg}`);
        }
        return;
      }
      if (timer) {
        clearInterval(timer);
      }
      const done = finalMsg ? `${chalk.bold(prefix)} ${chalk.green(finalMsg)}` : "";
      process.stderr.write(`\r${done}${" ".repeat(30)}\n`);
    }
  };
}

/**
 * @param {{ tip_pr_number: number, tip_head_branch: string, pr_count: number, created_by: string }[]} stacks
 * @returns {Promise<number>}
 */
async function pickDiscoveredStackIndex(stacks) {
  const stackTree = (s) => {
    const prs = Array.isArray(s.prs) ? s.prs : [];
    const lines = [chalk.dim("    main")];
    for (let i = 0; i < prs.length; i++) {
      const pr = prs[i];
      const bend = i === prs.length - 1 ? "└─" : "├─";
      lines.push(
        chalk.dim(`    ${bend} `) +
          chalk.bold(`#${pr.pr_number}`) +
          (pr.title ? chalk.dim(` ${String(pr.title).slice(0, 48)}`) : "")
      );
    }
    return lines.join("\n");
  };
  for (;;) {
    console.error(chalk.bold.cyan("Multiple stacks found. Pick one:"));
    for (let i = 0; i < stacks.length; i++) {
      const s = stacks[i];
      console.error(
        `  ${chalk.yellow("[" + (i + 1) + "]")} ` +
          `${chalk.bold("tip #" + s.tip_pr_number)} · ${s.pr_count} PR(s) · ` +
          `${chalk.magenta("branch " + s.tip_head_branch)} · by ${chalk.dim(s.created_by)}`
      );
      console.error(stackTree(s));
    }
    const ans = String(
      await questionLine(chalk.green("Select stack number (empty=cancel): "))
    ).trim();
    if (!ans) {
      return -1;
    }
    const n = Number.parseInt(ans, 10);
    if (Number.isInteger(n) && n >= 1 && n <= stacks.length) {
      return n - 1;
    }
    console.error("Invalid choice.");
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<string[]>}
 */
async function promptReviewers(owner, repo, prNumber) {
  let candidates = [];
  const spin = createSpinner("Loading reviewers");
  spin.start();
  try {
    const users = await githubListAssignableUsers(owner, repo);
    candidates = Array.isArray(users)
      ? users
          .map((u) => (u && typeof u === "object" ? String(u.login || "") : ""))
          .filter(Boolean)
      : [];
  } catch {
    candidates = [];
  }
  spin.stop(`${candidates.length} candidate(s)`);
  if (candidates.length) {
    console.error(chalk.bold.cyan(`Assign Reviewers for PR #${prNumber}`));
    for (let i = 0; i < candidates.length; i++) {
      console.error(`  ${chalk.yellow("[" + (i + 1) + "]")} ${chalk.white(candidates[i])}`);
    }
    console.error(chalk.dim("Pick by number(s) and/or login(s): e.g. 1,3 or alice,bob"));
  } else {
    console.error(chalk.yellow("No assignable users listed by GitHub. You can still type logins."));
  }
  const raw = await questionLine(chalk.green("Assign Reviewers (empty=cancel): "));
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chosen = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (Number.isInteger(n) && n >= 1 && n <= candidates.length) {
      chosen.push(candidates[n - 1]);
    } else {
      chosen.push(p.replace(/^@/, ""));
    }
  }
  return [...new Set(chosen)];
}

/**
 * @param {object} opts
 * @param {boolean} [opts.noTui]
 * @param {string} [opts.repo]
 * @param {string} [opts.ref]
 * @param {string} [opts.file]
 */
export async function runStackViewCommand(opts) {
  if (!resolveGithubToken()) {
    console.error(
      chalk.dim(
        "No NUGIT_USER_TOKEN: using unauthenticated GitHub reads (low rate limit; public repos only for API data). Set a PAT for private repos, higher limits, or posting comments."
      )
    );
  }
  const root = findGitRoot();
  let repo = opts.repo;
  let ref = opts.ref;
  if (!opts.file && !ref) {
    let repoFull = repo || null;
    if (!repoFull && root) {
      try {
        repoFull = getRepoFullNameFromGitRoot(root);
      } catch {
        repoFull = null;
      }
    }
    if (repoFull) {
      const { owner, repo: repoName } = parseRepoFullName(repoFull);
      const discovery = getStackDiscoveryOpts();
      const full =
        process.env.NUGIT_STACK_DISCOVERY_FULL === "1" || process.env.NUGIT_STACK_DISCOVERY_FULL === "true";
      let discovered = null;
      let usedCache = false;
      if (discovery.mode === "manual" && root) {
        discovered = tryLoadStackIndex(root, repoFull);
        if (!discovered) {
          throw new Error(
            'Stack discovery mode is "manual". Run `nugit stack index` first or pass --repo/--ref explicitly.'
          );
        }
        usedCache = true;
      } else if (discovery.mode === "lazy" && root && !full) {
        const cached = tryLoadStackIndex(root, repoFull);
        if (cached) {
          discovered = cached;
          usedCache = true;
        }
      }
      if (!discovered) {
        const spinner = createSpinner("Scanning stacks");
        spinner.start();
        discovered = await discoverStacksInRepo(owner, repoName, {
          maxOpenPrs: effectiveMaxOpenPrs(discovery, full),
          enrich: false,
          fetchConcurrency: discovery.fetchConcurrency,
          onProgress: (m) => spinner.update(m)
        });
        spinner.stop(
          `found ${discovered.stacks_found} stack(s) across ${discovered.scanned_open_prs} open PR(s)`
        );
        if (root) {
          try {
            if (discovery.mode === "eager" || discovery.mode === "lazy") {
              writeStackIndex(root, discovered);
            }
          } catch {
            /* ignore index write */
          }
        }
      } else if (usedCache) {
        console.error(chalk.dim("Using .nugit/stack-index.json — set NUGIT_STACK_DISCOVERY_FULL=1 to rescan GitHub."));
      }
      if (discovered.stacks_found > 1) {
        if (opts.noTui) {
          console.log(formatStacksListHuman(discovered));
          return;
        }
        const idx = await pickDiscoveredStackIndex(discovered.stacks);
        if (idx < 0) {
          console.error("Cancelled.");
          return;
        }
        repo = repoFull;
        ref = discovered.stacks[idx].tip_head_branch;
        console.error(`Viewing selected stack tip: ${repo}@${ref}`);
      }
      if (discovered.stacks_found === 1) {
        repo = repoFull;
        ref = discovered.stacks[0].tip_head_branch;
        console.error(`Viewing discovered stack tip: ${repo}@${ref}`);
      }
    }
  }

  let { doc } = await loadStackDocForView({
    root,
    repo,
    ref,
    file: opts.file
  });

  const { owner, repo: repoName } = parseRepoFullName(doc.repo_full_name);
  const loadSpinner = createSpinner("Loading stack");
  loadSpinner.start();
  let rows = await fetchStackPrDetails(owner, repoName, doc.prs);
  loadSpinner.stop(`loaded ${rows.length} PR(s)`);

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
    // Give terminal mode a short moment to settle before readline prompts.
    await new Promise((r) => setTimeout(r, 25));

    const next = exitPayload.next;
    if (!next || next.type === "quit") {
      running = false;
      break;
    }

    if (next.type === "issue_comment") {
      try {
        const body = await questionLine(`New issue comment on PR #${next.prNumber} (empty=cancel): `);
        if (body.trim()) {
          await githubPostIssueComment(
            owner,
            repoName,
            /** @type {number} */ (next.prNumber),
            body.trim()
          );
        }
        const refresh = createSpinner("Refreshing stack");
        refresh.start();
        rows = await fetchStackPrDetails(owner, repoName, doc.prs);
        refresh.stop(`loaded ${rows.length} PR(s)`);
      } catch (e) {
        console.error(`Action failed: ${String(e?.message || e)}`);
      }
      continue;
    }

    if (next.type === "review_reply") {
      try {
        const body = await questionLine(`Reply in review thread (empty=cancel): `);
        if (body.trim()) {
          await githubPostPullReviewCommentReply(
            owner,
            repoName,
            /** @type {number} */ (next.commentId),
            body.trim()
          );
        }
        const refresh = createSpinner("Refreshing stack");
        refresh.start();
        rows = await fetchStackPrDetails(owner, repoName, doc.prs);
        refresh.stop(`loaded ${rows.length} PR(s)`);
      } catch (e) {
        console.error(`Action failed: ${String(e?.message || e)}`);
      }
      continue;
    }

    if (next.type === "request_reviewers") {
      try {
        const logins = await promptReviewers(owner, repoName, /** @type {number} */ (next.prNumber));
        if (logins.length) {
          await githubPostRequestedReviewers(owner, repoName, /** @type {number} */ (next.prNumber), {
            reviewers: logins
          });
        }
        const refresh = createSpinner("Refreshing stack");
        refresh.start();
        rows = await fetchStackPrDetails(owner, repoName, doc.prs);
        refresh.stop(`loaded ${rows.length} PR(s)`);
      } catch (e) {
        console.error(`Action failed: ${String(e?.message || e)}`);
      }
      continue;
    }

    if (next.type === "refresh") {
      const refresh = createSpinner("Refreshing stack");
      refresh.start();
      rows = await fetchStackPrDetails(owner, repoName, doc.prs);
      refresh.stop(`loaded ${rows.length} PR(s)`);
      continue;
    }

    if (next.type === "split") {
      try {
        const r = findGitRoot();
        if (!r) {
          throw new Error("Not inside a git repository");
        }
        const { runSplitCommand } = await import("../split-view/run-split.js");
        await runSplitCommand({
          root: r,
          owner,
          repo: repoName,
          prNumber: /** @type {number} */ (next.prNumber),
          dryRun: false
        });
        const refreshed = readStackFile(r);
        if (refreshed) {
          doc = refreshed;
        }
        const reload = createSpinner("Reloading stack");
        reload.start();
        rows = await fetchStackPrDetails(owner, repoName, doc.prs);
        reload.stop(`loaded ${rows.length} PR(s)`);
      } catch (e) {
        console.error(`Split failed: ${String(/** @type {{ message?: string }} */ (e)?.message || e)}`);
      }
      continue;
    }
  }
}
