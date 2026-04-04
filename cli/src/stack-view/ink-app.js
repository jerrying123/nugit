import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import chalk from "chalk";
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
  const [fileIndex, setFileIndex] = useState(0);
  const [filePatchOffset, setFilePatchOffset] = useState(0);
  const [fileCommentIndex, setFileCommentIndex] = useState(0);

  const len = rows?.length ?? 0;
  const safePr = len === 0 ? 0 : Math.min(prIndex, len - 1);
  const row = len ? rows[safePr] : null;
  const issueList = row?.issueComments || [];
  const reviewList = row?.reviewComments || [];
  const fileList = row?.files || [];

  const listLen = useMemo(() => {
    if (tab === 1) {
      return issueList.length;
    }
    if (tab === 2) {
      return reviewList.length;
    }
    if (tab === 3) {
      return fileList.length;
    }
    return 0;
  }, [tab, issueList.length, reviewList.length, fileList.length]);

  const safeLine = Math.min(lineIndex, Math.max(0, listLen - 1));
  const safeFile = fileList.length === 0 ? 0 : Math.min(fileIndex, fileList.length - 1);
  const selectedFile = fileList[safeFile] || null;
  const patchLines =
    selectedFile && typeof selectedFile.patch === "string"
      ? String(selectedFile.patch).split("\n")
      : [];
  const patchPageSize = 12;
  const maxPatchOffset = Math.max(0, patchLines.length - patchPageSize);
  const fileComments = useMemo(() => {
    if (!selectedFile) return [];
    const fileName = String(selectedFile.filename || "");
    return reviewList.filter((c) => String(c?.path || "") === fileName);
  }, [selectedFile, reviewList]);
  const safeFileComment = fileComments.length
    ? Math.min(fileCommentIndex, fileComments.length - 1)
    : 0;

  /**
   * Best-effort patch scroll target for a code line.
   * @param {string[]} lines
   * @param {number} lineNo
   */
  const patchOffsetForLine = (lines, lineNo) => {
    if (!lineNo || !Number.isInteger(lineNo) || lineNo < 1) return 0;
    let newLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];
      if (t.startsWith("@@")) {
        const m = t.match(/\+(\d+)/);
        if (m) newLine = Number.parseInt(m[1], 10) - 1;
        continue;
      }
      if (t.startsWith("+") || t.startsWith(" ")) {
        newLine += 1;
      }
      if (newLine >= lineNo) {
        return Math.max(0, i - 2);
      }
    }
    return 0;
  };

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exitPayload.next = { type: "quit" };
      exit();
      return;
    }
    if (input === "u") {
      exitPayload.next = { type: "refresh" };
      exit();
      return;
    }
    if (key.tab) {
      setTab((t) => (t + 1) % 4);
      setLineIndex(0);
      setFilePatchOffset(0);
      setFileCommentIndex(0);
      return;
    }
    if (input === "[") {
      setTab((t) => (t + 3) % 4);
      setLineIndex(0);
      setFilePatchOffset(0);
      setFileCommentIndex(0);
      return;
    }
    if (input === "]") {
      setTab((t) => (t + 1) % 4);
      setLineIndex(0);
      setFilePatchOffset(0);
      setFileCommentIndex(0);
      return;
    }

    if (input === "j" || key.downArrow) {
      if (tab === 0 && len > 0) {
        setPrIndex((i) => Math.min(i + 1, len - 1));
      } else if (tab === 3) {
        setFilePatchOffset((i) => Math.min(i + 1, maxPatchOffset));
      } else {
        setLineIndex((i) => Math.min(i + 1, Math.max(0, listLen - 1)));
      }
      return;
    }
    if (input === "k" || key.upArrow) {
      if (tab === 0 && len > 0) {
        setPrIndex((i) => Math.max(i - 1, 0));
      } else if (tab === 3) {
        setFilePatchOffset((i) => Math.max(i - 1, 0));
      } else {
        setLineIndex((i) => Math.max(i - 1, 0));
      }
      return;
    }

    if (input === "o" && row && !row.error) {
      setTab(3);
      setFileIndex(0);
      setFilePatchOffset(0);
      setFileCommentIndex(0);
      return;
    }

    if (tab === 3 && input === "n") {
      setFileIndex((i) => Math.min(i + 1, Math.max(0, fileList.length - 1)));
      setFilePatchOffset(0);
      setFileCommentIndex(0);
      return;
    }
    if (tab === 3 && input === "p") {
      setFileIndex((i) => Math.max(i - 1, 0));
      setFilePatchOffset(0);
      setFileCommentIndex(0);
      return;
    }
    if (tab === 3 && input === "m" && fileComments.length) {
      setFileCommentIndex((i) => (i + 1) % fileComments.length);
      const c = fileComments[(safeFileComment + 1) % fileComments.length];
      const lineNo = c?.line ?? c?.original_line ?? 0;
      setFilePatchOffset(Math.min(maxPatchOffset, patchOffsetForLine(patchLines, Number(lineNo) || 0)));
      return;
    }
    if (tab === 3 && input === "M" && fileComments.length) {
      const next = (safeFileComment - 1 + fileComments.length) % fileComments.length;
      setFileCommentIndex(next);
      const c = fileComments[next];
      const lineNo = c?.line ?? c?.original_line ?? 0;
      setFilePatchOffset(Math.min(maxPatchOffset, patchOffsetForLine(patchLines, Number(lineNo) || 0)));
      return;
    }

    if (input === "l" && tab === 2) {
      const c = reviewList[safeLine];
      if (c?.html_url) {
        openUrl(c.html_url);
      }
      return;
    }
    if (input === "g" && tab === 2 && row && !row.error) {
      const c = reviewList[safeLine];
      const targetPath = String(c?.path || "");
      if (targetPath) {
        const idx = fileList.findIndex((f) => String(f?.filename || "") === targetPath);
        if (idx >= 0) {
          setTab(3);
          setFileIndex(idx);
          const selected = fileList[idx];
          const lines = typeof selected?.patch === "string" ? String(selected.patch).split("\n") : [];
          const lineNo = c?.line ?? c?.original_line ?? 0;
          const off = patchOffsetForLine(lines, Number(lineNo) || 0);
          setFilePatchOffset(off);
          const fcIdx = reviewList
            .filter((rc) => String(rc?.path || "") === targetPath)
            .findIndex((rc) => rc?.id === c?.id);
          setFileCommentIndex(fcIdx >= 0 ? fcIdx : 0);
        }
      }
      return;
    }

    if (input === "S" && tab === 0 && row && !row.error) {
      exitPayload.next = {
        type: "split",
        prNumber: row.entry.pr_number
      };
      exit();
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
    const reviewState = String(r.reviewSummary || "none");
    const badge =
      reviewState === "approved"
        ? chalk.green("A")
        : reviewState === "changes_requested"
          ? chalk.red("CR")
          : reviewState === "commented" || (r.reviewComments?.length || 0) > 0
            ? chalk.yellow("C")
            : chalk.dim("-");
    return `${mark} #${num} [${st}] ${badge} ${title.slice(0, 56)}`;
  });

  const tabName = ["overview", "conversation", "review", "files"][tab];
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
    const rs = String(row.reviewSummary || "none");
    bodyLines.push(
      `Review: ${
        rs === "approved"
          ? chalk.green("approved")
          : rs === "changes_requested"
            ? chalk.red("changes requested")
            : rs === "commented"
              ? chalk.yellow("commented")
              : chalk.dim("no review state")
      }`
    );
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
      bodyLines.push(chalk.dim("Tip: press g on a review comment to jump to file diff"));
    }
  } else if (tab === 3) {
    const start = Math.max(0, safeFile - 2);
    const end = Math.min(fileList.length, start + 5);
    for (let i = start; i < end; i++) {
      const f = fileList[i];
      const mark = i === safeFile ? ">" : " ";
      const name = String(f.filename || "?");
      const st = String(f.status || "?");
      const statusColor =
        st === "added"
          ? chalk.green
          : st === "removed"
            ? chalk.red
            : st === "renamed"
              ? chalk.yellow
              : chalk.cyan;
      const ch = `${chalk.green("+" + String(f.additions ?? 0))} ${chalk.red("-" + String(f.deletions ?? 0))}`;
      bodyLines.push(`${mark} ${statusColor(name)} ${chalk.dim("[" + st + "]")} ${ch}`);
    }
    if (fileList.length === 0) {
      bodyLines.push("(no changed files)");
    } else if (selectedFile) {
      bodyLines.push("");
      bodyLines.push(
        `${chalk.bold("Patch:")} ${String(selectedFile.filename || "?")} ` +
          chalk.dim(`(${filePatchOffset + 1}-${Math.min(filePatchOffset + patchPageSize, patchLines.length)} / ${patchLines.length || 0})`)
      );
      const patch = typeof selectedFile.patch === "string" ? selectedFile.patch : "";
      if (!patch) {
        bodyLines.push("(patch not available from GitHub API for this file)");
      } else {
        const page = patchLines.slice(filePatchOffset, filePatchOffset + patchPageSize);
        for (const p of page) {
          let line = p;
          if (line.startsWith("+++ ") || line.startsWith("--- ")) {
            line = chalk.bold(line);
          } else if (line.startsWith("@@")) {
            line = chalk.cyan(line);
          } else if (line.startsWith("+")) {
            line = chalk.green(line);
          } else if (line.startsWith("-")) {
            line = chalk.red(line);
          } else {
            line = chalk.dim(line);
          }
          bodyLines.push(line.slice(0, 130));
        }
        if (filePatchOffset + patchPageSize < patchLines.length) {
          bodyLines.push(chalk.dim("... more below (j/k scroll)"));
        }
      }
      if (fileComments.length) {
        bodyLines.push("");
        const c = fileComments[safeFileComment];
        bodyLines.push(
          `${chalk.bold("Comment")} ${safeFileComment + 1}/${fileComments.length} ` +
            chalk.dim(
              `line ${c?.line ?? c?.original_line ?? "?"} by @${c?.user?.login || "?"}`
            )
        );
        bodyLines.push(String(c?.body || "").split("\n")[0].slice(0, 100));
      }
    }
  }

  const selectedReview = tab === 2 ? reviewList[safeLine] : null;
  const helpParts = ["Tab/[] tabs", "o files view"];
  if (tab === 0 || tab === 1 || tab === 2) {
    helpParts.unshift("j/k PR or line");
  }
  if (tab === 3) {
    helpParts.unshift("j/k scroll patch", "n/p file", "m/M comment");
  }
  if (row && !row.error) {
    if (tab === 0) {
      helpParts.push("S split PR");
    }
    helpParts.push("r comment", "R Assign Reviewers");
  }
  if (tab === 2 && selectedReview?.html_url) {
    helpParts.push("l open line");
  }
  if (tab === 2 && selectedReview?.id != null && row && !row.error) {
    helpParts.push("t reply thread", "g jump to file");
  }
  helpParts.push("u refresh", "q quit");
  const help = helpParts.join(" | ");

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
