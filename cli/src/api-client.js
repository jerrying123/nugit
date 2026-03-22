import {
  githubCreatePullRequest,
  githubGetContents,
  githubGetPull,
  githubGetRepoMetadata,
  githubGetViewer,
  githubListUserRepos,
  githubRestJson,
  githubSearchIssues,
  githubListOpenPulls
} from "./github-rest.js";
import {
  githubDeviceFlowPollAccessToken,
  githubDeviceFlowRequestCode
} from "./github-device-flow.js";
import { resolveGithubToken } from "./auth-token.js";

/** @returns {string} */
export function getToken() {
  return resolveGithubToken();
}

export function withAuthHeaders(headers = {}) {
  const token = getToken();
  if (!token) {
    return headers;
  }
  return { ...headers, Authorization: `Bearer ${token}` };
}

/**
 * Start GitHub OAuth device flow (requires GITHUB_OAUTH_CLIENT_ID).
 */
export async function startDeviceFlow() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Set GITHUB_OAUTH_CLIENT_ID to your GitHub OAuth App client ID (Settings → Developer settings → OAuth Apps), or use a PAT with NUGIT_USER_TOKEN."
    );
  }
  return githubDeviceFlowRequestCode(clientId, "repo read:user user:email");
}

/**
 * Single poll for device flow. Returns token, pending, or throws.
 * @param {string} deviceCode
 * @param {number} [intervalSeconds] minimum wait before next poll (from GitHub or prior slow_down)
 */
export async function pollDeviceFlow(deviceCode, intervalSeconds = 5) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error("Set GITHUB_OAUTH_CLIENT_ID");
  }
  const payload = await githubDeviceFlowPollAccessToken(clientId, deviceCode);
  if (payload.access_token) {
    return { access_token: payload.access_token, token_type: payload.token_type, scope: payload.scope };
  }
  if (payload.error === "authorization_pending") {
    return { pending: true, interval: Math.max(5, intervalSeconds) };
  }
  if (payload.error === "slow_down") {
    return { pending: true, interval: Math.max(5, intervalSeconds) + 5 };
  }
  const msg = payload.error_description || payload.error || "Device flow failed";
  throw new Error(typeof msg === "string" ? msg : JSON.stringify(payload));
}

/**
 * Poll until token or fatal error (for `nugit auth poll`).
 * @param {string} deviceCode
 * @param {number} [initialInterval] from `device_code` response `interval`
 */
export async function pollDeviceFlowUntilComplete(deviceCode, initialInterval = 5) {
  let wait = Math.max(5, initialInterval);
  for (;;) {
    const result = await pollDeviceFlow(deviceCode, wait);
    if (result.access_token) {
      return result;
    }
    if (result.pending) {
      wait = result.interval ?? wait;
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error("Unexpected device flow response");
  }
}

/**
 * Validate PAT via GitHub GET /user (server does not exist; token is not stored).
 * @param {string} token
 */
export async function savePat(token) {
  const user = await githubRestJson("GET", "/user", undefined, token);
  return { access_token: token, login: user.login, id: user.id, name: user.name };
}

/**
 * Open PRs authored by the current user (search API, paginated).
 * @param {{ repo?: string, page?: number, perPage?: number }} [opts]
 */
export async function listMyPulls(opts = {}) {
  const me = await githubGetViewer();
  const login = me.login;
  if (!login) {
    throw new Error("Could not resolve GitHub login");
  }
  let q = `is:pr is:open author:${login}`;
  if (opts.repo) {
    const parts = String(opts.repo).split("/").filter(Boolean);
    if (parts.length === 2) {
      q = `is:pr is:open repo:${parts[0]}/${parts[1]} author:${login}`;
    }
  }
  const page = opts.page != null ? Math.max(1, opts.page) : 1;
  const perPage = opts.perPage != null ? Math.min(100, Math.max(1, opts.perPage)) : 30;
  return githubSearchIssues(q, perPage, page);
}

/**
 * All open PRs in a repository (REST list, paginated). Best for picking numbers for `nugit stack add`.
 * @param {string} owner
 * @param {string} repo
 * @param {{ page?: number, perPage?: number }} [opts]
 */
export async function listOpenPullsInRepo(owner, repo, opts = {}) {
  const page = opts.page != null ? Math.max(1, opts.page) : 1;
  const perPage = opts.perPage != null ? Math.min(100, Math.max(1, opts.perPage)) : 30;
  const pulls = await githubListOpenPulls(owner, repo, page, perPage);
  const arr = Array.isArray(pulls) ? pulls : [];
  return {
    pulls: arr,
    page,
    per_page: perPage,
    repo_full_name: `${owner}/${repo}`,
    has_more: arr.length >= perPage
  };
}

export async function authMe() {
  return githubGetViewer();
}

export async function getRepoMetadata(owner, repo) {
  return githubGetRepoMetadata(owner, repo);
}

export async function createPullRequest(owner, repo, fields) {
  return githubCreatePullRequest(owner, repo, fields);
}

export async function getGithubContents(owner, repo, filePath, ref) {
  return githubGetContents(owner, repo, filePath, ref);
}

export function decodeGithubFileContent(item) {
  if (!item || item.type !== "file" || item.encoding !== "base64" || !item.content) {
    return null;
  }
  return Buffer.from(item.content.replace(/\s/g, ""), "base64").toString("utf8");
}

export async function fetchRemoteStackJson(repoFullName, ref) {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    throw new Error("repoFullName must be owner/repo");
  }
  const item = await getGithubContents(owner, repo, ".nugit/stack.json", ref);
  const text = decodeGithubFileContent(item);
  if (!text) {
    throw new Error("Could not read .nugit/stack.json from GitHub");
  }
  return JSON.parse(text);
}

export async function getPull(owner, repo, number) {
  return githubGetPull(owner, repo, number);
}

export async function listUserRepos(page = 1) {
  return githubListUserRepos(page);
}
