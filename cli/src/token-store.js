import fs from "fs";
import path from "path";
import { getConfigDir } from "./user-config.js";

/** @returns {string} */
export function getGithubTokenPath() {
  return path.join(getConfigDir(), "github-token");
}

/** @returns {string} */
export function readStoredGithubToken() {
  const p = getGithubTokenPath();
  try {
    if (!fs.existsSync(p)) {
      return "";
    }
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return "";
  }
}

/** @param {string} token */
export function writeStoredGithubToken(token) {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = getGithubTokenPath();
  fs.writeFileSync(p, token, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* Windows or FS without chmod */
  }
}

export function clearStoredGithubToken() {
  const p = getGithubTokenPath();
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
}
