import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import chalk from "chalk";

/**
 * @param {object} props
 * @param {string[]} props.files
 * @param {{ next: null | Record<string, unknown> }} props.exitPayload
 */
export function SplitInkApp({ files, exitPayload }) {
  const { exit } = useApp();
  const [fileIdx, setFileIdx] = useState(0);
  const [layerCount, setLayerCount] = useState(2);
  const [assign, setAssign] = useState(() => {
    /** @type {Record<string, number>} */
    const a = {};
    for (const f of files) {
      a[f] = 0;
    }
    return a;
  });

  const safeIdx = files.length ? Math.min(fileIdx, files.length - 1) : 0;
  const current = files[safeIdx] || "";

  const byLayer = useMemo(() => {
    /** @type {string[][]} */
    const buckets = Array.from({ length: layerCount }, () => []);
    for (const f of files) {
      const L = Math.min(layerCount - 1, Math.max(0, assign[f] ?? 0));
      buckets[L].push(f);
    }
    return buckets;
  }, [files, assign, layerCount]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exitPayload.next = { type: "cancel" };
      exit();
      return;
    }
    if (input === "c") {
      exitPayload.next = {
        type: "confirm",
        layerCount,
        assignment: { ...assign },
        byLayer
      };
      exit();
      return;
    }
    if (input === "j" || key.downArrow) {
      setFileIdx((i) => Math.min(i + 1, Math.max(0, files.length - 1)));
      return;
    }
    if (input === "k" || key.upArrow) {
      setFileIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (input === "+" || input === "=") {
      setLayerCount((n) => Math.min(9, n + 1));
      return;
    }
    if (input === "-") {
      setLayerCount((n) => Math.max(2, n - 1));
      return;
    }
    const d = Number.parseInt(input, 10);
    if (Number.isInteger(d) && d >= 0 && d < layerCount && current) {
      setAssign((prev) => ({ ...prev, [current]: d }));
    }
  });

  if (!files.length) {
    return React.createElement(Text, { color: "red" }, "No files to split.");
  }

  return React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    React.createElement(Text, { color: "cyan", bold: true }, "nugit split"),
    React.createElement(
      Text,
      { dimColor: true },
      `Layers: ${layerCount}  (+/-)  |  assign file to layer 0–${layerCount - 1} (digit)  |  c confirm  |  q cancel`
    ),
    React.createElement(Text, { marginTop: 1 }, chalk.bold("Files:")),
    ...files.slice(0, 18).map((f, i) =>
      React.createElement(
        Text,
        { key: f },
        `${i === safeIdx ? "▶" : " "} [L${assign[f] ?? 0}] ${f.slice(0, 72)}`
      )
    ),
    React.createElement(Text, { marginTop: 1, color: "magenta" }, "Preview by layer:"),
    ...byLayer.map((bucket, li) =>
      React.createElement(
        Text,
        { key: String(li) },
        chalk.yellow(`L${li}: `) + chalk.dim(bucket.join(", ").slice(0, 100) || "(empty)")
      )
    )
  );
}
