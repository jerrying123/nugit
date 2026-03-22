import chalk from "chalk";
import boxen from "boxen";

/**
 * @param {unknown} data
 */
export function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * @param {unknown} data
 * @param {boolean} asJson
 */
export function out(data, asJson) {
  if (asJson) {
    printJson(data);
  }
}

/** @param {Record<string, unknown>} me */
export function formatWhoamiHuman(me) {
  const login = me.login ?? "?";
  const name = me.name ? ` (${me.name})` : "";
  const id = me.id != null ? chalk.dim(` id ${me.id}`) : "";
  return `${chalk.bold(login)}${name}${id}`;
}

/**
 * @param {{ total_count?: number, items?: unknown[] }} search
 * @param {{ page?: number, perPage?: number }} [pag]
 */
export function formatPrSearchHuman(search, pag) {
  const items = Array.isArray(search.items) ? search.items : [];
  const lines = [];
  const page = pag?.page ?? 1;
  const perPage = pag?.perPage ?? 30;
  const total = search.total_count;
  lines.push(
    chalk.bold.cyan(
      `Open PRs you authored (page ${page}, ${items.length} on this page${total != null ? ` · ${total} total` : ""})`
    )
  );
  lines.push("");
  for (const it of items) {
    const o = it && typeof it === "object" ? /** @type {Record<string, unknown>} */ (it) : {};
    const num = o.number;
    const title = String(o.title || "");
    const html = o.html_url ? String(o.html_url) : "";
    const repo = o.repository_url ? String(o.repository_url).replace("https://api.github.com/repos/", "") : "";
    lines.push(
      `  ${chalk.bold("#" + num)}  ${chalk.dim(repo)}  ${title.slice(0, 72)}${title.length > 72 ? "…" : ""}`
    );
    if (html) {
      lines.push(`       ${chalk.blue.underline(html)}`);
    }
  }
  const mayHaveMore =
    total != null ? page * perPage < total : items.length >= perPage;
  if (mayHaveMore && items.length > 0) {
    lines.push("");
    lines.push(chalk.dim(`Next page: ${chalk.bold(`nugit prs list --mine --page ${page + 1}`)}`));
  }
  lines.push("");
  lines.push(chalk.dim("Use PR # with: nugit stack add --pr <n> [more #…] (bottom → top)"));
  return lines.join("\n");
}

/**
 * @param {{ pulls: unknown[], page: number, per_page: number, repo_full_name: string, has_more: boolean }} payload
 */
export function formatOpenPullsHuman(payload) {
  const pulls = Array.isArray(payload.pulls) ? payload.pulls : [];
  const lines = [];
  lines.push(
    chalk.bold.cyan(
      `Open PRs in ${payload.repo_full_name} (page ${payload.page}, ${pulls.length} shown, ${payload.per_page}/page)`
    )
  );
  lines.push("");
  for (const pr of pulls) {
    const p = pr && typeof pr === "object" ? /** @type {Record<string, unknown>} */ (pr) : {};
    const head = p.head && typeof p.head === "object" ? /** @type {{ ref?: string }} */ (p.head) : {};
    const base = p.base && typeof p.base === "object" ? /** @type {{ ref?: string }} */ (p.base) : {};
    const user = p.user && typeof p.user === "object" ? /** @type {{ login?: string }} */ (p.user) : {};
    const num = p.number;
    const title = String(p.title || "");
    const branch = `${head.ref || "?"} ← ${base.ref || "?"}`;
    lines.push(
      `  ${chalk.bold("#" + num)}  ${chalk.dim(branch)}  ${chalk.dim(user.login || "")}  ${title.slice(0, 56)}${title.length > 56 ? "…" : ""}`
    );
    if (p.html_url) {
      lines.push(`       ${chalk.blue.underline(String(p.html_url))}`);
    }
  }
  if (pulls.length === 0) {
    lines.push(chalk.dim("  (no open PRs on this page)"));
  }
  if (payload.has_more) {
    lines.push("");
    lines.push(chalk.dim(`Next page: ${chalk.bold(`nugit prs list --page ${payload.page + 1}`)}`));
  }
  lines.push("");
  const nums = pulls.map((pr) => (/** @type {{ number?: number }} */ (pr).number)).filter((n) => n != null);
  if (nums.length) {
    lines.push(chalk.dim(`Stack (bottom→top): ${chalk.bold(`nugit stack add --pr ${nums.join(" ")}`)}`));
  }
  return boxen(lines.join("\n"), { padding: 1, borderStyle: "round", borderColor: "cyan" });
}

/**
 * @param {Record<string, unknown>} doc
 */
