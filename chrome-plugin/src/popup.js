const DEFAULT_API_BASE = "http://localhost:3001/api";
const STACKPR_OPT_IN_KEY = "stackprOptIn";
const STACKPR_TOKEN_KEY = "stackprUserToken";
const STACKPR_API_BASE_KEY = "stackprApiBase";

function setStatus(message) {
  const target = document.getElementById("status");
  if (!target) {
    return;
  }
  target.textContent = typeof message === "string" ? message : JSON.stringify(message, null, 2);
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

async function callApi(path, options = {}) {
  const storage = await getStorage([STACKPR_TOKEN_KEY, STACKPR_API_BASE_KEY]);
  const token = storage[STACKPR_TOKEN_KEY];
  const apiBase = (storage[STACKPR_API_BASE_KEY] || DEFAULT_API_BASE).replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || `HTTP ${response.status}`);
  }
  return payload;
}

async function initPopup() {
  const optInInput = document.getElementById("opt-in");
  const authButton = document.getElementById("auth-device");
  const savePatButton = document.getElementById("save-pat");
  const listPrsButton = document.getElementById("list-prs");
  const patInput = document.getElementById("pat-input");
  const apiBaseInput = document.getElementById("api-base");
  const saveApiBaseBtn = document.getElementById("save-api-base");

  const stored = await getStorage([STACKPR_OPT_IN_KEY, STACKPR_API_BASE_KEY]);
  optInInput.checked = Boolean(stored[STACKPR_OPT_IN_KEY]);
  if (apiBaseInput) {
    apiBaseInput.value = stored[STACKPR_API_BASE_KEY] || DEFAULT_API_BASE;
  }

  saveApiBaseBtn.addEventListener("click", async () => {
    const v = apiBaseInput.value.trim() || DEFAULT_API_BASE;
    await setStorage({ [STACKPR_API_BASE_KEY]: v });
    setStatus(`API base saved: ${v}\n(Add this host to extension host_permissions if requests fail.)`);
  });

  optInInput.addEventListener("change", async () => {
    await setStorage({ [STACKPR_OPT_IN_KEY]: optInInput.checked });
    setStatus(`Opt-in: ${optInInput.checked ? "enabled" : "disabled"}`);
  });

  authButton.addEventListener("click", async () => {
    try {
      const result = await callApi("/auth/device/start");
      setStatus(result);
      if (result.verification_uri && result.user_code) {
        chrome.tabs.create({
          url: `${result.verification_uri}?user_code=${encodeURIComponent(result.user_code)}`
        });
      }
    } catch (error) {
      setStatus(String(error));
    }
  });

  savePatButton.addEventListener("click", async () => {
    try {
      const token = patInput.value.trim();
      if (!token) {
        throw new Error("PAT is required");
      }
      const validated = await callApi("/auth/pat", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      const access = validated.access_token || token;
      await setStorage({ [STACKPR_TOKEN_KEY]: access });
      const me = await callApi("/auth/me");
      setStatus({ ok: true, me, note: "Token stored locally in the extension only." });
    } catch (error) {
      setStatus(String(error));
    }
  });

  listPrsButton.addEventListener("click", async () => {
    try {
      const pulls = await callApi("/account/pulls");
      setStatus({
        total_count: pulls.total_count,
        items: pulls.items.slice(0, 5)
      });
    } catch (error) {
      setStatus(String(error));
    }
  });
}

initPopup();
