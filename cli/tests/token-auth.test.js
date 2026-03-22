import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

describe("getToken and github-token file", () => {
  let tmp;
  /** @type {string | undefined} */
  let oldXdg;
  /** @type {string | undefined} */
  let oldN;
  /** @type {string | undefined} */
  let oldS;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nugit-gt-"));
    oldXdg = process.env.XDG_CONFIG_HOME;
    oldN = process.env.NUGIT_USER_TOKEN;
    oldS = process.env.STACKPR_USER_TOKEN;
    process.env.XDG_CONFIG_HOME = tmp;
    delete process.env.NUGIT_USER_TOKEN;
    delete process.env.STACKPR_USER_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    if (oldXdg !== undefined) {
      process.env.XDG_CONFIG_HOME = oldXdg;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
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
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reads token from ~/.config/nugit/github-token when env unset", async () => {
    const nugitDir = path.join(tmp, "nugit");
    fs.mkdirSync(nugitDir, { recursive: true });
    fs.writeFileSync(path.join(nugitDir, "github-token"), "secret-from-file\n");
    const { getToken } = await import("../src/api-client.js");
    expect(getToken()).toBe("secret-from-file");
  });

  it("prefers NUGIT_USER_TOKEN over file", async () => {
    const nugitDir = path.join(tmp, "nugit");
    fs.mkdirSync(nugitDir, { recursive: true });
    fs.writeFileSync(path.join(nugitDir, "github-token"), "from-file");
    process.env.NUGIT_USER_TOKEN = "from-env";
    const { getToken } = await import("../src/api-client.js");
    expect(getToken()).toBe("from-env");
  });
});
