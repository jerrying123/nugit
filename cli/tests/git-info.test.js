import { describe, it, expect } from "vitest";
import { parseGithubRepoFromRemote } from "../src/git-info.js";

describe("git-info", () => {
  it("parses ssh remote", () => {
    expect(parseGithubRepoFromRemote("git@github.com:acme/cool-repo.git")).toBe("acme/cool-repo");
  });

  it("parses https remote", () => {
    expect(parseGithubRepoFromRemote("https://github.com/acme/cool-repo")).toBe("acme/cool-repo");
  });

  it("parses https with git suffix", () => {
    expect(parseGithubRepoFromRemote("https://github.com/acme/cool-repo.git/")).toBe("acme/cool-repo");
  });

  it("returns null for unknown", () => {
    expect(parseGithubRepoFromRemote("https://gitlab.com/a/b")).toBeNull();
  });
});
