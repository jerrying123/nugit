#!/usr/bin/env node
import fs from "fs";
import chalk from "chalk";
import { Command } from "commander";
import {
  startDeviceFlow,
  pollDeviceFlow,
  pollDeviceFlowUntilComplete,
  savePat,
  listMyPulls,
  listOpenPullsInRepo,
  fetchRemoteStackJson,
  getPull,
  authMe,
  createPullRequest,
  getRepoMetadata
} from "./api-client.js";
import {
  findGitRoot,
  readStackFile,
  writeStackFile,
  createInitialStackDoc,
  validateStackDoc,
  parseRepoFullName,
  nextStackPosition,
  stackEntryFromGithubPull,
  stackJsonPath,
  parseStackAddPrNumbers
} from "./nugit-stack.js";
import { runStackPropagate } from "./stack-propagate.js";
import { registerStackExtraCommands } from "./stack-extra-commands.js";
import { runStackViewCommand } from "./stack-view/run-stack-view.js";
import {
  printJson,
  formatWhoamiHuman,
  formatPrSearchHuman,
  formatOpenPullsHuman,
  formatStackDocHuman,
  formatStackEnrichHuman,
  formatStacksListHuman,
  formatPrCreatedHuman,
  formatPatOkHuman
} from "./cli-output.js";
import { getRepoFullNameFromGitRoot } from "./git-info.js";
import { discoverStacksInRepo } from "./stack-discover.js";
import { getStackDiscoveryOpts, effectiveMaxOpenPrs } from "./stack-discovery-config.js";
import {
  tryLoadStackIndex,
  writeStackIndex,
  compileStackGraph,
  readStackHistoryLines
} from "./stack-graph.js";
import { runSplitCommand } from "./split-view/run-split.js";
import { getConfigPath } from "./user-config.js";
import { openInBrowser } from "./open-browser.js";
import {
  writeStoredGithubToken,
  clearStoredGithubToken,
  getGithubTokenPath
} from "./token-store.js";
import {
  runConfigInit,
  runConfigShow,
  runConfigSet,
  runEnvExport,
  runStart,
  runStartHub
} from "./nugit-start.js";

const program = new Command();
program.name("nugit").description("Nugit CLI — stack state in .nugit/stack.json");

/**
 * @param {import("commander").Command} cmd
 * @returns {import("commander").Command}
 */
function withStackViewCliOptions(cmd) {
  return cmd
    .option("--no-tui", "Print stack + comment counts to stdout (no Ink UI)", false)
    .option("--repo <owner/repo>", "With --ref: load stack from GitHub instead of local file")
    .option("--ref <branch>", "Branch/sha for .nugit/stack.json on GitHub")
    .option("--file <path>", "Path to stack.json (skip local .nugit lookup)")
    .action(async (opts) => {
      await runStackViewCommand({
        noTui: opts.noTui,
        repo: opts.repo,
        ref: opts.ref,
        file: opts.file
      });
    });
}

program
  .command("init")
  .description(
    "Create or reset .nugit/stack.json (empty prs[]); clears any existing stack in that file"
  )
  .option("--repo <owner/repo>", "Override repository full name")
  .option("--user <github-login>", "Override created_by metadata")
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const repoFull = opts.repo || getRepoFullNameFromGitRoot(root);
    let user = opts.user;
    if (!user) {
      const me = await authMe();
      user = me.login;
      if (!user) {
        throw new Error("Could not resolve login; pass --user or set NUGIT_USER_TOKEN / STACKPR_USER_TOKEN");
      }
      console.error(`Using GitHub login: ${user}`);
    }
    let cleared = 0;
    const p = stackJsonPath(root);
    if (fs.existsSync(p)) {
      try {
        const prev = JSON.parse(fs.readFileSync(p, "utf8"));
        if (prev && Array.isArray(prev.prs)) {
          cleared = prev.prs.length;
        }
      } catch {
        /* ignore parse errors */
      }
    }
    const doc = createInitialStackDoc(repoFull, user);
    writeStackFile(root, doc);
    console.log(`Wrote ${root}/.nugit/stack.json (${repoFull})`);
    if (cleared > 0) {
      console.error(`Cleared previous stack (${cleared} PR${cleared === 1 ? "" : "s"}).`);
    }
    console.error(
      "Add PRs with `nugit stack add --pr N [N...]` (bottom→top), then `nugit stack propagate` (auto-commits this file on the tip if needed)."
    );
  });

