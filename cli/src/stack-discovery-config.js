import { readUserConfig } from "./user-config.js";

/**
 * @typedef {{
 *   mode: 'eager' | 'lazy' | 'manual',
 *   maxOpenPrs: number,
 *   fetchConcurrency: number,
 *   background: boolean,
 *   lazyFirstPassMaxPrs: number
 * }} StackDiscoveryResolved
 */

/**
 * Resolve stack discovery options from ~/.config/nugit/config.json and env.
 * Env overrides: NUGIT_STACK_DISCOVERY_MODE, NUGIT_STACK_DISCOVERY_MAX_OPEN_PRS, NUGIT_STACK_DISCOVERY_CONCURRENCY, NUGIT_STACK_DISCOVERY_BACKGROUND
 * @param {Partial<StackDiscoveryResolved>} [cliOverrides] CLI flags override file/env for that invocation
 * @returns {StackDiscoveryResolved}
 */
export function getStackDiscoveryOpts(cliOverrides = {}) {
  const cfg = readUserConfig();
  const sd =
    cfg.stackDiscovery && typeof cfg.stackDiscovery === "object"
      ? /** @type {Record<string, unknown>} */ (cfg.stackDiscovery)
      : {};

  const envMode = process.env.NUGIT_STACK_DISCOVERY_MODE;
  const modeRaw =
    cliOverrides.mode ??
    envMode ??
    (typeof sd.mode === "string" ? sd.mode : "eager");
  const mode =
    modeRaw === "lazy" || modeRaw === "manual" || modeRaw === "eager" ? modeRaw : "eager";

  const maxFromEnv = process.env.NUGIT_STACK_DISCOVERY_MAX_OPEN_PRS;
  const maxOpenPrs =
    cliOverrides.maxOpenPrs ??
    (maxFromEnv != null && maxFromEnv !== ""
      ? Number.parseInt(maxFromEnv, 10)
      : typeof sd.maxOpenPrs === "number"
        ? sd.maxOpenPrs
        : mode === "lazy"
          ? 100
          : 500);

  const concFromEnv = process.env.NUGIT_STACK_DISCOVERY_CONCURRENCY;
  const fetchConcurrency =
    cliOverrides.fetchConcurrency ??
    (concFromEnv != null && concFromEnv !== ""
      ? Number.parseInt(concFromEnv, 10)
      : typeof sd.fetchConcurrency === "number"
        ? sd.fetchConcurrency
        : 8);

  const bgEnv = process.env.NUGIT_STACK_DISCOVERY_BACKGROUND;
  const background =
    cliOverrides.background ??
    (bgEnv === "1" || bgEnv === "true"
      ? true
      : bgEnv === "0" || bgEnv === "false"
        ? false
        : typeof sd.background === "boolean"
          ? sd.background
          : false);

  const lazyFirst =
    typeof sd.lazyFirstPassMaxPrs === "number" ? sd.lazyFirstPassMaxPrs : Math.min(50, maxOpenPrs || 50);

  return {
    mode,
    maxOpenPrs: Number.isFinite(maxOpenPrs) && maxOpenPrs >= 0 ? maxOpenPrs : 500,
    fetchConcurrency: Math.max(1, Math.min(32, Number.isFinite(fetchConcurrency) ? fetchConcurrency : 8)),
    background,
    lazyFirstPassMaxPrs: Math.max(1, lazyFirst)
  };
}

/**
 * For lazy mode: first pass cap (smaller scan before optional full refresh).
 * @param {StackDiscoveryResolved} opts
 * @param {boolean} full If true, use maxOpenPrs
 * @returns {number}
 */
export function effectiveMaxOpenPrs(opts, full) {
  if (full || opts.mode === "eager") {
    return opts.maxOpenPrs;
  }
  if (opts.mode === "manual") {
    return opts.maxOpenPrs;
  }
  return Math.min(opts.lazyFirstPassMaxPrs, opts.maxOpenPrs || 100);
}
