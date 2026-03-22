import { readStoredGithubToken } from "./token-store.js";

/**
 * PAT / OAuth token for GitHub API: env first, then saved device-flow file.
 * @returns {string}
 */
export function resolveGithubToken() {
  return (
    process.env.NUGIT_USER_TOKEN ||
    process.env.STACKPR_USER_TOKEN ||
    readStoredGithubToken() ||
    ""
  );
}
