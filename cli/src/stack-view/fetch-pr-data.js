import { githubGetPull } from "../github-rest.js";
import {
  githubListIssueComments,
  githubListPullReviewComments
} from "../github-pr-social.js";

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
 * @param {string} owner
 * @param {string} repo
 * @param {Array<{ pr_number: number, position: number, head_branch?: string, base_branch?: string }>} prEntries
 * @param {number} [concurrency]
 */
export async function fetchStackPrDetails(owner, repo, prEntries, concurrency = 3) {
  const sorted = [...prEntries].sort((a, b) => a.position - b.position);
  return mapInBatches(sorted, concurrency, async (entry) => {
    const n = entry.pr_number;
    try {
      const [pull, issueComments, reviewComments] = await Promise.all([
        githubGetPull(owner, repo, n),
        githubListIssueComments(owner, repo, n),
        githubListPullReviewComments(owner, repo, n)
      ]);
      return {
        entry,
        pull,
        issueComments,
        reviewComments,
        error: null
      };
    } catch (e) {
      return {
        entry,
        pull: null,
        issueComments: [],
        reviewComments: [],
        error: String(/** @type {Error} */ (e).message || e)
      };
    }
  });
}
