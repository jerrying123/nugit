import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  buildStartEnv,
  expandUserPath,
  getConfigPath,
  inferMonorepoRootFromCli,
  loadEnvFile,
  mergeNugitPath,
  readUserConfig,
  writeUserConfig
} from "./user-config.js";
import { findGitRoot, parseRepoFullName } from "./nugit-stack.js";
import { getRepoFullNameFromGitRoot } from "./git-info.js";
import { questionLine } from "./stack-view/prompt-line.js";

/**
 * @param {object} opts
 * @param {string} [opts.installRoot]
 * @param {string} [opts.envFile]
 * @param {string} [opts.workingDirectory]
 */
export function runConfigInit(opts) {
  const root = path.resolve(
    expandUserPath(opts.installRoot || inferMonorepoRootFromCli())
  );
  const defaultEnv = path.join(root, ".env");
  const envFile = expandUserPath(opts.envFile || defaultEnv);
  const cfg = { installRoot: root, envFile };
  if (opts.workingDirectory) {
    cfg.workingDirectory = expandUserPath(opts.workingDirectory);
  }
  writeUserConfig(cfg);
  console.error(`Wrote ${getConfigPath()}`);
  console.error(`  installRoot: ${root}`);
  console.error(`  envFile: ${envFile}`);
  if (!fs.existsSync(envFile)) {
    console.error(`  (env file does not exist yet — create it or run: nugit config set env-file <path>)`);
  }
  if (cfg.workingDirectory) {
    console.error(`  workingDirectory: ${cfg.workingDirectory}`);
  }
}

export function runConfigShow() {
  const c = readUserConfig();
  console.log(JSON.stringify(c, null, 2));
}

/**
 * @param {string} key
 * @param {string} value
 */
export function runConfigSet(key, value) {
  const c = readUserConfig();
  const k = key.toLowerCase().replace(/_/g, "-");
  if (k === "install-root") {
    c.installRoot = path.resolve(expandUserPath(value));
  } else if (k === "env-file") {
    c.envFile = expandUserPath(value);
  } else if (k === "working-directory" || k === "cwd") {
    c.workingDirectory = expandUserPath(value);
  } else if (k === "stack-discovery-mode") {
    c.stackDiscovery = { ...(c.stackDiscovery || {}), mode: value };
  } else if (k === "stack-discovery-max-open-prs") {
    c.stackDiscovery = {
      ...(c.stackDiscovery || {}),
      maxOpenPrs: Number.parseInt(value, 10)
    };
  } else if (k === "stack-discovery-fetch-concurrency") {
    c.stackDiscovery = {
      ...(c.stackDiscovery || {}),
      fetchConcurrency: Number.parseInt(value, 10)
    };
  } else if (k === "stack-discovery-background") {
    c.stackDiscovery = {
      ...(c.stackDiscovery || {}),
      background: value === "true" || value === "1"
    };
  } else if (k === "stack-discovery-lazy-first-pass-max-prs") {
    c.stackDiscovery = {
      ...(c.stackDiscovery || {}),
      lazyFirstPassMaxPrs: Number.parseInt(value, 10)
    };
  } else {
    throw new Error(
      `Unknown key "${key}". Use: install-root | env-file | working-directory | stack-discovery-mode | stack-discovery-max-open-prs | stack-discovery-fetch-concurrency | stack-discovery-background | stack-discovery-lazy-first-pass-max-prs`
    );
  }
  writeUserConfig(c);
  console.error(`Updated ${getConfigPath()}`);
}

/**
 * Shell-escape for single-quoted POSIX strings.
 * @param {string} s
 */
function shellQuoteExport(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Print eval-able export lines (bash/zsh).
 * @param {'bash' | 'fish'} style
 */
export function runEnvExport(style = "bash") {
  const cfg = readUserConfig();
  if (!cfg.installRoot || !cfg.envFile) {
    throw new Error("Run `nugit config init` first (or set install-root and env-file).");
  }
  const root = path.resolve(expandUserPath(cfg.installRoot));
  const { vars, pathUsed } = loadEnvFile(cfg.envFile);
  const merged = mergeNugitPath(
    {
      ...process.env,
      ...vars,
      NUGIT_MONOREPO_ROOT: root,
      NUGIT_ENV_FILE: pathUsed
    },
    root
  );

  if (style === "fish") {
    for (const [k, v] of Object.entries(vars)) {
      console.log(`set -gx ${k} ${JSON.stringify(v)}`);
    }
    console.log(`set -gx NUGIT_MONOREPO_ROOT ${JSON.stringify(root)}`);
    console.log(`set -gx NUGIT_ENV_FILE ${JSON.stringify(pathUsed)}`);
    if (merged.PATH && merged.PATH !== process.env.PATH) {
      console.log(`set -gx PATH ${JSON.stringify(merged.PATH)}`);
    }
    return;
  }

  for (const [k, v] of Object.entries(vars)) {
    console.log(`export ${k}=${shellQuoteExport(v)}`);
  }
  console.log(`export NUGIT_MONOREPO_ROOT=${shellQuoteExport(root)}`);
  console.log(`export NUGIT_ENV_FILE=${shellQuoteExport(pathUsed)}`);
  if (merged.PATH && merged.PATH !== process.env.PATH) {
    console.log(`export PATH=${shellQuoteExport(merged.PATH)}`);
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.command] shell command string for -lc
 */
export function runStart(opts) {
  const cfg = readUserConfig();
  if (!cfg.installRoot || !cfg.envFile) {
    throw new Error(
      "No saved config. Run:\n  nugit config init\n  # then: nugit start"
    );
  }
  const env = buildStartEnv(cfg);
  const cwd = cfg.workingDirectory
    ? expandUserPath(cfg.workingDirectory)
    : process.cwd();
  const shell = process.env.SHELL || "/bin/bash";
  const cmd = opts.command;
  const args = cmd ? ["-lc", cmd] : ["-i"];
  const child = spawn(shell, args, {
    env,
    cwd,
    stdio: "inherit"
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}

/**
 * Interactive menu when stdin/stdout are TTY. Options 1–2 run then exit; 3 spawns the shell (same as plain `nugit start` without a menu).
 */
export async function runStartHub() {
  console.error("nugit start — choose:");
  console.error("  1) Stack view");
  console.error("  2) Split a PR");
  console.error("  3) Open shell");
  const ans = (await questionLine("Enter 1–3 [3]: ")).trim();
  const choice = ans || "3";
  if (choice === "1") {
    const { runStackViewCommand } = await import("./stack-view/run-stack-view.js");
    await runStackViewCommand({});
    process.exit(0);
  }
  if (choice === "2") {
    const raw = (await questionLine("PR number to split: ")).trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      console.error("Invalid PR number.");
      process.exit(1);
    }
    const root = findGitRoot();
    if (!root) {
      console.error("Not inside a git repository.");
      process.exit(1);
    }
    const repoFull = getRepoFullNameFromGitRoot(root);
    const { owner, repo: repoName } = parseRepoFullName(repoFull);
    const { runSplitCommand } = await import("./split-view/run-split.js");
    await runSplitCommand({ root, owner, repo: repoName, prNumber: n });
    process.exit(0);
  }
  runStart({});
}