const auth = new Command("auth").description("GitHub authentication");

auth
  .command("login")
  .description(
    "OAuth device flow: opens browser (pre-filled code), waits for approval, saves token to ~/.config/nugit/github-token. Needs GITHUB_OAUTH_CLIENT_ID. Env NUGIT_USER_TOKEN still overrides the file."
  )
  .option("--no-browser", "Do not launch a browser (open the printed URL yourself)", false)
  .option(
    "--no-wait",
    "Only request a device code and print instructions (use nugit auth poll --device-code …)",
    false
  )
  .option("--json", "With --no-wait: raw device response. Otherwise: { login, token_path } after save", false)
  .action(async (opts) => {
    const result = await startDeviceFlow();
    const deviceCode = result.device_code;
    if (!deviceCode || typeof deviceCode !== "string") {
      throw new Error("GitHub did not return device_code");
    }
    const interval = Number(result.interval) || 5;

    if (opts.noWait) {
      if (opts.json) {
        printJson(result);
      } else if (result.verification_uri && result.user_code) {
        console.error(
          `Open ${result.verification_uri} and enter code ${chalk.bold(String(result.user_code))}`
        );
        console.error(
          `Then: ${chalk.bold(`nugit auth poll --device-code ${deviceCode}`)} (poll every ${interval}s)`
        );
      }
      return;
    }

    const baseUri = String(result.verification_uri || "https://github.com/login/device");
    const userCode = result.user_code != null ? String(result.user_code) : "";
    const sep = baseUri.includes("?") ? "&" : "?";
    const verifyUrl = userCode
      ? `${baseUri}${sep}user_code=${encodeURIComponent(userCode)}`
      : baseUri;

    if (opts.noBrowser) {
      console.error(`Open in your browser:\n  ${chalk.blue.underline(verifyUrl)}`);
    } else {
      try {
        openInBrowser(verifyUrl);
        console.error(`Opened browser: ${chalk.dim(verifyUrl)}`);
      } catch {
        console.error(`Could not open a browser. Open:\n  ${chalk.blue.underline(verifyUrl)}`);
      }
    }
    if (userCode) {
      console.error(`If prompted, code: ${chalk.bold(userCode)}`);
    }
    console.error(chalk.dim("\nWaiting for you to authorize on GitHub…\n"));

    const final = await pollDeviceFlowUntilComplete(deviceCode, interval);
    if (!final.access_token) {
      throw new Error("No access_token from GitHub");
    }
    const me = await savePat(final.access_token);
    writeStoredGithubToken(final.access_token);
    const tokenPath = getGithubTokenPath();
    if (opts.json) {
      printJson({
        login: me.login,
        token_path: tokenPath,
        saved: true
      });
    } else {
      console.error(
        chalk.green(
          `\nSigned in as ${chalk.bold(String(me.login))}. Token saved to ${chalk.cyan(tokenPath)}`
        )
      );
      console.error(
        chalk.dim(
          "Future `nugit` runs will use this token automatically. " +
            "Environment variables NUGIT_USER_TOKEN / STACKPR_USER_TOKEN override the file if set."
        )
      );
    }
  });

