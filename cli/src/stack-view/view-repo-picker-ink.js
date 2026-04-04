import React, { useState } from "react";
import { Box, Text, useApp, useInput, render } from "ink";
import chalk from "chalk";
import { getRepoMetadata, searchRepositories } from "../api-client.js";
import { getRepoFullNameFromGitRoot } from "../git-info.js";
import { findGitRoot, parseRepoFullName } from "../nugit-stack.js";

/**
 * @typedef {{ repo: string, ref: string }} PickedRepoRef
 */

/**
 * Ink TUI: pick owner/repo; ref is the GitHub default branch unless you use CLI args.
 * @returns {Promise<PickedRepoRef>}
 */
export async function renderViewRepoPicker() {
  const exitPayload = /** @type {{ result: PickedRepoRef | null }} */ ({ result: null });
  const { waitUntilExit } = render(React.createElement(ViewRepoPickerApp, { exitPayload }));
  await waitUntilExit();
  if (!exitPayload.result) {
    throw new Error("Cancelled.");
  }
  return exitPayload.result;
}

/**
 * @param {{ exitPayload: { result: PickedRepoRef | null } }} props
 */
function ViewRepoPickerApp({ exitPayload }) {
  const { exit } = useApp();
  const root = findGitRoot();
  let cwdRepo = null;
  if (root) {
    try {
      cwdRepo = getRepoFullNameFromGitRoot(root);
    } catch {
      cwdRepo = null;
    }
  }

  /** @type {'home' | 'search' | 'results'} */
  const [step, setStep] = useState("home");
  const [searchLine, setSearchLine] = useState("");
  const [err, setErr] = useState(/** @type {string | null} */ (null));
  const [loading, setLoading] = useState(false);
  /** @type {{ full_name: string, description?: string }[]} */
  const [hits, setHits] = useState([]);
  const [cursor, setCursor] = useState(0);

  const finishWith = async (repoFull) => {
    setLoading(true);
    setErr(null);
    try {
      const { owner, repo } = parseRepoFullName(repoFull);
      const meta = await getRepoMetadata(owner, repo);
      const ref = meta.default_branch || "main";
      exitPayload.result = { repo: repoFull, ref };
      exit();
    } catch (e) {
      setErr(String(/** @type {{ message?: string }} */ (e)?.message || e));
      setLoading(false);
    }
  };

  const currentHit = hits.length ? hits[Math.min(cursor, hits.length - 1)] : null;

  useInput((input, key) => {
    if (loading) return;
    if (key.escape || input === "q") {
      exitPayload.result = null;
      exit();
      return;
    }

    if (step === "home") {
      if (input === "c" && cwdRepo) {
        void finishWith(cwdRepo);
        return;
      }
      if (input === "s" || input === "/") {
        setStep("search");
        setSearchLine("");
        setErr(null);
      }
      return;
    }

    if (step === "search") {
      if (key.return) {
        const q = searchLine.trim();
        if (!q) {
          setErr("Enter a search query (e.g. user:octocat or a project name).");
          return;
        }
        setLoading(true);
        setErr(null);
        searchRepositories(q, 15, 1)
          .then((data) => {
            const items = Array.isArray(data.items) ? data.items : [];
            const mapped = items
              .map((it) =>
                it && typeof it === "object" && typeof it.full_name === "string"
                  ? { full_name: it.full_name, description: String(it.description || "").slice(0, 72) }
                  : null
              )
              .filter(Boolean);
            setHits(/** @type {{ full_name: string, description?: string }[]} */ (mapped));
            setCursor(0);
            setStep("results");
            if (!mapped.length) {
              setErr("No repositories matched.");
            }
          })
          .catch((e) => {
            setErr(String(e?.message || e));
            setStep("search");
          })
          .finally(() => setLoading(false));
        return;
      }
      if (key.backspace || key.delete) {
        setSearchLine((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchLine((s) => s + input);
      }
      return;
    }

    if (step === "results") {
      if (input === "j" || key.downArrow) {
        setCursor((c) => Math.min(c + 1, Math.max(0, hits.length - 1)));
        return;
      }
      if (input === "k" || key.upArrow) {
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }
      if (key.return && currentHit) {
        void finishWith(currentHit.full_name);
        return;
      }
      if (input === "b") {
        setStep("search");
        setErr(null);
      }
    }
  });

  if (step === "home") {
    return React.createElement(
      Box,
      { flexDirection: "column", padding: 1 },
      React.createElement(Text, { color: "cyan", bold: true }, "nugit view — choose repository"),
      cwdRepo
        ? React.createElement(Text, null, chalk.dim("[c] "), `This directory: ${chalk.bold(cwdRepo)}`)
        : React.createElement(Text, { dimColor: true }, "(no github.com remote here — [c] unavailable)"),
      React.createElement(Text, null, chalk.dim("[s] or [/] "), "Search GitHub by user, name, or query"),
      React.createElement(Text, { dimColor: true }, "[q] quit"),
      err ? React.createElement(Text, { color: "red" }, err) : null,
      loading ? React.createElement(Text, null, chalk.yellow("Loading…")) : null
    );
  }

  if (step === "search") {
    return React.createElement(
      Box,
      { flexDirection: "column", padding: 1 },
      React.createElement(Text, { color: "cyan", bold: true }, "Search repositories"),
      React.createElement(Text, { dimColor: true }, "Enter = search · Esc = cancel"),
      React.createElement(Text, null, chalk.bold("> "), searchLine || chalk.dim("(query)")),
      err ? React.createElement(Text, { color: "red" }, err) : null,
      loading ? React.createElement(Text, null, chalk.yellow("Searching…")) : null
    );
  }

  return React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    React.createElement(Text, { color: "cyan", bold: true }, "Results — j/k · Enter open · b back"),
    ...hits.slice(0, 14).map((h, i) =>
      React.createElement(
        Text,
        { key: h.full_name },
        `${i === cursor ? "▶ " : "  "}${h.full_name} ${chalk.dim(h.description || "")}`
      )
    ),
    hits.length > 14 ? React.createElement(Text, { dimColor: true }, "…") : null,
    err && !hits.length ? React.createElement(Text, { color: "yellow" }, err) : null,
    loading ? React.createElement(Text, null, chalk.yellow("Opening…")) : null
  );
}
