/**
 * Direct GitHub REST (no local API). Same model as the nugit CLI.
 */

const GITHUB_API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

async function gh(method, path, token, body) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: headers(token),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new Error(data.message || `GitHub ${res.status}`);
  }
  return data;
}

async function githubGetViewer(token) {
  return gh("GET", "/user", token);
}

/**
 * @param {string} token
 * @param {{ repo?: string }} [opts]
 */
async function listMyPulls(token, opts = {}) {
  const me = await githubGetViewer(token);
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
  const query = new URLSearchParams({ q, per_page: "30", sort: "updated", order: "desc" });
  return gh("GET", `/search/issues?${query}`, token);
}

function decodeFileContent(item) {
  if (!item || item.type !== "file" || item.encoding !== "base64" || !item.content) {
    return null;
  }
  return Buffer.from(String(item.content).replace(/\s/g, ""), "base64").toString("utf8");
}

/**
 * Fetch .nugit/stack.json from GitHub.
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} [ref] branch or sha; if omitted uses default branch
 */
async function fetchStackJsonFromGithub(token, owner, repo, ref) {
  let r = ref;
  if (!r) {
    const meta = await gh("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
    r = meta.default_branch;
  }
  const pathSeg = [".nugit", "stack.json"].map(encodeURIComponent).join("/");
  const item = await gh(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSeg}?ref=${encodeURIComponent(r)}`,
    token
  );
  const text = decodeFileContent(item);
  if (!text) {
    throw new Error("Could not read .nugit/stack.json from GitHub");
  }
  return JSON.parse(text);
}

/**
 * GitHub OAuth device flow step 1 (needs GITHUB_OAUTH_CLIENT_ID in env for the extension host).
 */
async function startDeviceLogin() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Set GITHUB_OAUTH_CLIENT_ID in your environment, or use Nugit: Save PAT. Device flow requires an OAuth App client ID."
    );
  }
  const body = new URLSearchParams({
    client_id: clientId,
    scope: "repo read:user user:email"
  });
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "device code request failed");
  }
  return data;
}

module.exports = {
  githubGetViewer,
  listMyPulls,
  fetchStackJsonFromGithub,
  startDeviceLogin
};