auth
  .command("poll")
  .description(
    "Complete GitHub device flow (polls until authorized); or --once for a single poll"
  )
  .requiredOption("--device-code <code>", "device_code from nugit auth login")
  .option("--interval <sec>", "Initial poll interval from login response", "5")
  .option("--once", "Single poll only (manual retry)", false)
  .action(async (opts) => {
    const interval = Number.parseInt(String(opts.interval), 10) || 5;
    const result = opts.once
      ? await pollDeviceFlow(opts.deviceCode, interval)
      : await pollDeviceFlowUntilComplete(opts.deviceCode, interval);
    if (result.pending) {
      console.log(JSON.stringify(result, null, 2));
      console.error("Still pending; run again with --once or omit --once to wait.");
      return;
    }
    if (result.access_token) {
      const me = await savePat(result.access_token);
      writeStoredGithubToken(result.access_token);
      const t = JSON.stringify(result.access_token);
      console.error(
        `\nToken saved to ${chalk.cyan(getGithubTokenPath())} (signed in as ${chalk.bold(String(me.login))}).`
      );
      console.error(
        chalk.dim("Optional — use env instead of file:\n") +
          `  export NUGIT_USER_TOKEN=${t}\n  # or: export STACKPR_USER_TOKEN=${t}`
      );
    }
  });

auth
  .command("logout")
  .description("Remove saved OAuth/PAT file (~/.config/nugit/github-token); does not unset env vars")
  .action(() => {
    clearStoredGithubToken();
    console.error(chalk.dim(`Removed ${getGithubTokenPath()} (if it existed).`));
  });

auth
  .command("pat")
  .description("Validate PAT against GitHub (GET /user); token is not stored")
  .requiredOption("--token <token>", "GitHub PAT")
  .option("--json", "Print full response", false)
  .action(async (opts) => {
    const result = await savePat(opts.token);
    if (opts.json) {
      printJson(result);
    } else {
      console.log(formatPatOkHuman(result));
    }
    if (result.access_token) {
      const t = JSON.stringify(result.access_token);
      console.error(`\nexport NUGIT_USER_TOKEN=${t}\n# or: export STACKPR_USER_TOKEN=${t}`);
    }
  });

auth
  .command("whoami")
  .description("Print GitHub login for your token")
  .option("--json", "Print full JSON", false)
  .action(async (opts) => {
    const me = await authMe();
    if (opts.json) {
      printJson(me);
    } else {
      console.log(formatWhoamiHuman(/** @type {Record<string, unknown>} */ (me)));
    }
  });

program.addCommand(auth);

const config = new Command("config").description(
  "Persist monorepo path + .env for `nugit start` or `eval \"$(nugit env)\"`"
);

config
  .command("init")
  .description(
    "Write ~/.config/nugit/config.json (defaults: this repo root + <root>/.env)"
  )
  .option("--install-root <path>", "Nugit monorepo root (contains scripts/ and cli/)")
  .option("--env-file <path>", "Dotenv file to load (default: <install-root>/.env)")
  .option(
    "--working-directory <path>",
    "Default cwd when running `nugit start` (optional)"
  )
  .action(async (opts) => {
    runConfigInit({
      installRoot: opts.installRoot,
      envFile: opts.envFile,
      workingDirectory: opts.workingDirectory
    });
  });

config
  .command("show")
  .description("Print saved config JSON")
  .action(() => {
    runConfigShow();
  });

config
  .command("path")
  .description("Print path to config.json")
  .action(() => {
    console.log(getConfigPath());
  });

config
  .command("set")
  .description("Set install-root, env-file, or working-directory")
  .argument("<key>", "install-root | env-file | working-directory")
  .argument("<value>", "path")
  .action((key, value) => {
    runConfigSet(key, value);
  });

program.addCommand(config);

program
  .command("start")
  .description(
    "Interactive shell with saved .env + PATH including nugit scripts (needs `nugit config init`)"
  )
  .option(
    "-c, --command <string>",
    "Run one command via shell -lc instead of opening an interactive shell"
  )
  .option(
    "--shell",
    "Open the configured shell immediately (skip the TTY hub menu: stack view / split / shell)",
    false
  )
  .action(async (opts) => {
    if (opts.command) {
      runStart({ command: opts.command });
      return;
    }
    const tty = process.stdin.isTTY && process.stdout.isTTY;
    if (opts.shell || !tty) {
      runStart({});
      return;
    }
    await runStartHub();
  });

