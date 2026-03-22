/**
 * Call GitHub's REST API directly (no StackPR/nugit FastAPI proxy).
 * Used by default so `nugit stack add`, `init`, `prs create`, etc. work offline from the backend.
 */

const GITHUB_API_BASE = (
  process.env.GITHUB_API_URL || "https://api.github.com"
).replace(/\/$/, "");

export function getGithubPat() {
  return process.env.NUGIT_USER_TOKEN || process.env.STACKPR_USER_TOKEN || "";
}

/**
 * When true (default), GitHub reads/writes use api.github.com with the PAT.
 * Set `NUGIT_GITHUB_VIA_STACKPR_API=1` to route through the FastAPI proxy instead.
 */
export function useDirectGithub() {
  return (
    process.env.NUGIT_GITHUB_VIA_STACKPR_API !== "1" &&
    process.env.NUGIT_USE_STACKPR_API !== "1"
  );
}

/**
 * @param {string} method
 * @param {string} path API path starting with /
 * @param {Record<string, unknown> | undefined} jsonBody
 */
export async function githubRestJson(method, path, jsonBody) {
  const token = getGithubPat();
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
