import { describe, it, expect } from "vitest";

describe("vscode plugin manifest", () => {
  it("loads package json commands", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    const commands = pkg.default.contributes.commands.map((item) => item.command);
    expect(commands).toContain("stackpr.login");
    expect(commands).toContain("stackpr.listMyPrs");
    expect(commands).toContain("stackpr.initStackFromPr");
    expect(commands).toContain("stackpr.showStack");
    expect(commands).toContain("stackpr.fetchRemoteStack");
    expect(commands).toContain("stackpr.savePat");
  });
});
