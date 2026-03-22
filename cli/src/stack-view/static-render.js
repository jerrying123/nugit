import boxen from "boxen";
import chalk from "chalk";

/**
 * @param {string} state
 * @param {boolean} draft
 */
function stateLabel(state, draft) {
  if (draft) {
    return chalk.gray("draft");
  }
  if (state === "closed") {
    return chalk.red("closed");
  }
  if (state === "merged" || state === "MERGED") {
    return chalk.magenta("merged");
  }
  return chalk.green("open");
}

/** @param {unknown[]} rows stack rows from fetchStackPrDetails */
export function renderStaticStackView(rows) {
  const lines = [];
  lines.push(chalk.bold.cyan("nugit stack (bottom → top)"));
  lines.push("");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const e = r.entry;
    const isLast = i === rows.length - 1;
    const prefix = isLast ? "└─" : "├─";
    const next = isLast ? " " : "│";

    if (r.error) {
      lines.push(
        `${chalk.dim(next)} ${prefix} ${chalk.yellow("PR #" + e.pr_number)} ${chalk.red(r.error)}`
      );
      continue;
    }
    const p = r.pull;
    const title = p?.title || "(no title)";
    const head = p?.head?.ref || e.head_branch || "?";
    const base = p?.base?.ref || e.base_branch || "?";
    const st = stateLabel(p?.state || "open", !!p?.draft);
    const ic = r.issueComments?.length ?? 0;
    const rc = r.reviewComments?.length ?? 0;

    lines.push(
      `${chalk.dim(next)} ${prefix} ${chalk.bold(`PR #${e.pr_number}`)} ${st}  ${chalk.dim(head + " ← " + base)}`
    );
    lines.push(`${chalk.dim(next)} ${isLast ? " " : "│"}  ${title}`);
    lines.push(
      `${chalk.dim(next)} ${isLast ? " " : "│"}  ${chalk.dim("conversation:")} ${ic}  ${chalk.dim("review (line):")} ${rc}`
    );
    if (p?.html_url) {
      lines.push(`${chalk.dim(next)} ${isLast ? " " : "│"}  ${chalk.blue.underline(p.html_url)}`);
    }
    if (!isLast) {
      lines.push(`${chalk.dim(next)} ${chalk.dim("│")}`);
    }
  }

  console.log(
    boxen(lines.join("\n"), {
      padding: 1,
      margin: { top: 0, right: 0, bottom: 1, left: 0 },
      borderStyle: "round",
      borderColor: "cyan"
    })
  );

  for (const r of rows) {
    if (r.error || !r.pull) {
      continue;
    }
    const n = r.entry.pr_number;
    const reviewWithLines = (r.reviewComments || []).filter(
      (c) => c && (c.line != null || c.original_line != null)
    );
    if (reviewWithLines.length === 0) {
      continue;
    }
    console.log(chalk.bold(`PR #${n} — line-linked review comments`));
    for (const c of reviewWithLines.slice(0, 20)) {
      const path = c.path || "?";
      const line = c.line ?? c.original_line ?? "?";
      const url = c.html_url || "";
      const body = (c.body || "").split("\n")[0].slice(0, 72);
      console.log(
        `  ${chalk.dim(path + ":" + line)} ${body}${url ? " " + chalk.blue.underline(url) : ""}`
      );
    }
    if (reviewWithLines.length > 20) {
      console.log(chalk.dim(`  … +${reviewWithLines.length - 20} more`));
    }
    console.log("");
  }
}