program
  .command("split")
  .description(
    "Split one PR into layered branches and new GitHub PRs (TUI assigns files to layers; updates local stack.json when the PR is listed there)"
  )
  .requiredOption("--pr <n>", "PR number to split")
  .option("--dry-run", "Materialize local branches only; do not push or create PRs", false)
  .option("--remote <name>", "Git remote name", "origin")
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const repoFull = getRepoFullNameFromGitRoot(root);
    const { owner, repo: repoName } = parseRepoFullName(repoFull);
    const n = Number.parseInt(String(opts.pr), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Invalid --pr");
    }
    await runSplitCommand({
      root,
      owner,
      repo: repoName,
      prNumber: n,
      dryRun: opts.dryRun,
      remote: opts.remote
    });
  });

withStackViewCliOptions(
  program
    .command("view")
    .description(
      "Shorthand for `nugit stack view` — interactive stack TUI (or `--no-tui`). Use `--repo owner/repo --ref branch` to browse a public repo without cloning."
    )
);

program
  .command("env")
  .description(
    "Print export lines from saved config — bash/zsh: eval \"$(nugit env)\""
  )
  .option("--fish", "Emit fish `set -gx` instead of sh export", false)
  .action(async (opts) => {
    runEnvExport(opts.fish ? "fish" : "bash");
  });

const prs = new Command("prs").description("Pull requests");

prs
  .command("list")
  .description(
    "List open PRs in the repo (default: origin from cwd), paginated — use numbers with nugit stack add. Use --mine for only your PRs."
  )
  .option("--repo <owner/repo>", "Repository (default: github.com remote from current git repo)")
  .option("--mine", "Only PRs authored by you (GitHub search)", false)
  .option("--page <n>", "Page number (1-based)", "1")
  .option("--per-page <n>", "Results per page (max 100)", "20")
  .option("--json", "Print raw API response", false)
  .action(async (opts) => {
    const page = Number.parseInt(String(opts.page), 10) || 1;
    const perPage = Math.min(100, Math.max(1, Number.parseInt(String(opts.perPage), 10) || 20));
    const root = findGitRoot();
    const repoFull =
      opts.repo || (root ? getRepoFullNameFromGitRoot(root) : null);
    if (!repoFull) {
      throw new Error("Pass --repo owner/repo or run inside a git clone with a github.com origin");
    }
    const { owner, repo } = parseRepoFullName(repoFull);

    if (opts.mine) {
      const result = await listMyPulls({
        repo: repoFull,
        page,
        perPage
      });
      if (opts.json) {
        printJson(result);
      } else {
        console.log(
          formatPrSearchHuman(/** @type {{ total_count?: number, items?: unknown[] }} */ (result), {
            page,
            perPage
          })
        );
      }
      return;
    }

    const result = await listOpenPullsInRepo(owner, repo, { page, perPage });
    if (opts.json) {
      printJson(result);
    } else {
      console.log(
        formatOpenPullsHuman(
          /** @type {{ pulls: unknown[], page: number, per_page: number, repo_full_name: string, has_more: boolean }} */ (
            result
          )
        )
      );
    }
  });

