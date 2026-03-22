const STACKPR_OPT_IN_KEY = "stackprOptIn";

function parseGithubPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 4) return null;
  const [owner, repo, kind, numStr] = parts;
  if (kind !== "pull") return null;
  const number = Number(numStr);
  if (!Number.isFinite(number)) return null;
  return { owner, repo, number };
}

function renderPanel(payload) {
  const existing = document.getElementById("stackpr-panel");
  if (existing) existing.remove();
  const panel = document.createElement("div");
  panel.id = "stackpr-panel";
  panel.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:99999",
    "max-width:320px",
    "padding:10px 12px",
    "background:#111",
    "color:#fff",
    "border-radius:8px",
    "font-family:system-ui,sans-serif",
    "font-size:13px",
    "box-shadow:0 4px 12px rgba(0,0,0,0.4)"
  ].join(";");
  if (!payload?.ok) {
    panel.textContent = payload?.error || "StackPR: could not load stack";
    document.body.appendChild(panel);
    return;
  }
  const prs = payload.data?.prs || [];
  const lines = prs.map((p) => `#${p.pr_number} (${p.position})`).join("\n");
  panel.textContent = prs.length ? `Stack (${prs.length} PRs)\n${lines}` : "StackPR: empty stack";
  document.body.appendChild(panel);
}

chrome.storage.local.get([STACKPR_OPT_IN_KEY], (result) => {
  if (!result[STACKPR_OPT_IN_KEY]) return;
  const parsed = parseGithubPath(window.location.pathname);
  if (!parsed) return;
  chrome.runtime.sendMessage(
    {
      type: "stackprFetchStack",
      owner: parsed.owner,
      repo: parsed.repo,
      number: parsed.number
    },
    (response) => {
      if (chrome.runtime.lastError) {
        renderPanel({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      renderPanel(response);
    }
  );
});
