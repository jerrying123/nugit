const API_BASE = process.env.STACKPR_API_BASE_URL || "http://localhost:3001/api";

function headers(token) {
  const base = { "Content-Type": "application/json" };
  if (token) {
    base.Authorization = `Bearer ${token}`;
  }
  return base;
}

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(token), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `HTTP ${response.status}`);
  }
  return data;
}

async function startDeviceLogin() {
  return request("/auth/device/start");
}

async function listMyPrs(token) {
  return request("/account/pulls", token);
}

/**
 * Stack for a PR from `.nugit/stack.json` on GitHub (via API).
 * @param {string} ref optional git ref
 */
async function fetchStackForPr(token, owner, repo, prNumber, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return request(`/repos/${owner}/${repo}/pr/${prNumber}/stack${q}`, token);
}

module.exports = {
  startDeviceLogin,
  listMyPrs,
  fetchStackForPr
};
