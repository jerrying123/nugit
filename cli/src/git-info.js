import { execSync } from "child_process";

/**
 * @param {string} gitRoot
 * @param {string} [remote]
 * @returns {string | null}
 */
export function getGitRemoteUrl(gitRoot, remote = "origin") {
  try {
    return execSync(`git remote get-url ${remote}`, {
      cwd: gitRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Parse owner/repo from common GitHub remote URL shapes.
 * @param {string | null | undefined} url
 * @returns {string | null} "owner/repo"
 */
export function parseGithubRepoFromRemote(url) {
  if (!url || typeof url !== "string") {
    return null;
  }
  const u = url.trim();
  let m = u.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (m) {
    return `${m[1]}/${m[2]}`;
  }
  m = u.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (m) {
    return `${m[1]}/${m[2]}`;
  }
  m = u.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (m) {
    return `${m[1]}/${m[2]}`;
  }
  return null;
}

/**
 * @param {string} gitRoot
 * @param {string} [remote]
 * @returns {string} owner/repo
 */
export function getRepoFullNameFromGitRoot(gitRoot, remote = "origin") {
  const url = getGitRemoteUrl(gitRoot, remote);
  const full = parseGithubRepoFromRemote(url);
  if (!full) {
    throw new Error(
      `Could not parse GitHub owner/repo from git remote "${remote}" URL: ${url || "(none)"}. ` +
        `Use --repo owner/repo or set origin to a github.com remote.`
    );
  }
  return full;
}
