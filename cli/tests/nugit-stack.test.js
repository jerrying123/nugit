import { describe, it, expect } from "vitest";
import {
  validateStackDoc,
  createInitialStackDoc,
  parseRepoFullName,
  parseStackAddPrNumbers
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

  it("parseStackAddPrNumbers: single, multiple, comma, duplicate", () => {
    expect(parseStackAddPrNumbers(["9"])).toEqual([9]);
    expect(parseStackAddPrNumbers(["7", "8", "9"])).toEqual([7, 8, 9]);
    expect(parseStackAddPrNumbers(["7,8", "9"])).toEqual([7, 8, 9]);
    expect(parseStackAddPrNumbers("12")).toEqual([12]);
    expect(() => parseStackAddPrNumbers([])).toThrow(/at least one PR/);
    expect(() => parseStackAddPrNumbers(["1", "1"])).toThrow(/Duplicate PR #1/);
    expect(() => parseStackAddPrNumbers(["0"])).toThrow(/Invalid PR/);
  });
});
