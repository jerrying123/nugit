import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const STACK_REL = path.join(".nugit", "stack.json");

export function findGitRoot(cwd = process.cwd()) {
  try {
    const out = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function stackJsonPath(root) {
  return path.join(root, STACK_REL);
}

export function readStackFile(root) {
  const p = stackJsonPath(root);
  if (!fs.existsSync(p)) {
    return null;
  }
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export function validateStackDoc(doc) {
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid stack document");
  }
  if (doc.version !== 1) {
    throw new Error("version must be 1");
  }
  if (!doc.repo_full_name || typeof doc.repo_full_name !== "string") {
    throw new Error("repo_full_name is required");
  }
  if (!doc.created_by || typeof doc.created_by !== "string") {
    throw new Error("created_by is required");
  }
  if (!Array.isArray(doc.prs)) {
    throw new Error("prs must be an array");
  }
  const seenN = new Set();
  const seenP = new Set();
  for (let i = 0; i < doc.prs.length; i++) {
    const pr = doc.prs[i];
    if (!pr || typeof pr !== "object") {
      throw new Error(`prs[${i}] invalid`);
    }
    const n = pr.pr_number;
    const pos = pr.position;
    if (typeof n !== "number" || typeof pos !== "number") {
      throw new Error(`prs[${i}]: pr_number and position required`);
    }
    if (seenN.has(n)) {
      throw new Error(`duplicate pr_number ${n}`);
    }
    if (seenP.has(pos)) {
      throw new Error(`duplicate position ${pos}`);
    }
    seenN.add(n);
    seenP.add(pos);
  }
  return true;
}

export function writeStackFile(root, doc) {
  validateStackDoc(doc);
  const dir = path.join(root, ".nugit");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stackJsonPath(root), JSON.stringify(doc, null, 2) + "\n");
}

export function createInitialStackDoc(repoFullName, createdBy) {
  return {
    version: 1,
    repo_full_name: repoFullName,
    created_by: createdBy,
    prs: [],
    resolution_contexts: []
  };
}

export function parseRepoFullName(s) {
  const parts = s.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("repo must be owner/repo");
  }
  return { owner: parts[0], repo: parts[1] };
}
