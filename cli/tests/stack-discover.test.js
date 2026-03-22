import { describe, it, expect } from "vitest";
import { stackTipPrNumber, docRepoMatches } from "../src/stack-discover.js";

describe("stack-discover", () => {
  it("stackTipPrNumber uses layer.tip when present", () => {
    const doc = {
      prs: [{ pr_number: 1, position: 0 }],
      layer: { tip: { pr_number: 9, head_branch: "tip" } }
    };
    expect(stackTipPrNumber(doc)).toBe(9);
  });

  it("stackTipPrNumber falls back to top position", () => {
    const doc = {
      prs: [
        { pr_number: 3, position: 0 },
        { pr_number: 5, position: 1 }
      ]
    };
    expect(stackTipPrNumber(doc)).toBe(5);
  });

  it("docRepoMatches is case-insensitive", () => {
    expect(docRepoMatches({ repo_full_name: "Acme/App" }, "acme", "app")).toBe(true);
    expect(docRepoMatches({ repo_full_name: "other/repo" }, "acme", "app")).toBe(false);
  });
});
