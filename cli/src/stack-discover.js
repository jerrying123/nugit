import { githubListOpenPulls } from "./github-rest.js";
import { getGithubContents, decodeGithubFileContent, getPull } from "./api-client.js";
import { validateStackDoc } from "./nugit-stack.js";

/**
 * Stack tip PR # from layer.tip, else top entry by position in doc.prs.
 * @param {Record<string, unknown>} doc
 * @returns {number | null}
 */
export function stackTipPrNumber(doc) {
  const layer = doc.layer;
  if (layer && typeof layer === "object") {
    const tip = /** @type {{ tip?: { pr_number?: number } }} */ (layer).tip;
    if (tip && typeof tip === "object" && typeof tip.pr_number === "number" && tip.pr_number >= 1) {
      return tip.pr_number;
    }
  }
  const prs = Array.isArray(doc.prs) ? doc.prs : [];
  if (!prs.length) {
    return null;
  }
  const sorted = [...prs].sort(
    (a, b) =>
      (/** @type {{ position?: number }} */ (a).position ?? 0) -
      (/** @type {{ position?: number }} */ (b).position ?? 0)
  );
  const top = sorted[sorted.length - 1];
  const n = top && typeof top === "object" ? /** @type {{ pr_number?: number }} */ (top).pr_number : undefined;
  return typeof n === "number" && n >= 1 ? n : null;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} owner
 * @param {string} repo
 */
export function docRepoMatches(doc, owner, repo) {
  const full = String(doc.repo_full_name || "").toLowerCase();
  return full === `${owner}/${repo}`.toLowerCase();
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<void>} fn
 */
async function forEachPool(items, concurrency, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) {
        return;
      }
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function tryLoadStackDocAtRef(owner, repo, ref) {
  try {
    const item = await getGithubContents(owner, repo, ".nugit/stack.json", ref);
    const text = decodeGithubFileContent(item);
    if (!text) {
      return null;
    }
    const doc = JSON.parse(text);
    validateStackDoc(doc);
    if (!docRepoMatches(doc, owner, repo)) {
      return null;
    }
    return /** @type {Record<string, unknown>} */ (doc);
  } catch {
    return null;
  }
}

/**
 * If this is a propagated prefix, try to load the full tip stack doc.
 * @param {string} owner
 * @param {string} repo
 * @param {Record<string, unknown>} doc
 */
async function maybeExpandPrefixDoc(owner, repo, doc) {
  const layer = doc.layer && typeof doc.layer === "object" ? /** @type {Record<string, unknown>} */ (doc.layer) : null;
  if (!layer) {
    return doc;
  }
  const stackSize = layer.stack_size;
  const prs = Array.isArray(doc.prs) ? doc.prs : [];
  const tip = layer.tip && typeof layer.tip === "object" ? /** @type {Record<string, unknown>} */ (layer.tip) : null;
  const tipHead = tip && typeof tip.head_branch === "string" ? tip.head_branch.trim() : "";
  if (
    typeof stackSize !== "number" ||
    !Number.isFinite(stackSize) ||
    stackSize <= prs.length ||
    !tipHead
  ) {
    return doc;
  }
  const full = await tryLoadStackDocAtRef(owner, repo, tipHead);
  if (!full) {
    return doc;
  }
  const fullPrs = Array.isArray(full.prs) ? full.prs : [];
  return fullPrs.length > prs.length ? full : doc;
}

/**
 * Scan open PRs; any head with committed `.nugit/stack.json` counts. Deduplicate by stack tip PR # (layer.tip or top of prs).
 *
 * @param {string} owner
 * @param {string} repo
 * @param {{
 *   maxOpenPrs?: number,
 *   listPerPage?: number,
 *   enrich?: boolean,
 *   fetchConcurrency?: number,
 *   onProgress?: (msg: string) => void
 * }} [opts]
 */