prs
  .command("create")
  .description("Open a GitHub PR (push the head branch first). Repo defaults to origin.")
  .requiredOption("--head <branch>", "Head branch name (exists on GitHub)")
  .requiredOption("--title <title>", "PR title")
  .option("--base <branch>", "Base branch (default: repo default_branch from GitHub)")
  .option("--body <markdown>", "PR body")
  .option("--repo <owner/repo>", "Override; default from git remote origin")
  .option("--draft", "Create as draft", false)
  .option("--json", "Print full API response", false)
  .action(async (opts) => {
    const root = findGitRoot();
    if (!opts.repo && !root) {
      throw new Error("Not in a git repo: pass --repo owner/repo or run from a clone");
    }
    const repoFull = opts.repo || getRepoFullNameFromGitRoot(root);
    const { owner, repo } = parseRepoFullName(repoFull);
    let base = opts.base;
    if (!base) {
      const meta = await getRepoMetadata(owner, repo);
      base = meta.default_branch;
      if (!base) {
        throw new Error("Could not determine default branch; pass --base");
      }
      console.error(`Using base branch: ${base}`);
    }
    const created = await createPullRequest(owner, repo, {
      title: opts.title,
      head: opts.head,
      base,
      body: opts.body,
      draft: opts.draft
    });
    if (opts.json) {
      printJson(created);
    } else {
      console.log(formatPrCreatedHuman(/** @type {Record<string, unknown>} */ (created)));
    }
    if (created.number) {
      console.error(`\nAdd to stack: nugit stack add --pr ${created.number}`);
    }
  });

program.addCommand(prs);

const stack = new Command("stack").description("Local .nugit/stack.json");

stack
  .command("show")
  .description("Print local .nugit/stack.json")
  .option("--json", "Raw JSON", false)
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const doc = readStackFile(root);
    if (!doc) {
      throw new Error("No .nugit/stack.json in this repo");
    }
    validateStackDoc(doc);
    if (opts.json) {
      printJson(doc);
    } else {
      console.log(formatStackDocHuman(/** @type {Record<string, unknown>} */ (doc)));
    }
  });

stack
  .command("fetch")
  .description("Fetch .nugit/stack.json from GitHub (needs token)")
  .option("--repo <owner/repo>", "Default: git remote origin when run inside a repo")
  .option("--ref <ref>", "branch or sha", "")
  .option("--json", "Raw JSON", false)
  .action(async (opts) => {
    const root = findGitRoot();
    const repoFull =
      opts.repo || (root ? getRepoFullNameFromGitRoot(root) : null);
    if (!repoFull) {
      throw new Error("Pass --repo owner/repo or run from a git clone with github.com origin");
    }
    const doc = await fetchRemoteStackJson(repoFull, opts.ref || undefined);
    validateStackDoc(doc);
    if (opts.json) {
      printJson(doc);
    } else {
      console.log(formatStackDocHuman(/** @type {Record<string, unknown>} */ (doc)));
    }
  });

stack
  .command("enrich")
  .description("Print stack with PR titles from GitHub (local file + API)")
  .option("--json", "Raw JSON", false)
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const doc = readStackFile(root);
    if (!doc) {
      throw new Error("No .nugit/stack.json");
    }
    validateStackDoc(doc);
    const { owner, repo } = parseRepoFullName(doc.repo_full_name);
    const ordered = [...doc.prs].sort((a, b) => a.position - b.position);
    const out = [];
    for (const pr of ordered) {
      try {
        const g = await getPull(owner, repo, pr.pr_number);
        out.push({
          ...pr,
          title: g.title,
          html_url: g.html_url,
          state: g.state
        });
      } catch (e) {
        out.push({ ...pr, error: String(e.message || e) });
      }
    }
    if (opts.json) {
      printJson({ ...doc, prs: out });
    } else {
      console.log(
        formatStackEnrichHuman(/** @type {Record<string, unknown>} */ (doc), /** @type {Record<string, unknown>[]} */ (out))
      );
    }
  });

