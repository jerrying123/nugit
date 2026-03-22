const API_BASE_URL = process.env.STACKPR_API_BASE_URL || "http://localhost:3001/api";
const USER_TOKEN_ENV = "STACKPR_USER_TOKEN";

export function getToken() {
  return process.env[USER_TOKEN_ENV] || "";
}

export function withAuthHeaders(headers = {}) {
  const token = getToken();
  if (!token) {
    return headers;
  }
  return { ...headers, Authorization: `Bearer ${token}` };
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: withAuthHeaders({
      "Content-Type": "application/json",
      ...(options.headers || {})
    })
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const detail = payload.detail || `Request failed with status ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return payload;
}

export async function startDeviceFlow() {
  return apiRequest("/auth/device/start", { method: "GET" });
}

export async function pollDeviceFlow(deviceCode) {
  return apiRequest("/auth/device/poll", {
    method: "POST",
    body: JSON.stringify({ device_code: deviceCode })
  });
}

export async function savePat(token) {
  return apiRequest("/auth/pat", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export async function listMyPulls() {
  return apiRequest("/account/pulls", { method: "GET" });
}

/** GET GitHub contents via API proxy (requires STACKPR_USER_TOKEN). */
export async function getGithubContents(owner, repo, filePath, ref) {
  const pathSeg = filePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  return apiRequest(`/github/repos/${o}/${r}/contents/${pathSeg}${q}`, {
    method: "GET"
  });
}

/** Decode GitHub API file item (base64) to UTF-8 string. */
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
  return apiRequest(`/github/repos/${owner}/${repo}/pulls/${number}`, { method: "GET" });
}

export async function listUserRepos(page = 1) {
  return apiRequest(`/github/user/repos?page=${page}&per_page=30`, { method: "GET" });
}
