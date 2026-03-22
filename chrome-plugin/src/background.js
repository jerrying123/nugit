const DEFAULT_API = "http://localhost:3001/api";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "stackprFetchStack") {
    return;
  }
  (async () => {
    try {
      const storage = await chrome.storage.local.get(["stackprUserToken", "stackprApiBase"]);
      const token = storage.stackprUserToken;
      const apiBase = (storage.stackprApiBase || DEFAULT_API).replace(/\/$/, "");
      if (!token) {
        sendResponse({ ok: false, error: "No token in extension storage" });
        return;
      }
      const { owner, repo, number, ref } = message;
      const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pr/${number}/stack${q}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        sendResponse({ ok: false, error: data.detail || r.statusText, status: r.status });
        return;
      }
      sendResponse({ ok: true, data });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