stack
  .command("list")
  .description(
    "Discover nugit stacks in the repo: scan open PR heads for .nugit/stack.json, dedupe by stack tip (for review / triage)"
  )
  .option("--repo <owner/repo>", "Default: github.com origin from cwd")
  .option(
    "--max-open-prs <n>",
    "Max open PRs to scan (0 = all pages). Default: config / discovery mode"
  )
  .option(
    "--fetch-concurrency <n>",
    "Parallel GitHub API calls. Default: config (see stack-discovery-fetch-concurrency)"
  )
  .option(
    "--full",
    "Full scan for lazy mode (same as NUGIT_STACK_DISCOVERY_FULL=1)",
    false
  )
  .option("--no-enrich", "Skip loading PR titles from the API (faster)", false)
  .option("--json", "Machine-readable result", false)
  .action(async (opts) => {
    const root = findGitRoot();
    const repoFull =
      opts.repo || (root ? getRepoFullNameFromGitRoot(root) : null);
    if (!repoFull) {
      throw new Error(
        "Pass --repo owner/repo or run inside a git clone with github.com origin"
      );
    }
    const { owner, repo } = parseRepoFullName(repoFull);
    const discovery = getStackDiscoveryOpts();
    const maxOpenPrs =
      opts.maxOpenPrs != null && String(opts.maxOpenPrs).length
        ? Number.parseInt(String(opts.maxOpenPrs), 10)
        : effectiveMaxOpenPrs(discovery, opts.full);
    const fetchConcurrency =
      opts.fetchConcurrency != null && String(opts.fetchConcurrency).length
        ? Math.max(1, Math.min(32, Number.parseInt(String(opts.fetchConcurrency), 10) || 8))
        : discovery.fetchConcurrency;
    const result = await discoverStacksInRepo(owner, repo, {
      maxOpenPrs: Number.isNaN(maxOpenPrs) ? discovery.maxOpenPrs : maxOpenPrs,
      enrich: !opts.noEnrich,
      fetchConcurrency
    });
    if (opts.json) {
      printJson(result);
    } else {
      console.log(formatStacksListHuman(result));
    }
  });

stack
  .command("index")
  .description("Write .nugit/stack-index.json from GitHub discovery (for lazy/manual modes)")
  .option("--repo <owner/repo>", "Default: github.com origin from cwd")
  .option("--max-open-prs <n>", "Max open PRs to scan (default: config)")
  .option("--no-enrich", "Skip PR title fetch", false)
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const repoFull =
      opts.repo || (root ? getRepoFullNameFromGitRoot(root) : null);
    if (!repoFull) {
      throw new Error("Pass --repo owner/repo or run from a clone with github.com origin");
    }
    const { owner, repo } = parseRepoFullName(repoFull);
    const discovery = getStackDiscoveryOpts();
    const max =
      opts.maxOpenPrs != null && String(opts.maxOpenPrs).length
        ? Number.parseInt(String(opts.maxOpenPrs), 10)
        : discovery.maxOpenPrs;
    const result = await discoverStacksInRepo(owner, repo, {
      maxOpenPrs: Number.isNaN(max) ? discovery.maxOpenPrs : max,
      enrich: !opts.noEnrich,
      fetchConcurrency: discovery.fetchConcurrency
    });
    writeStackIndex(root, result);
    console.error(`Wrote ${root}/.nugit/stack-index.json (${result.stacks_found} stack(s))`);
  });

stack
  .command("graph")
  .description("Print compiled stack graph from stack-index.json + .nugit/stack-history.jsonl")
  .option("--live", "Rediscover from GitHub if index missing", false)
  .option("--json", "Machine-readable", false)
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const repoFull = getRepoFullNameFromGitRoot(root);
    let discovered = tryLoadStackIndex(root, repoFull);
    if (!discovered && opts.live) {
      const { owner, repo } = parseRepoFullName(repoFull);
      const d = getStackDiscoveryOpts();
      discovered = await discoverStacksInRepo(owner, repo, {
        maxOpenPrs: d.maxOpenPrs,
        enrich: false,
        fetchConcurrency: d.fetchConcurrency
      });
    }
    if (!discovered) {
      throw new Error("No stack-index.json — run: nugit stack index (or use --live)");
    }
    const hist = readStackHistoryLines(root);
    const graph = compileStackGraph(discovered, hist);
    if (opts.json) {
      printJson(graph);
    } else {
      console.log(JSON.stringify(graph, null, 2));
    }
  });

