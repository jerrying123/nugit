import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  githubListIssueComments,
  githubPostIssueComment
} from "../src/github-pr-social.js";

describe("github-pr-social pagination", () => {
  const orig = globalThis.fetch;

  beforeEach(() => {
    process.env.NUGIT_USER_TOKEN = "test-token";
  });

  afterEach(() => {
    globalThis.fetch = orig;
    delete process.env.NUGIT_USER_TOKEN;
    vi.restoreAllMocks();
  });

  it("fetches multiple pages until short page", async () => {
    let page = 0;
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      expect(u).toContain("api.github.com");
      page += 1;
      const body =
        page === 1
          ? Array.from({ length: 100 }, (_, i) => ({ id: i, body: "x" }))
          : [{ id: 100, body: "last" }];
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const out = await githubListIssueComments("o", "r", 1);
    expect(out.length).toBe(101);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("post issue comment sends JSON body", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ body: "hello" });
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    });
    await githubPostIssueComment("o", "r", 5, "hello");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
