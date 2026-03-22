import { spawn } from "child_process";

/**
 * Open a URL in the default browser (best-effort; no-op failure is ok for headless).
 * @param {string} url
 */
export function openInBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    const c = spawn("open", [url], { detached: true, stdio: "ignore" });
    c.unref();
    return;
  }
  if (platform === "win32") {
    const c = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
    c.unref();
    return;
  }
  const c = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  c.unref();
}
