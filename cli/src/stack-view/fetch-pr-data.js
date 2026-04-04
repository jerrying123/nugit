import { githubGetPull, githubListPullFiles, githubRestJson } from "../github-rest.js";

/**
 * @param {unknown[]} items
 * @param {number} batchSize
 * @param {(item: unknown, index: number) => Promise<unknown>} fn
 */
async function mapInBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const part = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    out.push(...part);
  }
  return out;
}

/**
 * Faster view-oriented comment fetch: first page only.
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 */
async function githubListIssueCommentsFirstPage(owner, repo, issueNumber) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(issueNumber));
  const out = await githubRestJson("GET", `/repos/${o}/${r}/issues/${n}/comments?per_page=50&page=1`);
  return Array.isArray(out) ? out : [];
}

/**
 * Faster view-oriented review comment fetch: first page only.
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 */
async function githubListPullReviewCommentsFirstPage(owner, repo, pullNumber) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(pullNumber));
  const out = await githubRestJson("GET", `/repos/${o}/${r}/pulls/${n}/comments?per_page=50&page=1`);
  return Array.isArray(out) ? out : [];
}

/**
 * Pull reviews first page (for approval/changes requested signal in TUI).
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 */
async function githubListPullReviewsFirstPage(owner, repo, pullNumber) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(pullNumber));
  const out = await githubRestJson("GET", `/repos/${o}/${r}/pulls/${n}/reviews?per_page=50&page=1`);
  return Array.isArray(out) ? out : [];
}

/**
 * Reduce reviews to a single state for UI badges.
 * @param {unknown[]} reviews
 */
function summarizeReviewState(reviews) {
  /** @type {Map<string, string>} */
  const byUser = new Map();
  for (const rv of reviews) {
    if (!rv || typeof rv !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (rv);
    const user = r.user && typeof r.user === "object" ? /** @type {Record<string, unknown>} */ (r.user) : {};
    const login = typeof user.login === "string" ? user.login : "";
    const state = typeof r.state === "string" ? r.state.toUpperCase() : "";
    if (!login || !state) continue;
    byUser.set(login, state);
  }
  const states = [...byUser.values()];
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (states.includes("APPROVED")) return "approved";
  if (states.includes("COMMENTED")) return "commented";
  return "none";
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {Array<{ pr_number: number, position: number, head_branch?: string, base_branch?: string }>} prEntries
 * @param {number} [concurrency]
 */
export async function fetchStackPrDetails(owner, repo, prEntries, concurrency = 6) {
  const sorted = [...prEntries].sort((a, b) => a.position - b.position);
  return mapInBatches(sorted, concurrency, async (entry) => {
    const n = entry.pr_number;
    try {
      const pull = await githubGetPull(owner, repo, n);
      const [issueRes, reviewRes, filesRes, reviewsRes] = await Promise.allSettled([
        githubListIssueCommentsFirstPage(owner, repo, n),
        githubListPullReviewCommentsFirstPage(owner, repo, n),
        githubListPullFiles(owner, repo, n),
        githubListPullReviewsFirstPage(owner, repo, n)
      ]);
      const issueComments = issueRes.status === "fulfilled" ? issueRes.value : [];
      const reviewComments = reviewRes.status === "fulfilled" ? reviewRes.value : [];
      const files = filesRes.status === "fulfilled" ? filesRes.value : [];
      const reviews = reviewsRes.status === "fulfilled" ? reviewsRes.value : [];
      return {
        entry,
        pull,
        issueComments,
        reviewComments,
        files: Array.isArray(files) ? files : [],
        reviewSummary: summarizeReviewState(reviews),
        error: null
      };
    } catch (e) {
      return {
        entry,
        pull: null,
        issueComments: [],
        reviewComments: [],
        files: [],
        reviewSummary: "none",
        error: String(/** @type {Error} */ (e).message || e)
      };
    }
  });
}
