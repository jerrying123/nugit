#!/usr/bin/env node
import { Command } from "commander";
import {
  startDeviceFlow,
  pollDeviceFlow,
  savePat,
  listMyPulls,
  fetchRemoteStackJson,
  getPull
} from "./api-client.js";
import {
  findGitRoot,
  readStackFile,
  writeStackFile,
  createInitialStackDoc,
  validateStackDoc,
  parseRepoFullName
} from "./nugit-stack.js";

const program = new Command();
program.name("stackpr").description("StackPR CLI — stack state in .nugit/stack.json");

program
  .command("auth:login")
  .description("Start GitHub device flow (open URL, then run auth:poll)")
  .action(async () => {
    const result = await startDeviceFlow();
    console.log(JSON.stringify(result, null, 2));
    if (result.verification_uri && result.user_code) {
      console.log(`Open ${result.verification_uri} and enter code ${result.user_code}`);
      console.log("Then: stackpr auth:poll --device-code <device_code>");
    }
  });

program
  .command("auth:poll")
  .description("Poll device flow; prints access_token to store in STACKPR_USER_TOKEN")
  .requiredOption("--device-code <code>", "device_code from auth:login")
  .action(async (opts) => {
    const result = await pollDeviceFlow(opts.deviceCode);
    console.log(JSON.stringify(result, null, 2));
    if (result.access_token) {
      console.error("\nSet your token:\n  export STACKPR_USER_TOKEN=" + JSON.stringify(result.access_token));
    }
  });

program
  .command("auth:pat")
  .description("Validate PAT via API; server does not store it — set STACKPR_USER_TOKEN")
  .requiredOption("--token <token>", "GitHub PAT")
  .action(async (opts) => {
    const result = await savePat(opts.token);
    console.log(JSON.stringify(result, null, 2));
    if (result.access_token) {
      console.error("\nexport STACKPR_USER_TOKEN=" + JSON.stringify(result.access_token));
    }
  });

program
  .command("prs:list")
  .description("List my pull requests")
  .action(async () => {
    const result = await listMyPulls();
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("stack:init")
  .description("Create .nugit/stack.json in the current git repo")
  .requiredOption("--repo <owner/repo>", "Repository full name")
  .requiredOption("--user <github-login>", "GitHub login (metadata)")
  .action(async (opts) => {
    const root = findGitRoot();
    if (!root) {
      throw new Error("Not inside a git repository");
    }
    const doc = createInitialStackDoc(opts.repo, opts.user);
    writeStackFile(root, doc);
    console.log(`Wrote ${root}/.nugit/stack.json`);
    console.log("Commit and push when ready.");
  });

program
  .command("stack:show")
  .description("Show local .nugit/stack.json")
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

program
  .command("stack:fetch-remote")
  .description("Fetch .nugit/stack.json from GitHub via API (needs STACKPR_USER_TOKEN)")
  .requiredOption("--repo <owner/repo>", "Repository full name")
  .option("--ref <ref>", "branch or sha", "")
  .action(async (opts) => {
    const doc = await fetchRemoteStackJson(opts.repo, opts.ref || undefined);
    validateStackDoc(doc);
    console.log(JSON.stringify(doc, null, 2));
  });

program
  .command("stack:enrich")
  .description("Print stack with PR titles from GitHub (local .nugit + API)")
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

program.parseAsync().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
