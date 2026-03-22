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
  validateOptionalLayer(doc);
  return true;
}

/**
 * @param {unknown} p
 * @param {string} label
 * @param {boolean} allowBranch
 */
function validateLayerPointer(p, label, allowBranch) {
  if (p == null || typeof p !== "object") {
    throw new Error(`${label} must be an object`);
  }
  const o = /** @type {Record<string, unknown>} */ (p);
  const t = o.type;
  if (t === "branch") {
    if (!allowBranch) {
      throw new Error(`${label}: type "branch" not allowed here`);
    }
    if (typeof o.ref !== "string") {
      throw new Error(`${label}: branch ref must be a string`);
    }
    return;
  }
  if (t === "stack_pr") {
    if (typeof o.pr_number !== "number" || !Number.isInteger(o.pr_number) || o.pr_number < 1) {
      throw new Error(`${label}: stack_pr pr_number invalid`);
    }
    if (typeof o.head_branch !== "string") {
      throw new Error(`${label}: stack_pr head_branch must be a string`);
    }
    return;
  }
  throw new Error(`${label}: type must be "branch" or "stack_pr"`);
}

/**
 * @param {unknown} tip
 */
function validateLayerTip(tip) {
  if (tip == null || typeof tip !== "object") {
    throw new Error("layer.tip must be an object when present");
  }
  const t = /** @type {Record<string, unknown>} */ (tip);
  if (typeof t.pr_number !== "number" || !Number.isInteger(t.pr_number) || t.pr_number < 1) {
    throw new Error("layer.tip.pr_number must be a positive integer");
  }
  if (typeof t.head_branch !== "string") {
    throw new Error("layer.tip.head_branch must be a string");
  }
}

/**
 * @param {unknown} layer
 * @param {number} prsLength
 * @param {unknown[]} [prs] entries for prefix / position checks
 */
export function validateLayerShape(layer, prsLength, prs) {
  if (layer == null || typeof layer !== "object") {
    throw new Error("layer must be an object");
  }
  const L = /** @type {Record<string, unknown>} */ (layer);
  if (typeof L.position !== "number" || !Number.isInteger(L.position) || L.position < 0) {
    throw new Error("layer.position must be a non-negative integer");
  }
  if (typeof L.stack_size !== "number" || !Number.isInteger(L.stack_size) || L.stack_size < 1) {
    throw new Error("layer.stack_size must be a positive integer");
  }
  const hasTip = "tip" in L && L.tip !== undefined && L.tip !== null;
  if (hasTip) {
    validateLayerTip(L.tip);
    if (L.stack_size < prsLength) {
      throw new Error(`layer.stack_size (${L.stack_size}) must be >= prs.length (${prsLength})`);
    }
    if (prsLength !== L.position + 1) {
      throw new Error(
        `with layer.tip, prs must be a bottom-up prefix: prs.length (${prsLength}) === layer.position + 1 (${L.position + 1})`
      );
    }
    if (prs && Array.isArray(prs) && prs.length > 0) {
      const sorted = [...prs].sort(
        (a, b) =>
          (/** @type {{ position?: number }} */ (a).position ?? 0) -
          (/** @type {{ position?: number }} */ (b).position ?? 0)
      );
      const last = sorted[sorted.length - 1];
      const lp = last && typeof last === "object" ? /** @type {{ position?: number }} */ (last).position : undefined;
      if (lp !== L.position) {
        throw new Error("last pr in prs must have position === layer.position");
      }
      const want = new Set();
      for (let i = 0; i <= L.position; i++) {
        want.add(i);
      }
      const have = new Set(sorted.map((p) => (p && typeof p === "object" ? p.position : -1)));
      if (want.size !== have.size || [...want].some((x) => !have.has(x))) {
        throw new Error("prs positions must be contiguous 0..layer.position");
      }
    }
  } else if (L.stack_size !== prsLength) {
    throw new Error(
      `without layer.tip, layer.stack_size (${L.stack_size}) must equal prs.length (${prsLength})`
    );
  }
  validateLayerPointer(L.below, "layer.below", true);
  if (L.above !== null) {
    validateLayerPointer(L.above, "layer.above", false);
  }
}

/**
 * @param {Record<string, unknown>} doc
 */
export function validateOptionalLayer(doc) {
  if (!("layer" in doc) || doc.layer === undefined) {
    return;
  }
  if (!Array.isArray(doc.prs)) {
    return;
  }
  validateLayerShape(doc.layer, doc.prs.length, doc.prs);
  const L = /** @type {Record<string, unknown>} */ (doc.layer);
  const positions = new Set(
    doc.prs.map((p) => (p && typeof p === "object" ? /** @type {{ position?: number }} */ (p).position : undefined))
  );
  if (!positions.has(L.position)) {
    throw new Error("layer.position must match one of prs[].position values");
  }
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

/** Next position after current max, or 0 if empty. */
export function nextStackPosition(prs) {
  if (!prs || !prs.length) {
    return 0;
  }
  return Math.max(...prs.map((p) => p.position)) + 1;
}

/**
 * Normalize `nugit stack add --pr` values (variadic and/or comma-separated).
 * @param {string | string[] | undefined} optsPr
 * @returns {number[]}
 */
export function parseStackAddPrNumbers(optsPr) {
  const raw = optsPr == null ? [] : Array.isArray(optsPr) ? optsPr : [optsPr];
  const tokens = [];
  for (const r of raw) {
    for (const part of String(r).split(/[\s,]+/)) {
      const t = part.trim();
      if (t) {
        tokens.push(t);
      }
    }
  }
  if (tokens.length === 0) {
    throw new Error("Pass at least one PR number: --pr <n> [n...]");
  }
  const nums = tokens.map((t) => Number.parseInt(t, 10));
  for (let i = 0; i < nums.length; i++) {
    if (!Number.isFinite(nums[i]) || nums[i] < 1) {
      throw new Error(`Invalid PR number: ${tokens[i]}`);
    }
  }
  const seen = new Set();
  for (const n of nums) {
    if (seen.has(n)) {
      throw new Error(`Duplicate PR #${n} in --pr list`);
    }
    seen.add(n);
  }
  return nums;
}

/**
 * Build a stack PR entry from GitHub GET /pulls/{n} JSON.
 * @param {Record<string, unknown>} pull
 * @param {number} position
 */
export function stackEntryFromGithubPull(pull, position) {
  const head = pull.head && typeof pull.head === "object" ? pull.head : {};
  const base = pull.base && typeof pull.base === "object" ? pull.base : {};
  let status = "open";
  if (pull.state === "closed") {
    status = pull.merged ? "merged" : "closed";
  }
  return {
    pr_number: pull.number,
    position,
    head_branch: head.ref || "",
    base_branch: base.ref || "",
    head_sha: head.sha || "",
    base_sha: base.sha || "",
    status
  };
}
