import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NUGIT_BUNDLED_GITHUB_OAUTH_CLIENT_ID, resolveGithubOAuthClientId } from "../src/github-oauth-client-id.js";

describe("resolveGithubOAuthClientId", () => {
  let old;

  beforeEach(() => {
    old = process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
  });

  afterEach(() => {
    if (old !== undefined) {
      process.env.GITHUB_OAUTH_CLIENT_ID = old;
    } else {
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
    }
  });

  it("returns bundled client id when env unset", () => {
    expect(resolveGithubOAuthClientId()).toBe(NUGIT_BUNDLED_GITHUB_OAUTH_CLIENT_ID);
    expect(NUGIT_BUNDLED_GITHUB_OAUTH_CLIENT_ID.length).toBeGreaterThan(0);
  });

  it("prefers GITHUB_OAUTH_CLIENT_ID when set", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "  custom-id  ";
    expect(resolveGithubOAuthClientId()).toBe("custom-id");
  });
});
