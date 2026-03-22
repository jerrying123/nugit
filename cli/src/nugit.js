#!/usr/bin/env node
import { Command } from "commander";
import {
  startDeviceFlow,
  pollDeviceFlow,
  savePat,
  listMyPulls,
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
  stackEntryFromGithubPull
} from "./nugit-stack.js";
import { runStackPropagate } from "./stack-propagate.js";
import { runStackViewCommand } from "./stack-view/run-stack-view.js";
import { getRepoFullNameFromGitRoot } from "./git-info.js";

const program = new Command();
program.name("nugit").description("Nugit CLI — stack state in .nugit/stack.json");

program
  .command("init")
  .description(
    "Create .nugit/stack.json (repo from git origin, user from token unless overridden)"
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
    const doc = createInitialStackDoc(repoFull, user);
    writeStackFile(root, doc);
    console.log(`Wrote ${root}/.nugit/stack.json (${repoFull})`);
    console.log("Commit and push when ready.");
  });

const auth = new Command("auth").description("GitHub authentication");

auth
  .command("login")
  .description("Start GitHub device flow (then run: nugit auth poll)")
  .action(async () => {
    const result = await startDeviceFlow();
    console.log(JSON.stringify(result, null, 2));
    if (result.verification_uri && result.user_code) {
      console.log(`Open ${result.verification_uri} and enter code ${result.user_code}`);
      console.log("Then: nugit auth poll --device-code <device_code>");
    }
  });

auth
  .command("poll")
  .description("Poll device flow; prints access_token (set NUGIT_USER_TOKEN or STACKPR_USER_TOKEN)")
  .requiredOption("--device-code <code>", "device_code from nugit auth login")
  .action(async (opts) => {
    const result = await pollDeviceFlow(opts.deviceCode);
    console.log(JSON.stringify(result, null, 2));
    if (result.access_token) {
      const t = JSON.stringify(result.access_token);
      console.error(`\nSet your token:\n  export NUGIT_USER_TOKEN=${t}\n  # or: export STACKPR_USER_TOKEN=${t}`);
    }
  });

auth
  .command("pat")
  .description("Validate PAT via API; server does not store it")
  .requiredOption("--token <token>", "GitHub PAT")
  .action(async (opts) => {
    const result = await savePat(opts.token);
    console.log(JSON.stringify(result, null, 2));
    if (result.access_token) {
      const t = JSON.stringify(result.access_token);
      console.error(`\nexport NUGIT_USER_TOKEN=${t}\n# or: export STACKPR_USER_TOKEN=${t}`);
    }
  });

auth
  .command("whoami")
  .description("Print GitHub login for your token (via API)")
  .action(async () => {
    const me = await authMe();
    console.log(JSON.stringify(me, null, 2));
  });

program.addCommand(auth);

const prs = new Command("prs").description("Pull requests");

prs
  .command("list")
  .description("List my pull requests")
  .action(async () => {
    const result = await listMyPulls();
    console.log(JSON.stringify(result, null, 2));
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
    console.log(JSON.stringify(created, null, 2));
    if (created.number) {
      console.error(`\nAdd to stack: nugit stack add --pr ${created.number}`);
    }
  });

program.addCommand(prs);

const stack = new Command("stack").description("Local .nugit/stack.json");

stack
  .command("show")
  .description("Print local .nugit/stack.json")
  .action(async () => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const doc = readStackFile(root);
    if (!doc) {
      throw new Error("No .nugit/stack.json in this repo");
    }
    validateStackDoc(doc);
    console.log(JSON.stringify(doc, null, 2));
  });

stack
  .command("fetch")
  .description("Fetch .nugit/stack.json from GitHub via API (needs token)")
  .option("--repo <owner/repo>", "Default: git remote origin when run inside a repo")
  .option("--ref <ref>", "branch or sha", "")
  .action(async (opts) => {
    const root = findGitRoot();
    const repoFull =
      opts.repo || (root ? getRepoFullNameFromGitRoot(root) : null);
    if (!repoFull) {
      throw new Error("Pass --repo owner/repo or run from a git clone with github.com origin");
    }
    const doc = await fetchRemoteStackJson(repoFull, opts.ref || undefined);
    validateStackDoc(doc);
    console.log(JSON.stringify(doc, null, 2));
  });

stack
  .command("enrich")
  .description("Print stack with PR titles from GitHub (local file + API)")
  .action(async () => {
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
    console.log(JSON.stringify({ ...doc, prs: out }, null, 2));
  });

stack
  .command("add")
  .description("Append a PR to the stack (metadata from GitHub)")
  .requiredOption("--pr <n>", "Pull request number")
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
    const prNum = Number.parseInt(String(opts.pr), 10);
    if (!Number.isFinite(prNum) || prNum < 1) {
      throw new Error("Invalid --pr");
    }
    if (doc.prs.some((p) => p.pr_number === prNum)) {
      throw new Error(`PR #${prNum} is already in the stack`);
    }
    const { owner, repo } = parseRepoFullName(doc.repo_full_name);
    const pull = await getPull(owner, repo, prNum);
    const position = nextStackPosition(doc.prs);
    const entry = stackEntryFromGithubPull(pull, position);
    doc.prs.push(entry);
    writeStackFile(root, doc);
    console.log(JSON.stringify(entry, null, 2));
    console.error(
      `\nUpdated stack (${doc.prs.length} PRs). Run \`nugit stack propagate\` (or \`nugit stack commit\`) to write a prefix .nugit/stack.json (+ layer/tip) on each stacked head, then push (use --push).`
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
    .option("--remote <name>", "Remote name (default: origin)", "origin");
}

stack
  .command("view")
  .description(
    "Interactive stack viewer (GitHub API): PR chain, comments, open links, reply, request reviewers"
  )
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

addPropagateOptions(
  stack
    .command("propagate")
    .description(
      "Commit .nugit/stack.json on each stacked head: prs prefix through that layer, plus layer (with tip)"
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
    remote: opts.remote
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
    remote: opts.remote
  });
});

program.addCommand(stack);

program.parseAsync().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
