import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Infer monorepo root from this file: cli/src/user-config.js → …/nugit
 */
export function inferMonorepoRootFromCli() {
  const here = fileURLToPath(new URL(import.meta.url));
  return path.dirname(path.dirname(path.dirname(here)));
}

/**
 * @returns {string}
 */
export function getConfigDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "nugit");
}

/**
 * @returns {string}
 */
export function getConfigPath() {
  return path.join(getConfigDir(), "config.json");
}

/**
 * @typedef {{ installRoot?: string, envFile?: string, workingDirectory?: string }} NugitUserConfig
 */

/**
 * @returns {NugitUserConfig}
 */
export function readUserConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

/**
 * @param {NugitUserConfig} cfg
 */
export function writeUserConfig(cfg) {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

/**
 * Expand ~ in path segments.
 * @param {string} p
 */
export function expandUserPath(p) {
  if (!p || typeof p !== "string") {
    return p;
  }
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(1).replace(/^\//, ""));
  }
  return path.resolve(p);
}

/**
 * Minimal .env parser (KEY=VALUE, # comments, optional quotes).
 * @param {string} contents
 * @returns {Record<string, string>}
 */
export function parseDotEnv(contents) {
  const out = {};
  if (!contents) {
    return out;
  }
  for (const line of contents.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key || key.startsWith("#")) {
      continue;
    }
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load env vars from file into a plain object (does not mutate process.env).
 * @param {string} envFilePath absolute or user-expanded path
 */
export function loadEnvFile(envFilePath) {
  const p = expandUserPath(envFilePath);
  if (!fs.existsSync(p)) {
    throw new Error(`Env file not found: ${p}`);
  }
  const contents = fs.readFileSync(p, "utf8");
  return { vars: parseDotEnv(contents), pathUsed: p };
}

/**
 * Merge nugit PATH: prepend scripts dir if installRoot set.
 * @param {Record<string, string | undefined>} env
 * @param {string} installRoot
 */
export function mergeNugitPath(env, installRoot) {
  const scripts = path.join(installRoot, "scripts");
  const prev = env.PATH || process.env.PATH || "";
  const parts = prev.split(path.delimiter).filter(Boolean);
  if (!parts.includes(scripts)) {
    return { ...env, PATH: [scripts, prev].filter(Boolean).join(path.delimiter) };
  }
  return { ...env };
}

/**
 * Build env for child process: process.env + dotenv + optional PATH tweak + NUGIT_MONOREPO_ROOT
 * @param {NugitUserConfig} cfg
 */
export function buildStartEnv(cfg) {
  if (!cfg.installRoot) {
    throw new Error("installRoot not set; run: nugit config init");
  }
  if (!cfg.envFile) {
    throw new Error("envFile not set; run: nugit config init");
  }
  const { vars, pathUsed } = loadEnvFile(cfg.envFile);
  /** @type {Record<string, string>} */
  const merged = { ...process.env };
  for (const [k, v] of Object.entries(vars)) {
    merged[k] = v;
  }
  merged.NUGIT_MONOREPO_ROOT = path.resolve(expandUserPath(cfg.installRoot));
  merged.NUGIT_ENV_FILE = pathUsed;
  return mergeNugitPath(merged, merged.NUGIT_MONOREPO_ROOT);
}