stack
  .command("add")
  .description("Append one or more PRs to the stack (metadata from GitHub), bottom→top order")
  .requiredOption(
    "--pr <n...>",
    "Pull request number(s): stack order bottom first — space- or comma-separated, or repeat --pr"
  )
  .option("--json", "Print entries as JSON", false)
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const doc = readStackFile(root);
    if (!doc) {
      throw new Error("No .nugit/stack.json — run nugit init first");
    }
    validateStackDoc(doc);
    const prNums = parseStackAddPrNumbers(opts.pr);
    const { owner, repo } = parseRepoFullName(doc.repo_full_name);
    /** @type {ReturnType<typeof stackEntryFromGithubPull>[]} */
    const added = [];
    for (const prNum of prNums) {
      if (doc.prs.some((p) => p.pr_number === prNum)) {
        throw new Error(`PR #${prNum} is already in the stack`);
      }
      const pull = await getPull(owner, repo, prNum);
      const position = nextStackPosition(doc.prs);
      const entry = stackEntryFromGithubPull(pull, position);
      doc.prs.push(entry);
      added.push(entry);
    }
    writeStackFile(root, doc);
    if (opts.json) {
      printJson(added.length === 1 ? added[0] : added);
    } else {
      for (const e of added) {
        console.log(
          chalk.bold(`PR #${e.pr_number}`) +
            chalk.dim(`  ${e.head_branch} ← ${e.base_branch}`)
        );
      }
    }
    console.error(
      `\nUpdated stack (${doc.prs.length} PRs). Run \`nugit stack propagate --push\` to commit the stack on the tip if needed, write prefix metadata on each head, merge lower→upper, and push.`
    );
  });

function addPropagateOptions(cmd) {
  return cmd
    .option(
      "-m, --message <msg>",
      "Commit message for each branch",
      "nugit: propagate stack metadata"
    )
    .option("--push", "Run git push for each head after committing", false)
    .option("--dry-run", "Print git actions without changing branches or committing", false)
    .option("--remote <name>", "Remote name (default: origin)", "origin")
    .option(
      "--no-merge-lower",
      "Do not merge each lower stacked head into the current head before writing stack.json (can break PR chains; not recommended)",
      false
    )
    .option(
      "--no-bootstrap",
      "Do not auto-commit a dirty .nugit/stack.json on the tip before propagating (you must commit it yourself)",
      false
    );
}

withStackViewCliOptions(
  stack
    .command("view")
    .description(
      "Interactive stack viewer (GitHub API): PR chain, comments, open links, reply, request reviewers"
    )
);

addPropagateOptions(
  stack
    .command("propagate")
    .description(
      "Commit .nugit/stack.json on each stacked head: prs prefix through that layer, plus layer (with tip). Auto-commits tip stack file if it is the only dirty path; merges each lower head into the next so PRs stay mergeable."
    )
).action(async (opts) => {
  const root = findGitRoot();
  if (!root) {
    throw new Error("Not inside a git repository");
  }
  await runStackPropagate({
    root,
    message: opts.message,
    push: opts.push,
    dryRun: opts.dryRun,
    remote: opts.remote,
    noMergeLower: opts.noMergeLower,
    bootstrapCommit: !opts.noBootstrap
  });
});

addPropagateOptions(
  stack
    .command("commit")
    .description("Alias for `nugit stack propagate` — prefix stack metadata on each stacked head")
).action(async (opts) => {
  const root = findGitRoot();
  if (!root) {
    throw new Error("Not inside a git repository");
  }
  await runStackPropagate({
    root,
    message: opts.message,
    push: opts.push,
    dryRun: opts.dryRun,
    remote: opts.remote,
    noMergeLower: opts.noMergeLower,
    bootstrapCommit: !opts.noBootstrap
  });
});

registerStackExtraCommands(stack);

program.addCommand(stack);

program.parseAsync().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
