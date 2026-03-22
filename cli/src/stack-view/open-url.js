import { spawn } from "child_process";

/**
 * @param {string | undefined} href
 */
export function openUrl(href) {
  if (!href || typeof href !== "string") {
    return;
  }
  const plat = process.platform;
  if (plat === "darwin") {
    spawn("open", [href], { detached: true, stdio: "ignore" }).unref();
  } else if (plat === "win32") {
    spawn("cmd", ["/c", "start", "", href], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [href], { detached: true, stdio: "ignore" }).unref();
  }
}
