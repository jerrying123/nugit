import { describe, expect, it } from "vitest";
import {
  buildLayer,
  documentForHeadBranch,
  sortStackPrs
} from "../src/stack-propagate.js";
import { validateLayerShape } from "../src/nugit-stack.js";

const samplePrs = [
  {
    pr_number: 4,
    position: 0,
    head_branch: "test-stack0",
    base_branch: "main",
    status: "open"
  },
  {
    pr_number: 5,
    position: 1,
    head_branch: "test-stack1",
    base_branch: "test-stack0",
    status: "open"
  },
  {
    pr_number: 6,
    position: 2,
    head_branch: "test-stack2",
    base_branch: "test-stack1",
    status: "open"
  }
];

describe("sortStackPrs", () => {
  it("orders by position", () => {
    const shuffled = [samplePrs[2], samplePrs[0], samplePrs[1]];
    const s = sortStackPrs(shuffled);
    expect(s.map((p) => p.position)).toEqual([0, 1, 2]);
  });
});

const tip = { pr_number: 6, head_branch: "test-stack2" };

describe("buildLayer", () => {
  const sorted = sortStackPrs(samplePrs);

  it("bottom: below is branch main, above is stack_pr, tip is stack top", () => {
    const L = buildLayer(sorted, 0);
    expect(L.stack_size).toBe(3);
    expect(L.tip).toEqual(tip);
    expect(L.below).toEqual({ type: "branch", ref: "main" });
    expect(L.above).toEqual({
      type: "stack_pr",
      pr_number: 5,
      head_branch: "test-stack1"
    });
  });

  it("middle: below stack_pr, above stack_pr", () => {
    const L = buildLayer(sorted, 1);
    expect(L.tip).toEqual(tip);
    expect(L.below).toEqual({
      type: "stack_pr",
      pr_number: 4,
      head_branch: "test-stack0"
    });
    expect(L.above).toEqual({
      type: "stack_pr",
      pr_number: 6,
      head_branch: "test-stack2"
    });
  });

  it("top: below stack_pr, above null", () => {
    const L = buildLayer(sorted, 2);
    expect(L.tip).toEqual(tip);
    expect(L.below).toEqual({
      type: "stack_pr",
      pr_number: 5,
      head_branch: "test-stack1"
    });
    expect(L.above).toBeNull();
  });
});

describe("documentForHeadBranch + validateLayerShape", () => {
  it("produces valid prefix prs + layer for each position", () => {
    const doc = {
      version: 1,
      repo_full_name: "o/r",
      created_by: "u",
      prs: samplePrs,
      resolution_contexts: []
    };
    const sorted = sortStackPrs(samplePrs);
    const expectedLens = [1, 2, 3];
    for (let i = 0; i < 3; i++) {
      const pos = /** @type {const} */ ([0, 1, 2][i]);
      const out = documentForHeadBranch(doc, sorted, pos);
      validateLayerShape(out.layer, out.prs.length, out.prs);
      expect(out.layer.position).toBe(pos);
      expect(out.prs).toHaveLength(expectedLens[i]);
      expect(out.layer.stack_size).toBe(3);
      expect(out.layer.tip).toEqual(tip);
      if (pos === 0) {
        expect(out.prs.map((p) => p.pr_number)).toEqual([4]);
      }
      if (pos === 1) {
        expect(out.prs.map((p) => p.pr_number)).toEqual([4, 5]);
      }
    }
  });
});
