import { describe, expect, it } from "vitest";
import { parseDotEnv, mergeNugitPath } from "../src/user-config.js";
import path from "path";

describe("parseDotEnv", () => {
  it("parses basic lines", () => {
    expect(
      parseDotEnv(`# hi
FOO=bar
EMPTY=
QUOTED="x y"
`)
    ).toEqual({ FOO: "bar", EMPTY: "", QUOTED: "x y" });
  });

  it("ignores invalid lines", () => {
    expect(parseDotEnv("noequals\nFOO=1")).toEqual({ FOO: "1" });
  });
});

describe("mergeNugitPath", () => {
  it("prepends scripts dir once", () => {
    const root = "/proj/nugit";
    const scripts = path.join(root, "scripts");
    const out = mergeNugitPath({ PATH: "/usr/bin" }, root);
    expect(out.PATH.startsWith(scripts + path.delimiter)).toBe(true);
    const again = mergeNugitPath(out, root);
    expect(again.PATH).toBe(out.PATH);
  });
});
