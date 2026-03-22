import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { withAuthHeaders } from "../src/api-client.js";

describe("api client", () => {
  it("does not inject auth header when token missing", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nugit-api-"));
    const oldN = process.env.NUGIT_USER_TOKEN;
    const oldS = process.env.STACKPR_USER_TOKEN;
    const oldXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.NUGIT_USER_TOKEN;
    delete process.env.STACKPR_USER_TOKEN;
    process.env.XDG_CONFIG_HOME = tmp;
    vi.resetModules();
    const { withAuthHeaders: withAuthFresh } = await import("../src/api-client.js");
    const headers = withAuthFresh({ "X-Test": "1" });
    expect(headers.Authorization).toBeUndefined();
    if (oldN !== undefined) {
      process.env.NUGIT_USER_TOKEN = oldN;
    } else {
      delete process.env.NUGIT_USER_TOKEN;
    }
    if (oldS !== undefined) {
      process.env.STACKPR_USER_TOKEN = oldS;
    } else {
      delete process.env.STACKPR_USER_TOKEN;
    }
    if (oldXdg !== undefined) {
      process.env.XDG_CONFIG_HOME = oldXdg;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
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