export function formatStackDocHuman(doc) {
  const prs = Array.isArray(doc.prs) ? doc.prs : [];
  const sorted = [...prs].sort(
    (a, b) =>
      (/** @type {{ position?: number }} */ (a).position ?? 0) -
      (/** @type {{ position?: number }} */ (b).position ?? 0)
  );
  const lines = [];
  lines.push(chalk.bold.cyan(".nugit/stack.json"));
  lines.push(chalk.dim(`repo ${doc.repo_full_name} · by ${doc.created_by}`));
  lines.push("");
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const e = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
    lines.push(`  ${chalk.bold("#" + e.pr_number)}  pos ${e.position}  ${e.head_branch || ""} ← ${e.base_branch || ""}`);
  }
  if (sorted.length === 0) {
    lines.push(chalk.dim("  (no PRs — use nugit stack add)"));
  }
  return boxen(lines.join("\n"), { padding: 1, borderStyle: "round", borderColor: "cyan" });
}

/**
 * @param {Record<string, unknown>} doc
 * @param {Array<Record<string, unknown>>} enrichedPrs
 */
export function formatStackEnrichHuman(doc, enrichedPrs) {
  const lines = [];
  lines.push(chalk.bold.cyan("Stack (with GitHub titles)"));
  lines.push(chalk.dim(String(doc.repo_full_name)));
  lines.push("");
  for (const row of enrichedPrs) {
    const err = row.error;
    if (err) {
      lines.push(`  ${chalk.yellow("PR #" + row.pr_number)}  ${chalk.red(String(err))}`);
      continue;
    }
    const title = String(row.title || "");
    const url = row.html_url ? String(row.html_url) : "";
    lines.push(`  ${chalk.bold("PR #" + row.pr_number)}  ${title}`);
    if (url) {
      lines.push(`       ${chalk.blue.underline(url)}`);
    }
  }
  return boxen(lines.join("\n"), { padding: 1, borderStyle: "round", borderColor: "cyan" });
}

/**
 * @param {{
 *   repo_full_name: string,
 *   scanned_open_prs: number,
 *   open_prs_truncated: boolean,
 *   stacks_found: number,
 *   stacks: Array<{
 *     tip_pr_number: number,
 *     created_by: string,
 *     pr_count: number,
 *     prs: Array<{ pr_number: number, position?: number, title?: string, html_url?: string }>,
 *     tip_head_branch: string,
 *     fetch_command: string,
 *     view_command: string
 *   }>
 * }} payload
 */
export function formatStacksListHuman(payload) {
  const lines = [];
  lines.push(
    chalk.bold.cyan(`Stacks in ${payload.repo_full_name}`) +
      chalk.dim(
        ` · scanned ${payload.scanned_open_prs} open PR(s)${payload.open_prs_truncated ? " (truncated — increase --max-open-prs)" : ""}`
      )
  );
  lines.push(chalk.dim(`Found ${payload.stacks_found} stack(s) with .nugit/stack.json on a PR head`));
  lines.push("");
  if (payload.stacks.length === 0) {
    lines.push(chalk.dim("  (none — stacks appear after authors commit stack.json on stacked branches)"));
    return lines.join("\n");
  }
  for (const s of payload.stacks) {
    lines.push(chalk.bold(`Tip PR #${s.tip_pr_number}`) + chalk.dim(` · ${s.pr_count} PR(s) · by ${s.created_by}`));
    lines.push(chalk.dim(`  branch ${s.tip_head_branch}`));
    for (const p of s.prs) {
      const raw = p.title != null ? String(p.title) : "";
      const tit = raw.length > 72 ? `${raw.slice(0, 71)}…` : raw;
      lines.push(
        `    ${chalk.bold("#" + p.pr_number)}${tit ? chalk.dim("  " + tit) : ""}`
      );
      if (p.html_url) {
        lines.push(`      ${chalk.blue.underline(String(p.html_url))}`);
      }
    }
    lines.push(chalk.dim(`  → ${s.view_command}`));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** @param {Record<string, unknown>} created */
export function formatPrCreatedHuman(created) {
  const num = created.number;
  const url = created.html_url ? String(created.html_url) : "";
  return [
    chalk.green("Opened pull request"),
    chalk.bold(`#${num}`),
    url ? chalk.blue.underline(url) : ""
  ]
    .filter(Boolean)
    .join(" ");
}

/** @param {Record<string, unknown>} result pat validation */
export function formatPatOkHuman(result) {
  const login = result.login ?? "?";
  return chalk.green("PAT OK — GitHub login ") + chalk.bold(String(login));
}
