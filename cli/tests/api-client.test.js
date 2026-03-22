import { describe, it, expect } from "vitest";
import { withAuthHeaders } from "../src/api-client.js";

describe("api client", () => {
  it("does not inject auth header when token missing", () => {
    const oldToken = process.env.STACKPR_USER_TOKEN;
    delete process.env.STACKPR_USER_TOKEN;
    const headers = withAuthHeaders({ "X-Test": "1" });
    expect(headers.Authorization).toBeUndefined();
    process.env.STACKPR_USER_TOKEN = oldToken;
  });

  it("injects auth header when token exists", () => {
    const oldToken = process.env.STACKPR_USER_TOKEN;
    process.env.STACKPR_USER_TOKEN = "abc";
    const headers = withAuthHeaders({ "X-Test": "1" });
    expect(headers.Authorization).toBe("Bearer abc");
    process.env.STACKPR_USER_TOKEN = oldToken;
  });
});
