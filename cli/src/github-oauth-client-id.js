/**
 * Default GitHub OAuth App for `nugit auth login` (device flow).
 * Client IDs are public (not secrets). Override with env for a custom app or fork.
 */
export const NUGIT_BUNDLED_GITHUB_OAUTH_CLIENT_ID = "Ov23liMBQqJJvRNiO0qm";

/** @returns {string} */
export function resolveGithubOAuthClientId() {
  const fromEnv = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  return fromEnv || NUGIT_BUNDLED_GITHUB_OAUTH_CLIENT_ID;
}