export async function discoverStacksInRepo(owner, repo, opts = {}) {
  const maxOpenPrs = opts.maxOpenPrs ?? 500;
  const listPerPage = Math.min(100, Math.max(1, opts.listPerPage ?? 100));
  const fetchConc = Math.max(1, Math.min(32, opts.fetchConcurrency ?? 8));
  const enrich = opts.enrich !== false;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;

  /** @type {unknown[]} */
  const allPulls = [];
  let page = 1;
  let truncated = false;
  for (;;) {
    if (maxOpenPrs > 0 && allPulls.length >= maxOpenPrs) {
      truncated = true;
      break;
    }
    const pulls = await githubListOpenPulls(owner, repo, page, listPerPage);
    if (!Array.isArray(pulls) || pulls.length === 0) {
      break;
    }
    for (const p of pulls) {
      if (maxOpenPrs > 0 && allPulls.length >= maxOpenPrs) {
        truncated = true;
        break;
      }
      allPulls.push(p);
    }
    if (truncated) {
      break;
    }
    if (onProgress) {
      onProgress(`listed open PRs: ${allPulls.length}`);
    }
    if (pulls.length < listPerPage) {
      break;
    }
    page += 1;
  }

  /** @type {({ doc: Record<string, unknown>, discoveredFromPr: number, headRef: string } | null)[]} */
  const rowSlots = Array(allPulls.length).fill(null);

  let checkedHeads = 0;
  await forEachPool(allPulls, fetchConc, async (pull, i) => {
    const p = pull && typeof pull === "object" ? /** @type {Record<string, unknown>} */ (pull) : {};
    const head = p.head && typeof p.head === "object" ? /** @type {Record<string, unknown>} */ (p.head) : {};
    const ref = typeof head.ref === "string" ? head.ref : "";
    const num = p.number;
    if (!ref || typeof num !== "number") {
      return;
    }
    const doc = await tryLoadStackDocAtRef(owner, repo, ref);
    checkedHeads += 1;
    if (onProgress && (checkedHeads % 10 === 0 || checkedHeads === allPulls.length)) {
      onProgress(`checked stack.json on PR heads: ${checkedHeads}/${allPulls.length}`);
    }
    if (!doc) {
      return;
    }
    rowSlots[i] = { doc, discoveredFromPr: num, headRef: ref };
  });

  const found = rowSlots.filter(Boolean);
  /** @type {Map<number, { doc: Record<string, unknown>, discoveredFromPr: number, headRef: string }>} */
  const byTip = new Map();

  for (const row of found) {
    if (!row) {
      continue;
    }
    const expandedDoc = await maybeExpandPrefixDoc(owner, repo, row.doc);
    const tip = stackTipPrNumber(expandedDoc);
    if (tip == null) {
      continue;
    }
    const prev = byTip.get(tip);
    const score = Array.isArray(expandedDoc.prs) ? expandedDoc.prs.length : 0;
    const prevScore = prev ? (Array.isArray(prev.doc.prs) ? prev.doc.prs.length : 0) : -1;
    if (!prev || score > prevScore || (score === prevScore && row.discoveredFromPr === tip)) {
      byTip.set(tip, {
        doc: expandedDoc,
        discoveredFromPr: row.discoveredFromPr,
        headRef: row.headRef
      });
    }
  }

  const repoFull = `${owner}/${repo}`;
  /** @type {import("./stack-discover.js").DiscoveredStack[]} */
  const stacks = [];

  for (const [tipPr, meta] of [...byTip.entries()].sort((a, b) => a[0] - b[0])) {
    const doc = meta.doc;
    const prs = Array.isArray(doc.prs) ? doc.prs : [];
    const sorted = [...prs].sort(
      (a, b) =>
        (/** @type {{ position?: number }} */ (a).position ?? 0) -
        (/** @type {{ position?: number }} */ (b).position ?? 0)
    );

    /** @type {{ pr_number: number, position: number, title?: string, html_url?: string, head_branch?: string }[]} */
    let prRows = sorted.map((entry) => {
      const e = entry && typeof entry === "object" ? /** @type {Record<string, unknown>} */ (entry) : {};
      return {
        pr_number: /** @type {number} */ (e.pr_number),
        position: /** @type {number} */ (e.position),
        head_branch: typeof e.head_branch === "string" ? e.head_branch : undefined
      };
    });

    if (enrich) {
      if (onProgress) {
        onProgress(`loading PR titles for stack tip #${tipPr}`);
      }
      await forEachPool(prRows, fetchConc, async (row) => {
        try {
          const g = await getPull(owner, repo, row.pr_number);
          row.title = typeof g.title === "string" ? g.title : undefined;
          row.html_url = typeof g.html_url === "string" ? g.html_url : undefined;
        } catch {
          /* keep without title */
        }
      });
    }

    const tipEntry = sorted.find((e) => {
      const o = e && typeof e === "object" ? /** @type {{ pr_number?: number }} */ (e) : {};
      return o.pr_number === tipPr;
    });
    const tipObj = tipEntry && typeof tipEntry === "object" ? /** @type {Record<string, unknown>} */ (tipEntry) : {};
    const tipHeadBranch =
      typeof tipObj.head_branch === "string"
        ? tipObj.head_branch
        : meta.headRef;

    stacks.push({
      tip_pr_number: tipPr,
      created_by: String(doc.created_by || ""),
      discovered_from_pr: meta.discoveredFromPr,
      pr_count: prRows.length,
      prs: prRows,
      tip_head_branch: tipHeadBranch,
      fetch_command: `nugit stack fetch --repo ${repoFull} --ref ${tipHeadBranch}`,
      view_command: `nugit view --repo ${repoFull} --ref ${tipHeadBranch}`
    });
  }

  return {
    repo_full_name: repoFull,
    scanned_open_prs: allPulls.length,
    open_prs_truncated: truncated,
    stacks_found: stacks.length,
    stacks
  };
}
