import fs from "fs";
import path from "path";
import { stackJsonPath } from "./nugit-stack.js";

const INDEX_NAME = "stack-index.json";
const HISTORY_NAME = "stack-history.jsonl";

/** @param {string} root */
export function stackIndexPath(root) {
  return path.join(root, ".nugit", INDEX_NAME);
}

/** @param {string} root */
export function stackHistoryPath(root) {
  return path.join(root, ".nugit", HISTORY_NAME);
}

/**
 * @param {string} root
 * @param {string} repoFull owner/repo
 * @returns {Record<string, unknown> | null}
 */
export function tryLoadStackIndex(root, repoFull) {
  const p = stackIndexPath(root);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") {
      return null;
    }
    const o = /** @type {Record<string, unknown>} */ (data);
    if (String(o.repo_full_name || "").toLowerCase() !== repoFull.toLowerCase()) {
      return null;
    }
    if (!Array.isArray(o.stacks)) {
      return null;
    }
    return /** @type {Record<string, unknown>} */ (data);
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} discovered discoverStacksInRepo return shape
 */
export function writeStackIndex(root, discovered) {
  const dir = path.join(root, ".nugit");
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    version: 1,
    generated_at: new Date().toISOString(),
    ...discovered
  };
  fs.writeFileSync(stackIndexPath(root), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

/**
 * @param {string} root
 * @param {{
 *   action: string,
 *   repo_full_name: string,
 *   snapshot?: Record<string, unknown>,
 *   parent_record_id?: string,
 *   tip_pr_number?: number,
 *   head_branch?: string
 * }} record
 * @returns {string} new record id
 */
export function appendStackHistory(root, record) {
  const dir = path.join(root, ".nugit");
  fs.mkdirSync(dir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const line = JSON.stringify({
    schema_version: 1,
    id,
    at: new Date().toISOString(),
    ...record
  });
  fs.appendFileSync(stackHistoryPath(root), line + "\n", "utf8");
  return id;
}

/**
 * @param {string} root
 * @returns {unknown[]}
 */
export function readStackHistoryLines(root) {
  const p = stackHistoryPath(root);
  if (!fs.existsSync(p)) {
    return [];
  }
  const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Build directed graph from discovery + history (forward: bottom→top within stack; backward: history parent links).
 * @param {Record<string, unknown> | null | undefined} discovered
 * @param {unknown[]} [historyRecords]
 */
export function compileStackGraph(discovered, historyRecords = []) {
  /** @type {{ id: string, type: string, tip_pr?: number, prs?: number[], meta?: Record<string, unknown> }[]} */
  const nodes = [];
  /** @type {{ from: string, to: string, kind: string }[]} */
  const edges = [];
  const seen = new Set();

  const stacks = discovered && Array.isArray(discovered.stacks) ? discovered.stacks : [];
  for (const s of stacks) {
    if (!s || typeof s !== "object") continue;
    const st = /** @type {Record<string, unknown>} */ (s);
    const tip = st.tip_pr_number;
    if (typeof tip !== "number") continue;
    const id = `stack_tip_${tip}`;
    const prRows = Array.isArray(st.prs) ? st.prs : [];
    const prNums = prRows
      .map((p) => (p && typeof p === "object" ? /** @type {{ pr_number?: number }} */ (p).pr_number : undefined))
      .filter((n) => typeof n === "number");
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({
        id,
        type: "stack",
        tip_pr: tip,
        prs: prNums,
        meta: {
          tip_head_branch: st.tip_head_branch,
          repo_full_name: discovered?.repo_full_name
        }
      });
    }
    for (let i = 0; i < prNums.length - 1; i++) {
      const a = `pr_${prNums[i]}`;
      const b = `pr_${prNums[i + 1]}`;
      if (!seen.has(a)) {
        seen.add(a);
        nodes.push({ id: a, type: "pr", tip_pr: prNums[i] });
      }
      if (!seen.has(b)) {
        seen.add(b);
        nodes.push({ id: b, type: "pr", tip_pr: prNums[i + 1] });
      }
      edges.push({ from: a, to: b, kind: "stack_above" });
    }
    if (prNums.length === 1) {
      const a = `pr_${prNums[0]}`;
      if (!seen.has(a)) {
        seen.add(a);
        nodes.push({ id: a, type: "pr", tip_pr: prNums[0] });
      }
    }
  }

  for (const rec of historyRecords) {
    if (!rec || typeof rec !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (rec);
    const hid = typeof r.id === "string" ? r.id : null;
    if (!hid) continue;
    const nid = `hist_${hid}`;
    if (!seen.has(nid)) {
      seen.add(nid);
      nodes.push({
        id: nid,
        type: "history",
        meta: { action: r.action, at: r.at }
      });
    }
    const parent = typeof r.parent_record_id === "string" ? r.parent_record_id : null;
    if (parent) {
      edges.push({ from: `hist_${parent}`, to: nid, kind: "history_next" });
    }
  }

  return { nodes, edges, generated_at: new Date().toISOString() };
}

/**
 * Snapshot current stack.json from disk into history (optional helper).
 * @param {string} root
 * @param {string} action
 * @param {string} [parentId]
 */
export function snapshotStackFileToHistory(root, action, parentId) {
  const p = stackJsonPath(root);
  if (!fs.existsSync(p)) {
    return null;
  }
  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
  const repo = doc && typeof doc.repo_full_name === "string" ? doc.repo_full_name : "";
  return appendStackHistory(root, {
    action,
    repo_full_name: repo,
    snapshot: doc,
    parent_record_id: parentId
  });
}
