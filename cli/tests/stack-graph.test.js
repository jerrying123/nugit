import { describe, expect, it } from "vitest";
import { compileStackGraph } from "../src/stack-graph.js";

describe("compileStackGraph", () => {
  it("builds stack_above edges for ordered prs", () => {
    const g = compileStackGraph({
      repo_full_name: "o/r",
      stacks: [
        {
          tip_pr_number: 9,
          tip_head_branch: "tip",
          prs: [{ pr_number: 7 }, { pr_number: 8 }, { pr_number: 9 }]
        }
      ]
    });
    const kinds = g.edges.map((e) => e.kind);
    expect(kinds.filter((k) => k === "stack_above")).toHaveLength(2);
    expect(g.edges).toContainEqual({ from: "pr_7", to: "pr_8", kind: "stack_above" });
    expect(g.edges).toContainEqual({ from: "pr_8", to: "pr_9", kind: "stack_above" });
    const stackNode = g.nodes.find((n) => n.id === "stack_tip_9");
    expect(stackNode?.prs).toEqual([7, 8, 9]);
  });

  it("adds history nodes and parent edges", () => {
    const g = compileStackGraph(null, [
      { id: "a", action: "init", at: "t0" },
      { id: "b", action: "split", at: "t1", parent_record_id: "a" }
    ]);
    expect(g.nodes.some((n) => n.id === "hist_a")).toBe(true);
    expect(g.nodes.some((n) => n.id === "hist_b")).toBe(true);
    expect(g.edges).toContainEqual({ from: "hist_a", to: "hist_b", kind: "history_next" });
  });
});
