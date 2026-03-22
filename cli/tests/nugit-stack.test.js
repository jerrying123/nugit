import { describe, it, expect } from "vitest";
import {
  validateStackDoc,
  createInitialStackDoc,
  parseRepoFullName
} from "../src/nugit-stack.js";

describe("nugit-stack", () => {
  it("validates minimal doc", () => {
    const doc = createInitialStackDoc("o/r", "alice");
    expect(() => validateStackDoc(doc)).not.toThrow();
  });

  it("rejects duplicate pr numbers", () => {
    const doc = {
      version: 1,
      repo_full_name: "o/r",
      created_by: "a",
      prs: [
        { pr_number: 1, position: 0 },
        { pr_number: 1, position: 1 }
      ]
    };
    expect(() => validateStackDoc(doc)).toThrow(/duplicate pr_number/);
  });

  it("parseRepoFullName", () => {
    expect(parseRepoFullName("acme/app")).toEqual({ owner: "acme", repo: "app" });
    expect(() => parseRepoFullName("bad")).toThrow();
  });
});
