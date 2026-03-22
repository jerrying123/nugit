import { describe, it, expect } from "vitest";
import { withAuthHeaders } from "../src/api-client.js";

describe("api client", () => {
  it("does not inject auth header when token missing", () => {
    const oldN = process.env.NUGIT_USER_TOKEN;
    const oldS = process.env.STACKPR_USER_TOKEN;
    delete process.env.NUGIT_USER_TOKEN;
    delete process.env.STACKPR_USER_TOKEN;
    const headers = withAuthHeaders({ "X-Test": "1" });
    expect(headers.Authorization).toBeUndefined();
    if (oldN !== undefined) process.env.NUGIT_USER_TOKEN = oldN;
    if (oldS !== undefined) process.env.STACKPR_USER_TOKEN = oldS;
  });

  it("injects auth header when STACKPR_USER_TOKEN exists", () => {
    const oldN = process.env.NUGIT_USER_TOKEN;
    const oldS = process.env.STACKPR_USER_TOKEN;
    delete process.env.NUGIT_USER_TOKEN;
    process.env.STACKPR_USER_TOKEN = "abc";
    const headers = withAuthHeaders({ "X-Test": "1" });
    expect(headers.Authorization).toBe("Bearer abc");
    if (oldN !== undefined) process.env.NUGIT_USER_TOKEN = oldN;
    else delete process.env.NUGIT_USER_TOKEN;
    process.env.STACKPR_USER_TOKEN = oldS;
  });

  it("prefers NUGIT_USER_TOKEN over STACKPR_USER_TOKEN", () => {
    const oldN = process.env.NUGIT_USER_TOKEN;
    const oldS = process.env.STACKPR_USER_TOKEN;
    process.env.NUGIT_USER_TOKEN = "nugit-token";
    process.env.STACKPR_USER_TOKEN = "stackpr-token";
    const headers = withAuthHeaders({});
    expect(headers.Authorization).toBe("Bearer nugit-token");
    if (oldN !== undefined) process.env.NUGIT_USER_TOKEN = oldN;
    else delete process.env.NUGIT_USER_TOKEN;
    process.env.STACKPR_USER_TOKEN = oldS;
  });
});
