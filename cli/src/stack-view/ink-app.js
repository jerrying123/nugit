import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { openUrl } from "./open-url.js";

/** @returns {{ next: null | Record<string, unknown> }} */
export function createExitPayload() {
  return { next: null };
}

/**
 * @param {object} props
 * @param {Awaited<ReturnType<import('./fetch-pr-data.js').fetchStackPrDetails>>} props.rows
 * @param {{ next: null | Record<string, unknown> }} props.exitPayload
 */
export function StackInkApp({ rows, exitPayload }) {
  const { exit } = useApp();
  const [prIndex, setPrIndex] = useState(0);
  const [tab, setTab] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);

  const len = rows?.length ?? 0;
  const safePr = len === 0 ? 0 : Math.min(prIndex, len - 1);
  const row = len ? rows[safePr] : null;
  const issueList = row?.issueComments || [];
  const reviewList = row?.reviewComments || [];

  const listLen = useMemo(() => {
    if (tab === 1) {
      return issueList.length;
    }
    if (tab === 2) {
      return reviewList.length;
    }
    return 0;
  }, [tab, issueList.length, reviewList.length]);

  const safeLine = Math.min(lineIndex, Math.max(0, listLen - 1));

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exitPayload.next = { type: "quit" };
      exit();
      return;
    }
    if (key.tab) {
      setTab((t) => (t + 1) % 3);
      setLineIndex(0);
      return;
    }
    if (input === "[") {
      setTab((t) => (t + 2) % 3);
      setLineIndex(0);
      return;
    }
    if (input === "]") {
      setTab((t) => (t + 1) % 3);
      setLineIndex(0);
      return;
    }

    if (input === "j" || key.downArrow) {
      if (tab === 0 && len > 0) {
        setPrIndex((i) => Math.min(i + 1, len - 1));
      } else {
        setLineIndex((i) => Math.min(i + 1, Math.max(0, listLen - 1)));
      }
      return;
    }
    if (input === "k" || key.upArrow) {
      if (tab === 0 && len > 0) {
        setPrIndex((i) => Math.max(i - 1, 0));
      } else {
        setLineIndex((i) => Math.max(i - 1, 0));
      }
      return;
    }

    if (input === "o" && row?.pull?.html_url) {
      openUrl(row.pull.html_url);
      return;
    }

    if (input === "l" && tab === 2) {
      const c = reviewList[safeLine];
      if (c?.html_url) {
        openUrl(c.html_url);
      }
      return;
    }

    if (input === "r" && row && !row.error) {
      exitPayload.next = {
        type: "issue_comment",
        prNumber: row.entry.pr_number
      };
      exit();
      return;
    }

    if (input === "R" && row && !row.error) {
      exitPayload.next = {
        type: "request_reviewers",
        prNumber: row.entry.pr_number
      };
      exit();
      return;
    }

    if (input === "t" && tab === 2 && row && !row.error) {
      const c = reviewList[safeLine];
      if (c?.id != null) {
        exitPayload.next = {
          type: "review_reply",
          commentId: c.id
        };
        exit();
      }
    }
  });

  if (len === 0) {
    return React.createElement(
      Box,
      { flexDirection: "column", padding: 1 },
      React.createElement(Text, { color: "red" }, "No PRs in stack."),
      React.createElement(Text, { dimColor: true }, "Press q to quit.")
    );
  }

  const ladder = rows.map((r, i) => {
    const mark = i === safePr ? "▶" : " ";
    const err = r.error ? ` ${r.error}` : "";
    const title = r.pull?.title || err || "(loading)";
    const num = r.entry.pr_number;
    const st = r.pull?.draft ? "draft" : r.pull?.state || "?";
    return `${mark} #${num} [${st}] ${title.slice(0, 56)}`;
  });

  const tabName = ["overview", "conversation", "review"][tab];
  let bodyLines = [];
  if (row?.error) {
    bodyLines = [row.error];
  } else if (tab === 0 && row?.pull) {
    const p = row.pull;
    bodyLines = [
      `Title: ${p.title || ""}`,
      `Head: ${p.head?.ref || ""}  Base: ${p.base?.ref || ""}`,
      `Comments: ${issueList.length} conv / ${reviewList.length} review (line)`
    ];
  } else if (tab === 1) {
    issueList.forEach((c, i) => {
      const mark = i === safeLine ? ">" : " ";
      const who = c.user?.login || "?";
      const one = (c.body || "").split("\n")[0].slice(0, 70);
      bodyLines.push(`${mark} @${who}: ${one}`);
    });
    if (bodyLines.length === 0) {
      bodyLines.push("(no issue comments)");
    }
  } else if (tab === 2) {
    reviewList.forEach((c, i) => {
      const mark = i === safeLine ? ">" : " ";
      const path = c.path || "?";
      const ln = c.line ?? c.original_line ?? "?";
      const one = (c.body || "").split("\n")[0].slice(0, 50);
      bodyLines.push(`${mark} ${path}:${ln} ${one}`);
    });
    if (bodyLines.length === 0) {
      bodyLines.push("(no review comments)");
    }
  }

  const help =
    "j/k PR or line | Tab/[] tabs | o open PR | l open line | r comment | R reviewers | t reply thread | q quit";

  return React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    React.createElement(Text, { color: "cyan", bold: true }, "nugit stack view"),
    React.createElement(Text, { dimColor: true }, ladder.join("\n")),
    React.createElement(Text, { color: "magenta" }, `Tab: ${tabName}`),
    React.createElement(
      Box,
      { marginTop: 1, flexDirection: "column" },
      ...bodyLines.slice(0, 14).map((line, idx) =>
        React.createElement(Text, { key: String(idx) }, line)
      )
    ),
    React.createElement(Text, { dimColor: true, marginTop: 1 }, help)
  );
}
