/**
 * Call GitHub's REST API directly (no StackPR/nugit FastAPI proxy).
 * Direct GitHub REST for the nugit CLI (PAT / OAuth token).
 */

import { resolveGithubToken } from "./auth-token.js";

const GITHUB_API_BASE = (
  process.env.GITHUB_API_URL || "https://api.github.com"
).replace(/\/$/, "");

export function getGithubPat() {
  return resolveGithubToken();
}

/** @deprecated All GitHub calls are direct; proxy env vars are ignored. */
export function useDirectGithub() {
  return true;
}

/**
 * @param {string} method
 * @param {string} path API path starting with /
 * @param {Record<string, unknown> | undefined} jsonBody
 * @param {string} [tokenOverride] PAT for this call only (e.g. `nugit auth pat --token`)
 */
export async function githubRestJson(method, path, jsonBody, tokenOverride) {
  const token = tokenOverride ?? getGithubPat();
  if (!token) {
    throw new Error(
      "Set NUGIT_USER_TOKEN or STACKPR_USER_TOKEN (GitHub PAT or OAuth token with repo scope)"
    );
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const msg =
      payload.message ||
      payload.detail ||
      `GitHub API ${response.status}: ${response.statusText}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(payload));
  }
  return payload;
}

export async function githubGetViewer() {
  return githubRestJson("GET", "/user");
}

/**
 * @param {string} owner
 * @param {string} repo
 */
export async function githubGetRepoMetadata(owner, repo) {
  return githubRestJson(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  );
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath e.g. ".nugit/stack.json"
 * @param {string} [ref]
 */
export async function githubGetContents(owner, repo, filePath, ref) {
  const pathSeg = filePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return githubRestJson(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSeg}${q}`
  );
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 */
export async function githubGetPull(owner, repo, number) {
  return githubRestJson(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`
  );
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {{ title: string, head: string, base: string, body?: string, draft?: boolean }} fields
 */
export async function githubCreatePullRequest(owner, repo, fields) {
  const payload = {
    title: fields.title,
    head: fields.head,
    base: fields.base,
    draft: !!fields.draft
  };
  if (fields.body) {
    payload.body = fields.body;
  }
  return githubRestJson(
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    payload
  );
}

/**
 * @param {number} page
 */
export async function githubListUserRepos(page = 1) {
  return githubRestJson(
    "GET",
    `/user/repos?page=${encodeURIComponent(String(page))}&per_page=30`
  );
}

/**
 * Search issues (includes PRs). `q` is GitHub search query syntax.
 * @param {string} q
 * @param {number} [perPage] max 100
 * @param {number} [page] 1-based
 */
export async function githubSearchIssues(q, perPage = 30, page = 1) {
  const pp = Math.min(100, Math.max(1, perPage));
  const p = Math.max(1, page);
  const query = new URLSearchParams({
    q,
    per_page: String(pp),
    page: String(p),
    sort: "updated",
    order: "desc"
  });
  return githubRestJson("GET", `/search/issues?${query.toString()}`);
}

/**
 * Open pull requests in a repository (paginated). Prefer this over search for “all open PRs”.
 * @param {string} owner
 * @param {string} repo
 * @param {number} [page] 1-based
 * @param {number} [perPage] max 100
 */
export async function githubListOpenPulls(owner, repo, page = 1, perPage = 30) {
  const pp = Math.min(100, Math.max(1, perPage));
  const p = Math.max(1, page);
  return githubRestJson(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&page=${p}&per_page=${pp}`
  );
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} path file path
 * @param {string} ref branch or sha
 */
export async function githubGetBlobText(owner, repo, path, ref) {
  const pathSeg = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const item = await githubRestJson(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSeg}?ref=${encodeURIComponent(ref)}`
  );
  if (!item || item.type !== "file" || item.encoding !== "base64" || !item.content) {
    return null;
  }
  return Buffer.from(String(item.content).replace(/\s/g, ""), "base64").toString("utf8");
}
