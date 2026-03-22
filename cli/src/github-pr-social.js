/**
 * GitHub PR/issue comments and reviewers (REST). Uses direct API only.
 */

import { githubRestJson } from "./github-rest.js";

const PER_PAGE = 100;

/**
 * @param {string} pathNoQuery path starting with /repos/... without ?
 */
async function githubGetAllPages(pathNoQuery) {
  let page = 1;
  /** @type {unknown[]} */
  const out = [];
  while (true) {
    const q = `?per_page=${PER_PAGE}&page=${page}`;
    const chunk = await githubRestJson("GET", `${pathNoQuery}${q}`);
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }
    out.push(...chunk);
    if (chunk.length < PER_PAGE) {
      break;
    }
    page += 1;
  }
  return out;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber same as PR number on GitHub
 */
export async function githubListIssueComments(owner, repo, issueNumber) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(issueNumber));
  return githubGetAllPages(`/repos/${o}/${r}/issues/${n}/comments`);
}

/**
 * Pull review comments (line-linked).
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 */
export async function githubListPullReviewComments(owner, repo, pullNumber) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(pullNumber));
  return githubGetAllPages(`/repos/${o}/${r}/pulls/${n}/comments`);
}

/**
 * Single pull review comment by id (REST).
 * @param {string} owner
 * @param {string} repo
 * @param {number} commentId
 */
export async function githubGetPullReviewComment(owner, repo, commentId) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const id = encodeURIComponent(String(commentId));
  return githubRestJson("GET", `/repos/${o}/${r}/pulls/comments/${id}`);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} body
 */
export async function githubPostIssueComment(owner, repo, issueNumber, body) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(issueNumber));
  return githubRestJson("POST", `/repos/${o}/${r}/issues/${n}/comments`, { body });
}

/**
 * Reply in a review thread.
 * @param {string} owner
 * @param {string} repo
 * @param {number} commentId root review comment id
 * @param {string} body
 */
export async function githubPostPullReviewCommentReply(owner, repo, commentId, body) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const id = encodeURIComponent(String(commentId));
  return githubRestJson("POST", `/repos/${o}/${r}/pulls/comments/${id}/replies`, { body });
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {{ reviewers?: string[], team_reviewers?: string[] }} reviewers
 */
export async function githubPostRequestedReviewers(owner, repo, pullNumber, reviewers) {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const n = encodeURIComponent(String(pullNumber));
  const payload = {
    reviewers: reviewers.reviewers || [],
    team_reviewers: reviewers.team_reviewers || []
  };
  return githubRestJson(
    "POST",
    `/repos/${o}/${r}/pulls/${n}/requested_reviewers`,
    payload
  );
}
