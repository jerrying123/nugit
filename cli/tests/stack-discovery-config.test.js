import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../src/user-config.js", () => ({
  readUserConfig: vi.fn(() => ({}))
}));

import { readUserConfig } from "../src/user-config.js";
import { getStackDiscoveryOpts, effectiveMaxOpenPrs } from "../src/stack-discovery-config.js";

describe("getStackDiscoveryOpts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(readUserConfig).mockReturnValue({});
  });

  it("defaults to eager with sane maxOpenPrs", () => {
    const o = getStackDiscoveryOpts();
    expect(o.mode).toBe("eager");
    expect(o.maxOpenPrs).toBeGreaterThan(0);
    expect(effectiveMaxOpenPrs(o, false)).toBe(o.maxOpenPrs);
  });

  it("uses env for mode", () => {
    vi.stubEnv("NUGIT_STACK_DISCOVERY_MODE", "lazy");
    const o = getStackDiscoveryOpts();
    expect(o.mode).toBe("lazy");
    expect(effectiveMaxOpenPrs(o, false)).toBeLessThanOrEqual(o.maxOpenPrs);
    expect(effectiveMaxOpenPrs(o, true)).toBe(o.maxOpenPrs);
  });

  it("cli overrides config file", () => {
    vi.mocked(readUserConfig).mockReturnValue({
      stackDiscovery: { mode: "eager", maxOpenPrs: 10 }
    });
    const o = getStackDiscoveryOpts({ mode: "manual" });
    expect(o.mode).toBe("manual");
  });

  it("effectiveMaxOpenPrs uses lazy first pass cap", () => {
    vi.mocked(readUserConfig).mockReturnValue({
      stackDiscovery: { mode: "lazy", maxOpenPrs: 200, lazyFirstPassMaxPrs: 30 }
    });
    const o = getStackDiscoveryOpts();
    expect(effectiveMaxOpenPrs(o, false)).toBe(30);
    expect(effectiveMaxOpenPrs(o, true)).toBe(200);
  });
});
